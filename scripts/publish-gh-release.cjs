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
 *   3. Envia/atualiza os assets: MercadoFacil-Usuario-Setup-*.exe e
 *      apps/version.json. O instalador ADMIN NUNCA é espelhado aqui (release é
 *      pública): ele só sai do Storage pela Cloud Function baixarAppAdmin com
 *      token de uso curto — assets admin de releases antigos são REMOVIDOS.
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
  // PRIMEIRO busca pela tag: o POST cria um SEGUNDO release (até mesmo com a
  // tag já publicada — o GitHub aceita e retorna 201 com um rascunho novo),
  // o que duplicava o release e derrubava a verificação (asset de rascunho
  // dá 404 sem autenticação). Só cria rascunho se a tag não tiver release.
  const existente = await apiJson(token, 'GET', `/repos/${REPO}/releases/tags/${TAG}`);
  if (existente.status === 200 && existente.json?.id) {
    console.log(`[release] existente ${TAG} id=${existente.json.id} (reutilizada)`);
    return existente.json;
  }

  const dadosRelease = {
    tag_name: TAG,
    name: TAG,
    body:
      `### Mercado Fácil ${VERSION}\n\n` +
      `Instaladores gerados pelo pipeline e publicados também no Firebase Storage ` +
      `(fonte primária — botão "Baixar App"). Este Release é o espelho oficial para ` +
      `download direto sem custo de banda.\n\n` +
      `- **Usuário**: MercadoFacil-Usuario-Setup-${VERSION}.exe\n\n` +
      `O instalador **Admin** não é espelhado aqui (release pública): ele é ` +
      `distribuído apenas pelo sistema, com token de uso único.`,
    draft: true,
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
  throw new Error(
    `Não consegui criar o Release ${TAG} (create HTTP ${criado.status}).\n` +
    `create: ${criado.text.slice(0, 300)}`
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

// O instalador ADMIN nunca é espelhado no GitHub (a release é pública). Este
// passo remove assets admin de releases ANTIGAS que ainda estejam publicados —
// sem ele, a brecha de URL pública do exe admin continuaria de pé em releases
// anteriores mesmo com o script novo.
async function removerAssetsAdmin(token, releaseId) {
  const assets = await apiJson(token, 'GET', `/repos/${REPO}/releases/${releaseId}/assets`);
  if (assets.status !== 200) {
    console.warn(RED(`  ! não consegui listar assets para limpar o admin (HTTP ${assets.status}) — seguindo.`));
    return;
  }
  for (const a of assets.json || []) {
    if (!/^MercadoFacil-Admin-Setup-.+\.exe$/.test(a.name)) continue;
    const del = await apiDelete(token, `/repos/${REPO}/releases/assets/${a.id}`);
    if (del.status === 204) {
      console.log(`  - asset admin removido: ${a.name} (${(a.size / 1024 / 1024).toFixed(1)} MB)`);
    } else {
      console.warn(RED(`  ! falha ao remover asset admin ${a.name} (HTTP ${del.status})`));
    }
  }
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
  if (exes.length < 1) {
    throw new Error(`Instalador não encontrado em dist-electron/ (achei ${exes.length}). Rode: npm run electron-build`);
  }
  const acharExe = (modo) => {
    // Versão EXATA de package.json — nunca "o maior": sort() lexicográfico
    // pegava Setup-1.0.9 em vez de Setup-1.0.10 e publicava o instalador antigo.
    const alvo = `MercadoFacil-${modo}-Setup-${VERSION}.exe`;
    if (!exes.includes(alvo)) {
      throw new Error(
        `Instalador ${alvo} não existe em dist-electron/ (achei ${exes.length}). Rode: npm run electron-build` +
        (exes.length ? `\nEncontrados: ${exes.join(', ')}` : '')
      );
    }
    return alvo;
  };

  // SEGURANÇA de pipeline: o Release vX só é publicado se a TAG vX JÁ EXISTE.
  // Criar a tag aqui (implicitamente, no POST do Release) faria o push da tag
  // disparar um SEGUNDO workflow Release completo (deploy duplo concorrente).
  // workflow_dispatch e push v* usam o MESMO guard — tag ausente = erro claro.
  const refCheck = await apiJson(token, 'GET', `/repos/${REPO}/git/ref/tags/${TAG}`);
  if (refCheck.status !== 200) {
    throw new Error(
      `Tag ${TAG} não existe no repositório. Crie-a explicitamente (git tag v${VERSION} && git push origin v${VERSION}) ` +
      `— publicar Release sem a tag dispararia deploy duplo. (HTTP ${refCheck.status})`
    );
  }

  const versaoJson = Buffer.from(JSON.stringify({
    version: VERSION,
    releasedAt: new Date().toISOString(),
    webUrl: 'https://mercado-facil-mt.web.app',
  }, null, 2));

  const assets = [
    { name: acharExe('Usuario'), buf: fs.readFileSync(path.join(dir, acharExe('Usuario'))) },
    // Admin NÃO entra: release pública, exe admin só pelo sistema (token).
    { name: 'version.json', buf: versaoJson },
  ];

  console.log(`[github] publicando ${REPO} ${TAG} no GitHub Releases...`);
  const release = await obterOuCriarRelease(token);
  await removerAssetsAdmin(token, release.id);
  const links = [];
  for (const { name, buf } of assets) {
    const asset = await garantirAsset(token, release.id, name, buf);
    links.push(asset.browser_download_url);
    console.log(`  ${GREEN('OK')} ${name} <- ${(buf.length / 1024 / 1024).toFixed(1)} MB ${asset.browser_download_url}`);
  }

  // Verificação em duas camadas: 1) API (tamanho/state do asset — vale para
  // rascunho E publicado; o Bearer é rejeitado em github.com por isso não dá
  // pra checar rascunho via link público); 2) em release PUBLICADA, também o
  // HEAD anônimo do browser_download_url (é exatamente o link que o sistema
  // usa em urlPreferencialDownload).
  let tudoOk = true;
  const listaAssets = await apiJson(token, 'GET', `/repos/${REPO}/releases/${release.id}/assets`);
  for (let i = 0; i < assets.length; i++) {
    const esperado = assets[i].buf.length;
    const a = (listaAssets.json || []).find((x) => x.name === assets[i].name);
    let ok = !!a && a.size === esperado && a.state === 'uploaded';
    let det = ok ? 'API: tamanho/state ok' : 'API: asset ausente ou tamanho divergente';
    if (ok && !release.draft) {
      try {
        const r = await fetch(links[i], { method: 'HEAD' });
        const tamanho = Number(r.headers.get('content-length'));
        ok = r.status === 200 && tamanho === esperado;
        det = `HTTP ${r.status}, ${(tamanho / 1024 / 1024).toFixed(1)} MB público vs ${(esperado / 1024 / 1024).toFixed(1)} MB local`;
      } catch (e) {
        ok = false;
        det = e.message;
      }
    }
    console.log(`  ${ok ? GREEN('OK') : RED('FALHOU')} verificação ${assets[i].name} (${det})`);
    if (!ok) tudoOk = false;
  }
  if (!tudoOk) {
    throw new Error('Falha na verificação dos assets do GitHub Release.');
  }
  // Publicação final: o status rascunho só sai depois que cada asset passou pela
  // verificação end-to-end. Antes (draft:false na criação) uma falha no meio
  // deixava Release pública com asset faltando/corrompido.
  const pub = await apiJson(token, 'PATCH', `/repos/${REPO}/releases/${release.id}`, { draft: false });
  if (pub.status !== 200 && pub.status !== 201) {
    throw new Error(`Falha ao publicar a Release ${TAG} (HTTP ${pub.status}): ${pub.text.slice(0, 300)}`);
  }
  console.log(GREEN(`\nGitHub Releases ${TAG} publicado e verificado (${assets.length} assets).`));
}

main().catch((e) => { console.error(RED('ERRO:'), e.message); process.exit(1); });