/**
 * Gera os executáveis do Mercado Fácil (setup.exe) — versões Usuário e Admin.
 *
 * Uso:
 *   node scripts/build-exe.mjs          → gera as DUAS versões
 *   node scripts/build-exe.mjs --user   → apenas a versão Usuário
 *   node scripts/build-exe.mjs --admin  → apenas a versão Administrador
 *
 * Fluxo:
 *   1. Gera o bundle do Vite em dist/ (o deploy web continua usando build/).
 *   2. Define APP_MODE (admin|user) — o desktop/main.js usa para o título e a
 *      URL inicial (/?mode=admin|user).
 *   3. Chama o electron-builder com a config específica de cada versão.
 *
 * Depois de gerar, publique os .exe no Firebase Storage em:
 *   apps/MercadoFacil-Usuario-Setup.exe   e   apps/MercadoFacil-Admin-Setup.exe
 * O botão "Baixar App" do sistema gera o link automaticamente.
 */
import { spawnSync } from 'node:child_process';
import { build } from 'electron-builder';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
process.chdir(root);

const args = process.argv.slice(2);
const soUsuario = args.includes('--user');
const soAdmin = args.includes('--admin');

const rodar = (cmd, argsList) => {
  const r = spawnSync(cmd, argsList, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`[build-exe] Falha no comando: ${cmd} ${argsList.join(' ')}`);
    process.exit(r.status || 1);
  }
};

console.log('[build-exe] Gerando bundle web em dist/ (para o Electron)...');
// base='./' é obrigatório no Electron: o app carrega dist/index.html pelo
// protocolo file:// (win.loadFile). Com o padrão '/', o /assets/index-*.js
// resolveria para file:///C:/assets/... (raiz do disco) e a janela abre em
// BRANCO. Caminhos relativos fazem os chunks e o CSS carregarem do asar.
rodar(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build', '--outDir', 'dist', '--base=./']);

const modos = soUsuario ? ['user'] : soAdmin ? ['admin'] : ['user', 'admin'];

for (const modo of modos) {
  process.env.APP_MODE = modo;
  // BUGFIX (portátil = tela branca no app ADMIN): o process.env do build NÃO
  // sobrevive ao empacotamento — no computador do usuário APP_MODE é indefinido
  // e o desktop/main.js caía sempre em modo 'user' (ou, com dist corrompido,
  // numa janela em branco). Grava o modo num arquivo que entra no asar
  // (desktop/**/* está nas duas configs) e o main.js o lê em runtime.
  const modoFile = path.join(root, 'desktop', 'app-mode.txt');
  fs.writeFileSync(modoFile, `${modo}\n`, 'utf-8');
  console.log(`[build-exe] Modo "${modo}" embutido em desktop/app-mode.txt`);
  const config = modo === 'admin' ? 'electron-builder.admin.yml' : 'electron-builder.user.yml';
  console.log(`\n[build-exe] Empacotando versão ${modo.toUpperCase()}...`);
  try {
    await build({ config, publish: 'never' });
    console.log(`[build-exe] OK — versão ${modo.toUpperCase()} gerada em dist-electron/`);
  } catch (e) {
    console.error(`[build-exe] Erro na versão ${modo}:`, e.message || e);
    process.exit(1);
  }
}

console.log('\n[build-exe] Concluído! Publique os arquivos no Firebase Storage:');
console.log('  - dist-electron/MercadoFacil-Usuario-Setup-*.exe  → apps/MercadoFacil-Usuario-Setup.exe');
console.log('  - dist-electron/MercadoFacil-Admin-Setup-*.exe    → apps/MercadoFacil-Admin-Setup.exe');
