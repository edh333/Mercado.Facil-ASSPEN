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
rodar(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build', '--outDir', 'dist']);

const modos = soUsuario ? ['user'] : soAdmin ? ['admin'] : ['user', 'admin'];

for (const modo of modos) {
  process.env.APP_MODE = modo;
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
