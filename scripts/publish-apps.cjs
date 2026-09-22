/**
 * Publica os instaladores .exe e o manifest version.json no Firebase Storage.
 *
 * DEFINITIVO (sem credenciais adicionais):
 * A pasta apps/ do Storage só aceita escrita de ADMIN (storage.rules → isAdmin()).
 * Em vez de depender de senha de conta admin no .env, este script reutiliza a
 * MESMA sessão Google que o Firebase CLI já usa no deploy (firebase login):
 *   - Lê o refresh token do owner em ~/.config/configstore/firebase-tools.json;
 *   - Troca por um access_token (endpoint público do Google, client id/secret
 *     do próprio firebase-tools 15.x — open source);
 *   - Faz UPLOAD RESUMABLE no Google Cloud Storage (storage.googleapis.com),
 *     igual o `firebase deploy` faz com o Hosting. Por ser o OWNER do projeto,
 *     as Security Rules NÃO barram — sem usuário temporário, sem 403.
 *
 * Fluxo:
 *   1. Auto-descoberta da sessão autenticada do Firebase CLI (várias contas).
 *   2. Renova o access token do owner via refresh_token.
 *   3. Envia instaladores canônicos (Usuário e Admin) + apps/version.json
 *      (nomes canônicos — a versão antiga é sobrescrita automaticamente).
 *   4. Verifica tudo: metadados no GCS e, ao final, leitura pública real pelo
 *      mesmo link que o botão "Baixar App" usa (firebasestorage.googleapis.com,
 *      HEAD com Content-Length vs. tamanho do arquivo local).
 *
 * Requisitos:
 *   - Firebase CLI logado na conta dona do projeto (`firebase login` — o mesmo
 *     exigido pelo deploy.bat). Nunca usa credenciais de usuário do sistema.
 *   - dist-electron/MercadoFacil-Usuario-Setup-*.exe e Admin no padrão do
 *     electron-builder (artifactName → "MercadoFacil-{Usuario,Admin}-Setup-${version}.exe").
 *
 * Uso: node scripts/publish-apps.cjs      (ou npm run publish:apps)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;

const BUCKET = (() => {
  try {
    const envRaw = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8');
    const linha = envRaw.split(/\r?\n/).find((l) => l.startsWith('VITE_FIREBASE_STORAGE_BUCKET='));
    const v = linha?.split('=').slice(1).join('=').trim();
    if (v) return v;
  } catch { /* .env ausente — usa padrão */ }
  return 'mercado-facil-mt.firebasestorage.app';
})();

// Client id/secret PÚBLICOS embutidos no firebase-tools 15.x (lib/api.js) —
// usados apenas para renovar o token do próprio usuário logado no CLI.
const GOOGLE_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const CONFIGSTORE = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const WEB_URL = 'https://mercado-facil-mt.web.app';

const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version;
const EXE_PATTERN = /^MercadoFacil-(Usuario|Admin)-Setup-(.+)\.exe$/;

// ── 1) Sessão do Firebase CLI ────────────────────────────────────────────
function localizarRefreshToken() {
  // CI (GitHub Actions): não existe ~/.config/configstore lá — o token vem do
  // secret. `firebase login:ci` emite um refresh_token OAuth, que este script
  // troca pelo mesmo endpoint público usado nos fluxos interativos.
  if (process.env.FIREBASE_REFRESH_TOKEN) {
    return { refreshToken: process.env.FIREBASE_REFRESH_TOKEN, conta: 'ci (FIREBASE_REFRESH_TOKEN)' };
  }
  if (process.env.FIREBASE_TOKEN) {
    return { refreshToken: process.env.FIREBASE_TOKEN, conta: 'ci (FIREBASE_TOKEN)' };
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIGSTORE, 'utf-8'));
  } catch {
    throw new Error(
      'Sessão do Firebase CLI não encontrada (' + CONFIGSTORE + ').\n' +
      'Rode `firebase login` (mesma conta que faz o deploy.bat) e tente de novo.'
    );
  }
  const tokens = [];
  if (cfg.user?.tokens?.refresh_token) tokens.push(cfg.user.tokens.refresh_token);
  if (cfg.tokens?.refresh_token) tokens.push(cfg.tokens.refresh_token);
  for (const a of cfg.additionalAccounts || []) {
    if (a.user?.tokens?.refresh_token) tokens.push(a.user.tokens.refresh_token);
  }
  if (tokens.length === 0) {
    throw new Error('Nenhum refresh_token na sessão do Firebase CLI. Rode `firebase login` novamente.');
  }
  return { refreshToken: tokens[0], conta: cfg.user?.email || cfg.activeAccounts?.default || 'desconhecida' };
}

// ── 2) Access token (refresh) ────────────────────────────────────────────
async function obterAccessToken() {
  const { refreshToken, conta } = localizarRefreshToken();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status !== 200 || !json.access_token) {
    throw new Error(`Falha ao renovar o token do Firebase CLI (HTTP ${res.status}): ${JSON.stringify(json).slice(0, 200)}`);
  }
  console.log(`[auth] sessão do Firebase CLI ok (conta: ${conta}) — publicando v${VERSION}`);
  return json.access_token;
}

// ── 3) Upload resumable no GCS (storage.googleapis.com — owner ignora Rules) ─
async function uploadResumable(token, dest, data, contentType) {
  const initRes = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(BUCKET)}/o?uploadType=resumable&name=${encodeURIComponent(dest)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': contentType,
        'X-Upload-Content-Length': String(data.length),
      },
      body: '{}',
    }
  );
  if (initRes.status !== 200) {
    const corpo = await initRes.text();
    throw new Error(`Falha ao iniciar upload de ${dest} (HTTP ${initRes.status}): ${corpo.slice(0, 200)}`);
  }
  const location = initRes.headers.get('location');
  if (!location) throw new Error(`Sem URI de upload para ${dest}.`);

  const up = await fetch(location, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(data.length),
      'Content-Range': `bytes 0-${data.length - 1}/${data.length}`,
    },
    body: data,
  });
  if (up.status !== 200) {
    const corpo = await up.text();
    throw new Error(`Upload de ${dest} falhou (HTTP ${up.status}): ${corpo.slice(0, 200)}`);
  }
}

// ── 4) Verificação ───────────────────────────────────────────────────────
async function metadadosGcs(token, dest) {
  const r = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(BUCKET)}/o/${encodeURIComponent(dest)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const j = await r.json().catch(() => ({}));
  return { status: r.status, size: Number(j.size), name: j.name };
}

// Leitura pública PELO MESMO link que o "Baixar App" usa (end-to-end real).
async function tamanhoPublico(dest) {
  const enc = dest.split('/').map(encodeURIComponent).join('%2F');
  const r = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(BUCKET)}/o/${enc}?alt=media`,
    { method: 'HEAD' }
  );
  return { status: r.status, length: Number(r.headers.get('content-length')) };
}

async function main() {
  const token = await obterAccessToken();

  const exes = fs.readdirSync(path.join(ROOT, 'dist-electron')).filter((f) => EXE_PATTERN.test(f));
  const acharExe = (modo) => {
    const f = exes.filter((x) => x.startsWith(`MercadoFacil-${modo}-Setup-`)).sort().pop();
    if (!f) throw new Error(`Instalador da versão ${modo} não encontrado em dist-electron/. Rode: npm run electron-build`);
    return f;
  };

  const uploads = [
    { local: path.join(ROOT, 'dist-electron', acharExe('Usuario')), dest: 'apps/MercadoFacil-Usuario-Setup.exe', ct: 'application/octet-stream' },
    { local: path.join(ROOT, 'dist-electron', acharExe('Admin')), dest: 'apps/MercadoFacil-Admin-Setup.exe', ct: 'application/octet-stream' },
    { local: null, dest: 'apps/version.json', ct: 'application/json; charset=UTF-8', json: { version: VERSION, releasedAt: new Date().toISOString(), webUrl: WEB_URL } },
  ];

  console.log('[upload] GCS resumable (sessão do dono do projeto):');
  for (const u of uploads) {
    const data = u.json ? Buffer.from(JSON.stringify(u.json, null, 2)) : fs.readFileSync(u.local);
    await uploadResumable(token, u.dest, data, u.ct);
    console.log(`  ${GREEN('OK')} ${u.dest} <- ${u.local ? path.basename(u.local) : 'version.json'} (${(data.length / 1024 / 1024).toFixed(1)} MB)`);
  }

  console.log('\n[verificacao] integridade no GCS + link público real:');
  let todosOk = true;
  for (const u of uploads) {
    const espera = u.local ? fs.statSync(u.local).size : null;
    const meta = await metadadosGcs(token, u.dest);
    const metaOk = meta.status === 200 && meta.name === u.dest && (espera == null || meta.size === espera);
    const pub = await tamanhoPublico(u.dest);
    const pubOk = espera == null ? pub.status === 200 && pub.length > 0 : pub.status === 200 && pub.length === espera;
    console.log(`  ${(metaOk && pubOk ? GREEN('OK') : RED('FALHOU'))} ${u.dest} (GCS ${meta.size ?? '?'}/${espera ?? 'manifest'}, público ${pub.length ?? '?'} bytes)`);
    if (!metaOk || !pubOk) todosOk = false;
  }

  if (!todosOk) {
    console.error(RED('\nERRO: falha na publicação ou verificação. Revise a saída acima.'));
    process.exit(1);
  }
  console.log(GREEN(`\nPublicação concluída e verificada! "Baixar App" e a Landing já servem os instaladores v${VERSION}.`));
}

main().catch((e) => { console.error(RED('ERRO:'), e.message); process.exit(1); });