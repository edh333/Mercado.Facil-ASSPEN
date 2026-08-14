/**
 * Publica os instaladores .exe e o manifest version.json no Firebase Storage.
 *
 * Fluxo:
 *   1. Cria um usuário temporário via Firebase Auth REST (idToken passa pelas
 *      Storage Rules — não depende de IAM/service account nem de chaves no repo).
 *   2. Envia os instaladores canônicos (Usuário e Admin) + apps/version.json
 *      (nomes canônicos — a versão antiga é sobrescrita automaticamente).
 *   3. Remove o usuário temporário.
 *   4. Verifica publicamente (GET direto, sem autenticação) cada arquivo:
 *      status 200 e tamanho exato. O link de download do usuário é gerado pela
 *      Cloud Function obterLinkDownloadApp (assinado por 7 dias).
 *
 * Requisitos:
 *   - .env com VITE_FIREBASE_API_KEY e VITE_FIREBASE_STORAGE_BUCKET
 *   - dist-electron/MercadoFacil-Usuario-Setup-*.exe e Admin no padrão do
 *     electron-builder (artifactName → "MercadoFacil-{Usuario,Admin}-Setup-${version}.exe")
 *
 * Uso: node scripts/publish-apps.cjs      (ou npm run publish:apps)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const envRaw = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8');
const kv = (k) => envRaw.split(/\r?\n/).find((l) => l.startsWith(k + '='))?.split('=').slice(1).join('=').trim();
const API_KEY = kv('VITE_FIREBASE_API_KEY');
const BUCKET = kv('VITE_FIREBASE_STORAGE_BUCKET') || 'mercado-facil-mt.firebasestorage.app';
const WEB_URL = 'https://mercado-facil-mt.web.app';
if (!API_KEY) throw new Error('VITE_FIREBASE_API_KEY ausente no .env.');

const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version;
const EXE_PATTERN = /^MercadoFacil-(Usuario|Admin)-Setup-(.+)\.exe$/;
const HOST = 'firebasestorage.googleapis.com';
const ENC_BUCKET = encodeURIComponent(BUCKET);

const EMAIL = `deploy-${Date.now()}@publish.local`;
const PASSWORD = 'Aa' + Math.random().toString(36).slice(2) + 'X9!';

function request(host, pathname, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host, path: pathname, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        try { resolve({ status: res.statusCode, body: JSON.parse(buf.toString()), raw: buf }); }
        catch { resolve({ status: res.statusCode, body: buf.toString(), raw: buf }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  // 1) Usuário temporário
  const signup = await request('identitytoolkit.googleapis.com', `/v1/accounts:signUp?key=${encodeURIComponent(API_KEY)}`, 'POST',
    { 'Content-Type': 'application/json' },
    JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }));
  const idToken = signup.body?.idToken;
  if (!idToken) throw new Error('Falha ao criar usuário temporário: ' + JSON.stringify(signup.body).slice(0, 200));
  console.log(`[auth] usuário temporário autenticado (publicação v${VERSION})`);

  const hAuth = { Authorization: `Bearer ${idToken}`, 'X-Firebase-Storage-Version': '2' };

  // 2) Localiza os instaladores recém-gerados (mais recentes, por padrão do artifactName)
  const exes = fs.readdirSync(path.join(ROOT, 'dist-electron')).filter((f) => EXE_PATTERN.test(f));
  const acharExe = (modo) => {
    const f = exes.filter((x) => x.startsWith(`MercadoFacil-${modo}-Setup-`)).sort().pop();
    if (!f) throw new Error(`Instalador da versão ${modo} não encontrado em dist-electron/. Rode: npm run build:exe:${modo.toLowerCase()}`);
    return f;
  };

  const uploads = [
    { local: path.join(ROOT, 'dist-electron', acharExe('Usuario')), dest: 'apps/MercadoFacil-Usuario-Setup.exe' },
    { local: path.join(ROOT, 'dist-electron', acharExe('Admin')), dest: 'apps/MercadoFacil-Admin-Setup.exe' },
    { local: null, dest: 'apps/version.json', json: { version: VERSION, releasedAt: new Date().toISOString(), webUrl: WEB_URL } },
  ];

  // 3) Uploads
  for (const u of uploads) {
    const data = u.json
      ? Buffer.from(JSON.stringify(u.json, null, 2))
      : fs.readFileSync(u.local);
    console.log(`[upload] ${u.local ? path.basename(u.local) : 'version.json'} (${(data.length / 1024 / 1024).toFixed(1)} MB) -> ${u.dest} (v${VERSION})`);
    const res = await request(HOST,
      `/v0/b/${ENC_BUCKET}/o?uploadType=media&name=${encodeURIComponent(u.dest)}&firebaseStorageDownloadTokens=${encodeURIComponent(idToken)}`,
      'POST', { ...hAuth, 'Content-Type': u.json ? 'application/json' : 'application/octet-stream' }, data);
    if (res.status === 200) {
      console.log(`  OK (tamanho: ${res.body?.size || data.length})`);
    } else {
      console.log(`  FALHOU (${res.status}): ${JSON.stringify(res.body).slice(0, 220)}`);
      process.exitCode = 1;
    }
  }

  // 4) Remove o usuário temporário
  try {
    await request('identitytoolkit.googleapis.com', `/v1/accounts:delete?key=${encodeURIComponent(API_KEY)}`, 'POST',
      { 'Content-Type': 'application/json' }, JSON.stringify({ idToken }));
    console.log('[auth] usuário temporário removido');
  } catch { /* não crítico */ }

  // 5) Verificação pública (metadados via GET aberto, sem autenticação)
  await sleep(1500);
  console.log('[verificacao] leitura pública de cada arquivo publicado:');
  let todosOk = !process.exitCode;
  for (const u of uploads) {
    const enc = u.dest.split('/').map(encodeURIComponent).join('%2F');
    const r = await request(HOST, `/v0/b/${ENC_BUCKET}/o/${enc}`, 'GET', {});
    const espera = u.json ? null : fs.statSync(u.local).size;
    const tamanhoOk = espera == null ? true : Number(r.body?.size) === espera;
    console.log(`  ${u.dest} -> ${r.status}${espera != null ? ` (${r.body?.size}/${espera} bytes)` : ''} ${r.status === 200 && tamanhoOk ? 'OK' : 'FALHOU'}`);
    if (r.status !== 200 || !tamanhoOk) todosOk = false;
  }

  if (!todosOk) {
    console.error('\nERRO: falha na publicação ou na verificação. Revise a saída acima.');
    process.exit(1);
  }
  console.log('\nPublicação concluída e verificada! "Baixar App" já serve os instaladores v' + VERSION + '.');
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });