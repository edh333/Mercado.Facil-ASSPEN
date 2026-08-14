/**
 * Publica os instaladores .exe no Firebase Storage (apps/).
 * Método comprovado: Firebase Auth REST (usuário temporário) + ID token faz o
 * upload passando pelas Storage Rules (request.auth != null).
 * Não depende de IAM/service account nem de chaves no repositório.
 *
 * Uso: node scripts/publish-apps.cjs
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const envRaw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
const kv = (k) => envRaw.split(/\r?\n/).find((l) => l.startsWith(k + '='))?.split('=').slice(1).join('=').trim();
const API_KEY = kv('VITE_FIREBASE_API_KEY');
const BUCKET = kv('VITE_FIREBASE_STORAGE_BUCKET') || 'mercado-facil-mt.firebasestorage.app';
if (!API_KEY) throw new Error('VITE_FIREBASE_API_KEY ausente no .env.');

const EMAIL = `deploy-${Date.now()}@publish.local`;
const PASSWORD = 'Aa' + Math.random().toString(36).slice(2) + 'X9!';

function request(host, pathname, method, headers, body, raw) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host, path: pathname, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (raw) return resolve({ status: res.statusCode, body: buf });
        try { resolve({ status: res.statusCode, body: JSON.parse(buf.toString()) }); }
        catch { resolve({ status: res.statusCode, body: buf.toString() }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  // 1) Cria usuário temporário
  const signup = await request(
    'identitytoolkit.googleapis.com',
    `/v1/accounts:signUp?key=${encodeURIComponent(API_KEY)}`,
    'POST',
    { 'Content-Type': 'application/json' },
    JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true })
  );
  const idToken = signup.body?.idToken;
  if (!idToken) throw new Error('Falha ao criar usuário temporário: ' + JSON.stringify(signup.body).slice(0, 200));
  console.log('[auth] usuário temporário criado (idToken ok)');

  const uploads = [
    { local: 'dist-electron/MercadoFacil-Usuario-Setup-1.0.0-STABLE.exe', dest: 'apps/MercadoFacil-Usuario-Setup.exe' },
    { local: 'dist-electron/MercadoFacil-Admin-Setup-1.0.0-STABLE.exe', dest: 'apps/MercadoFacil-Admin-Setup.exe' },
  ];

  const ok = [];
  for (const u of uploads) {
    const data = fs.readFileSync(u.local);
    console.log(`[upload] ${u.local} (${(data.length / 1024 / 1024).toFixed(1)} MB) -> ${u.dest}`);
    const res = await request(
      'firebasestorage.googleapis.com',
      `/v0/b/${encodeURIComponent(BUCKET)}/o?uploadType=media&name=${encodeURIComponent(u.dest)}&firebaseStorageDownloadTokens=${encodeURIComponent(idToken)}`,
      'POST',
      { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/octet-stream', 'X-Firebase-Storage-Version': '2' },
      data
    );
    if (res.status === 200) {
      console.log(`  OK (tamanho: ${res.body?.size || data.length})`);
      ok.push(u.dest);
    } else {
      console.log(`  FALHOU (${res.status}): ${JSON.stringify(res.body).slice(0, 220)}`);
    }
  }

  // 2) Remove o usuário temporário (com o próprio idToken)
  try {
    await request(
      'identitytoolkit.googleapis.com',
      `/v1/accounts:delete?key=${encodeURIComponent(API_KEY)}`,
      'POST',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ idToken })
    );
    console.log('[auth] usuário temporário removido');
  } catch { /* não crítico */ }

  if (ok.length !== uploads.length) {
    console.error(`\nERRO: apenas ${ok.length}/${uploads.length} arquivos enviados.`);
    process.exit(1);
  }
  console.log('\nUploads concluídos! O botão "Baixar App" já serve os instaladores atualizados.');
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });