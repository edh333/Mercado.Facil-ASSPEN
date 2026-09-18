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

console.log('[build-exe] Gerando bundle Electron em dist/ (caminhos RELATIVOS — obrigatório no file://)...');
// base='./' é obrigatório no Electron: o app carrega dist/index.html pelo
// protocolo file:// (win.loadFile). Com o padrão '/', o /assets/index-*.js
// resolveria para file:///C:/assets/... (raiz do disco) e a janela abre em
// BRANCO. Caminhos relativos fazem os chunks e o CSS carregarem do asar.
//
// Não usar "npm run build" aqui: a pasta build/ (web) usa base '/', que é
// OBRIGATÓRIO no FireHosting mas QUEBRA o app desktop. O script build:electron
// garante base './' sem depender do ordem em que as pastas são geradas.
rodar(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:electron']);

// Guarda contra regressão: o "criar-portatil.bat" (e qualquer robocopy de
// build/ -> dist/) sobrescreve dist/ com o bundle ABSOLUTO da web e o EXE
// volta a abrir em branco. Verifica aqui e para o build se isso acontecer.
{
  const indexPath = path.join(root, 'dist', 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.error('[build-exe] ERRO: dist/index.html não foi gerado pelo Vite.');
    process.exit(1);
  }
  const html = fs.readFileSync(indexPath, 'utf-8');
  // Caminho ABSOLUTO = <src|href>="/assets/... OU /qz-tray.js (sem o "./").
  // No padrão file:// isso quebra o carregamento e a janela abre em branco.
  const absolutos = html.match(/(?:src|href)="\/(?:assets|qz-tray)-?[^"]*"/g) || [];
  if (absolutos.length > 0) {
    console.error('[build-exe] ERRO: dist/index.html tem caminho(s) ABSOLUTO(S):', absolutos.join(', '));
    console.error('dist/ foi sobrescrito com o bundle web (build/). O Electron abriria em BRANCO. Rode de novo: npm run build:electron');
    process.exit(1);
  }
  console.log('[build-exe] OK — bundle Electron com caminhos relativos (seguro para o file://).');
}

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
