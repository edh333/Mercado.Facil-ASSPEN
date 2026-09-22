/**
 * Publica os instaladores .exe + version.json no GitHub Releases (espelho do
 * Firebase Storage). Mantém o Storage/Firebase como fonte PRIMÁRIA — este
 * script NÃO substitui o publish-apps.cjs, ele complementa: tira o download
 * dos instaladores da cota de egresso do Cloud Storage (100 GB/mês grátis),
 * publicando os MESMOS arquivos em um Release do GitHub (download ilimitado e
 * sem custo — o que mais estoura cota num POS é justamente o .exe de 72 MB).
 *
 * Fluxo:
 *   1. Lê a versão de package.json e exige os executáveis em dist-electron/.
 *   2. Garante o Release da tag v{version} (cria se não existir; senão reusa).
 *   3. Envia/atualiza os assets: MercadoFacil-Usuario-Setup-*.exe,
 *      MercadoFacil-Admin-Setup-*.exe e apps/version.json.
 *   4. Verifica cada asset pelo browser_download_url (HEAD real, compara size).
 *
 * Token (nesta ordem):
 *   - env GITHUB_TOKEN  (GitHub Actions — sempre disponível)
 *   - env GH_TOKEN
 *   - saída de `gh auth token`
 * Se nenhum token existir, mostra aviso e SAI COM SUCESSO (o Firebase continua
 * sendo a fonte primária, então GitHub Releases é opcional em dev local).
 * No CI, GITHUB_TOKEN sempre existe → falha é fatal (publicação comprometida).
 *
 * Uso: node scripts/publish-gh-release.cjs
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;

const API = 'https://api.github.com';
const UPLOADS = 'https://uploads.github.com';
const REPO = process.env.GITHUB_REPOSITORY || 'edh333/Mercado.Facil-ASSPEN';
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version;
const TAG = `v${VERSION}`;
const EXE_PATTERN = /^MercadoFacil-(Usuario|Admin)-Setup-(.+)\.exe$/;

async function obterToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    const t = execFileSync('gh', ['auth', 'token'], { encoding: 'utf-8', timeout: 10000 }).trim();
    if (t) return t;
  } catch { /* gh CLI ausente ou não autenticado */ }
  return null;
}

function headers(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mercado-facil-release',
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
  };
}

async function apiJson(token, metodo, caminho, corpo) {
  const r = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: headers(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(corpo),
  });
  const texto = await r.text();
  return { status: r.status, json: texto ? JSON.parse(texto) : null, text: texto };
}

async function apiDelete(token, caminho) {
  const r = await fetch(`${API}${caminho}`, { method: 'DELETE', headers: headers(token) });
  return { status: r.status, text: await r.text() };
}

// Upload de assets usa uploads.github.com DIRETO: o api.github.com não faz
// mais proxy desse endpoint (retorna 404) desde a troca de roteamento do
// GitHub. Listagem/deleção seguem em api.github.com (continuam funcionando).
async function apiUpload(token, caminho, buffer) {
  const r = await fetch(`${UPLOADS}${caminho}`, {
    method: 'POST',
    headers: headers(token, { 'Content-Type': 'application/octet-stream' }),
    body: buffer,
  });
  const texto = await r.text();
  return { status: r.status, json: texto ? JSON.parse(texto) : null, text: texto };
}

async function obterOuCriarRelease(token) {
  const dadosRelease = {
    tag_name: TAG,
    name: TAG,
    body:
      `### Mercado Fácil ${VERSION}\n\n` +
      `Instaladores gerados pelo pipeline e publicados também no Firebase Storage ` +
      `(fonte primária — botão "Baixar App"). Este Release é o espelho oficial para ` +
      `download direto sem custo de banda.\n\n` +
      `- **Usuário**: MercadoFacil-Usuario-Setup-${VERSION}.exe\n` +
      `- **Admin**: MercadoFacil-Admin-Setup-${VERSION}.exe`,
    draft: false,
    prerelease: false,
  };

  const criado = await apiJson(token, 'POST', `/repos/${REPO}/releases`, dadosRelease);
  if (criado.status === 201) {
    console.log(`[release] criada ${TAG} id=${criado.json.id}`);
    return criado.json;
  }
  if (criado.status >= 200 && criado.status < 300 && criado.json?.id) {
    console.log(`[release] criada ${TAG} id=${criado.json.id}`);
    return criado.json;
  }
  // Já existe (422 validation_failed/already_exists etc.) → busca pela tag.
  const existente = await apiJson(token, 'GET', `/repos/${REPO}/releases/tags/${TAG}`);
  if (existente.status === 200 && existente.json?.id) {
    console.log(`[release] existente ${TAG} id=${existente.json.id} (reutilizada)`);
    return existente.json;
  }
  throw new Error(
    `Não consegui criar/reusar o Release ${TAG} (create HTTP ${criado.status}, get HTTP ${existente.status}).\n` +
    `create: ${criado.text.slice(0, 300)}\nget: ${existente.text.slice(0, 300)}`
  );
}

async function garantirAsset(token, releaseId, nomeArquivo, buffer) {
  const assets = await apiJson(token, 'GET', `/repos/${REPO}/releases/${releaseId}/assets`);
  if (assets.status !== 200) {
    console.error(RED(`  ? listar assets failed (HTTP ${assets.status}): ${assets.text.slice(0, 200)}`));
  }
  const antigo = (assets.json || []).find((a) => a.name === nomeArquivo);
  if (antigo) {
    const del = await apiDelete(token, `/repos/${REPO}/releases/assets/${antigo.id}`);
    if (del.status !== 204) {
      console.warn(RED(`  ! falha ao remover asset antigo ${nomeArquivo} (HTTP ${del.status}) — seguindo.`));
    } else {
      console.log(`  - asset antigo ${nomeArquivo} removido (${(antigo.size / 1024 / 1024).toFixed(1)} MB)`);
    }
  }
  const up = await apiUpload(token, `/repos/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(nomeArquivo)}`, buffer);
  if (up.status !== 201) {
    throw new Error(`upload de ${nomeArquivo} falhou (HTTP ${up.status}): ${up.text.slice(0, 300)}`);
  }
  return up.json;
}

async function main() {
  const token = await obterToken();
  if (!token) {
    console.warn(
      RED('[github] sem token (GITHUB_TOKEN/GH_TOKEN/gh auth token) — pulando espelho ' +
        'no GitHub Releases. O Firebase continua sendo a fonte primária (aviso local; CI sempre tem token).')
    );
    return;
  }

  const dir = path.join(ROOT, 'dist-electron');
  const exes = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => EXE_PATTERN.test(f)) : [];
  if (exes.length < 2) {
    throw new Error(`Instaladores não encontrados em dist-electron/ (achei ${exes.length}). Rode: npm run electron-build`);
  }
  const acharExe = (modo) => exes.filter((x) => x.startsWith(`MercadoFacil-${modo}-Setup-`)).sort().pop();

  const versaoJson = Buffer.from(JSON.stringify({
    version: VERSION,
    releasedAt: new Date().toISOString(),
    webUrl: 'https://mercado-facil-mt.web.app',
  }, null, 2));

  const assets = [
    { name: acharExe('Usuario'), buf: fs.readFileSync(path.join(dir, acharExe('Usuario'))) },
    { name: acharExe('Admin'), buf: fs.readFileSync(path.join(dir, acharExe('Admin'))) },
    { name: 'version.json', buf: versaoJson },
  ];

  console.log(`[github] publicando ${REPO} ${TAG} no GitHub Releases...`);
  const release = await obterOuCriarRelease(token);
  const links = [];
  for (const { name, buf } of assets) {
    const asset = await garantirAsset(token, release.id, name, buf);
    links.push(asset.browser_download_url);
    console.log(`  ${GREEN('OK')} ${name} <- ${(buf.length / 1024 / 1024).toFixed(1)} MB ${asset.browser_download_url}`);
  }

  // Verificação end-to-end pelo link público real (GET/HEAD com size igual).
  let tudoOk = true;
  for (let i = 0; i < assets.length; i++) {
    const url = links[i];
    if (!url) { tudoOk = false; continue; }
    try {
      const r = await fetch(url, { method: 'HEAD' });
      const tamanho = Number(r.headers.get('content-length'));
      const esp = assets[i].buf.length;
      const ok = r.status === 200 && tamanho === esp;
      console.log(`  ${ok ? GREEN('OK') : RED('FALHOU')} verificação ${assets[i].name} (HTTP ${r.status}, ${(tamanho / 1024 / 1024).toFixed(1)} MB local vs esperado ${(esp / 1024 / 1024).toFixed(1)} MB)`);
      if (!ok) tudoOk = false;
    } catch (e) {
      console.error(RED(`  FALHOU verificação ${assets[i].name}: ${e.message}`));
      tudoOk = false;
    }
  }
  if (!tudoOk) {
    throw new Error('Falha na verificação dos assets do GitHub Release.');
  }
  console.log(GREEN(`\nGitHub Releases ${TAG} publicado e verificado (${assets.length} assets).`));
}

main().catch((e) => { console.error(RED('ERRO:'), e.message); process.exit(1); });