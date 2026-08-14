/**
 * Pipeline profissional de release do Mercado Fácil.
 *
 * Executa em ordem, com verificação em cada etapa:
 *   1. Build da aplicação web (Vite → build/)
 *   2. Deploy no Firebase (hosting + firestore + storage + functions)
 *   3. Geração dos instaladores Windows (Usuário e Admin)
 *   4. Publicação dos instaladores + version.json no Firebase Storage
 *
 * Pré-requisitos:
 *   - Firebase CLI autenticado (firebase login) no projeto mercado-facil-mt
 *   - .env na raiz com as variáveis VITE_FIREBASE_*
 *
 * Uso:
 *   node scripts/release.mjs            → release completo
 *   node scripts/release.mjs --web      → apenas build + deploy web/rules/functions
 *   node scripts/release.mjs --apps     → apenas instaladores + Storage
 *
 * Para versionar: npm version patch|minor|major (cria tag git) e depois rode o release.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
process.chdir(root);

const args = process.argv.slice(2);
const soWeb = args.includes('--web');
const soApps = args.includes('--apps');
const completo = !soWeb && !soApps;

const VERSION = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(path.join(root, 'package.json'), 'utf-8'))).version;
console.log(`\n═══════════════════════════════════════════════════════════`);
console.log(`   RELEASE Mercado Fácil — v${VERSION}`);
console.log(`═══════════════════════════════════════════════════════════\n`);

const rodar = (cmd, argsList, { fatal = true } = {}) => {
  const r = spawnSync(cmd, argsList, { stdio: 'inherit', shell: process.platform === 'win32' });
  const ok = r.status === 0;
  if (!ok && fatal) {
    console.error(`\n[release] FALHOU: ${cmd} ${argsList.join(' ')}`);
    process.exit(r.status || 1);
  }
  return ok;
};

const hora = () => new Date().toLocaleTimeString('pt-BR', { hour12: false });

// ═══ Etapa 1: Build web ═══
if (completo || soWeb) {
  console.log(`[${hora()}] 1/4 — Build da aplicação web (Vite → build/)`);
  rodar(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
}

// ═══ Etapa 2: Deploy Firebase ═══
if (completo || soWeb) {
  console.log(`[${hora()}] 2/4 — Deploy Firebase (hosting, firestore, storage, functions)`);
  rodar(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['firebase', 'deploy', '--only', 'hosting,firestore,storage,functions']);
}

// ═══ Etapa 3: Instaladores ═══
if (completo || soApps) {
  console.log(`[${hora()}] 3/4 — Gerando instaladores Windows v${VERSION} (Usuário + Admin)`);
  rodar(process.platform === 'win32' ? 'node.exe' : 'node', ['scripts/build-exe.mjs']);
}

// ═══ Etapa 4: Publicação no Storage ═══
if (completo || soApps) {
  console.log(`[${hora()}] 4/4 — Publicando instaladores + version.json no Firebase Storage`);
  rodar(process.platform === 'win32' ? 'node.exe' : 'node', ['scripts/publish-apps.cjs']);
}

console.log(`\n═══════════════════════════════════════════════════════════`);
console.log(`   RELEASE v${VERSION} CONCLUÍDO — ${hora()}`);
console.log(`   Web:     https://mercado-facil-mt.web.app`);
console.log(`   Versões: Usuário (apps/MercadoFacil-Usuario-Setup.exe) e Admin`);
console.log(`═══════════════════════════════════════════════════════════\n`);