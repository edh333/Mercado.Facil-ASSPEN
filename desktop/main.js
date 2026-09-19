const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { pathToFileURL } = require('url');

// Modo do app definido no momento do build:
//   APP_MODE=user  → Mercado Fácil - Usuário (compras dos familiares)
//   APP_MODE=admin → Mercado Fácil - Administrador (painel completo)
//
// BUGFIX (tela em branco no app admin): o process.env do processo do build
// NÃO é herdado pelo executável final — no computador do usuário
// process.env.APP_MODE é sempre indefinido, então o app caía em modo 'user'.
// O build-exe.mjs agora grava o modo em desktop/app-mode.txt (empacotado no
// asar) e o ler aqui tem prioridade sobre qualquer variável de ambiente.
function obterModoApp() {
  try {
    const arquivo = path.join(__dirname, 'app-mode.txt');
    const conteudo = fs.readFileSync(arquivo, 'utf-8').trim();
    if (conteudo === 'admin') return 'admin';
    if (conteudo === 'user') return 'user';
  } catch { /* arquivo ausente — segue para o fallback */ }
  return process.env.APP_MODE === 'admin' ? 'admin' : 'user';
}

const APP_MODE = obterModoApp();
const APP_TITLE = APP_MODE === 'admin'
  ? 'Mercado Fácil - Administrador'
  : 'Mercado Fácil - Usuário';

// Manifest público de versões (Firebase Storage) — usado para avisar de atualizações.
const VERSION_URL = 'https://firebasestorage.googleapis.com/v0/b/mercado-facil-mt.firebasestorage.app/o/apps%2Fversion.json?alt=media';
const WEB_URL = 'https://mercado-facil-mt.web.app';

const compararVersoes = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0, vb = pb[i] || 0;
    if (va !== vb) return va > vb ? 1 : -1;
  }
  return 0;
};

// Página de recuperação (HTML puro, sem JS) exibida quando o app não carrega
// nem do bundle local nem da internet — o operador vê instruções claras em vez
// de uma janela em branco (bug reportado: "app do admin abre em branco").
function paginaDeErro(detalhe) {
  const detalheLimpo = String(detalhe || '').replace(/</g, '&lt;').replace(/\n/g, '<br/>');
  return `<meta charset="utf-8"><body style="margin:0;background:#0f172a;color:#f8fafc;font-family:Segoe UI,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="max-width:520px;padding:36px;text-align:center;">
  <div style="width:64px;height:64px;border-radius:20px;background:#334155;margin:0 auto 22px;display:flex;align-items:center;justify-content:center;font-size:30px;">⚠️</div>
  <h2 style="margin:0 0 10px;font-size:22px;">Mercado Fácil não pôde abrir</h2>
  <p style="margin:0 0 6px;color:#94a3b8;font-size:14px;line-height:1.6;">O conteúdo local não carregou e este computador não está conectado à internet para usar a versão online.</p>
  <p style="margin:0 0 24px;color:#64748b;font-size:12px;line-height:1.6;">${detalheLimpo}</p>
  <button onclick="location.reload()" style="background:#10b981;color:#0f172a;border:0;border-radius:14px;padding:14px 28px;font-size:14px;font-weight:800;cursor:pointer;">Tentar novamente</button>
</div></body>`;
}

// Verifica periodicamente se há nova versão publicada (apps/version.json).
function checarAtualizacao(win) {
  if (!app.isPackaged) return;
  const req = https.get(VERSION_URL, { timeout: 8000 }, (res) => {
    let data = '';
    res.on('data', (c) => (data += c));
    res.on('end', () => {
      try {
        const manifest = JSON.parse(data);
        const atual = app.getVersion();
        if (manifest?.version && compararVersoes(manifest.version, atual) > 0 && !win.isDestroyed()) {
          dialog.showMessageBox(win, {
            type: 'info',
            title: 'Nova versão disponível',
            message: `Mercado Fácil atualizado!`,
            detail: `A versão ${manifest.version} está disponível (você está na ${atual}).\n\nBaixe o novo instalador diretamente do sistema (Use a opção "Baixar App") e substitua o atual.`,
            buttons: ['Abrir site para baixar', 'Agora não'],
            defaultId: 0,
            cancelId: 1,
          }).then(({ response }) => {
            if (response === 0) shell.openExternal(WEB_URL);
          });
        }
      } catch { /* manifest inválido — ignora silenciosamente */ }
    });
  });
  req.on('error', () => { /* sem internet/bloqueio — ignora */ });
  req.on('timeout', () => req.destroy());
  setTimeout(() => checarAtualizacao(win), 6 * 60 * 60 * 1000); // re-checa a cada 6h
}

// Configurar Portabilidade Real (Dados no Pendrive)
if (app.isPackaged) {
  const portablePath = path.join(path.dirname(process.execPath), 'mercado_facil_data');
  if (!fs.existsSync(portablePath)) {
    fs.mkdirSync(portablePath, { recursive: true });
  }
  app.setPath('userData', portablePath);
}

// Cria (ou garante) o atalho do app na Área de Trabalho do Windows.
// O alvo é PORTABLE — o instalador Windows não usa MSI/NSIS, então NENHUM
// atalho é criado sozinho (bug reportado: "o app admin não criou ícone").
// Ícone: tenta o embutido no asar; senão usa o próprio .exe (sempre tem ícone).
function criarAtalhoDesktop() {
  const { execFileSync } = require('child_process');
  const desktopPath = path.join(require('os').homedir(), 'Desktop');
  const exeDir = path.dirname(process.execPath);
  const iconEmbarcado = path.join(exeDir, 'resources', 'app.asar.unpacked', 'public', 'logo.png');
  const iconPath = fs.existsSync(iconEmbarcado) ? iconEmbarcado : process.execPath;
  const shortcutPath = path.join(desktopPath, `${APP_TITLE}.lnk`);
  const psScript = `
    $WS = New-Object -ComObject WScript.Shell;
    $SC = $WS.CreateShortcut($args[0]);
    $SC.TargetPath = $args[1];
    $SC.IconLocation = $args[2];
    $SC.Save();
  `;
  // execFileSync SEM shell: nenhum caractere (aspas, $(), crases) do caminho
  // é interpretado por um shell — impossível injeção de comando.
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript, shortcutPath, process.execPath, iconPath],
    { timeout: 10000 }
  );
  return shortcutPath;
}

// Atalho automático na PRIMEIRA execução de cada versão instalada: depois de
// instalar o app, o operador já tem o ícone na Área de Trabalho para abrir.
// O marcador ("atalho-{versao}.ok") fica na pasta de dados do próprio app:
// nova versão → novo marcador → atalho recriado apontando para o exe novo.
function criarAtalhoSeNecessario() {
  if (!app.isPackaged) return;
  try {
    const marcador = path.join(app.getPath('userData'), `atalho-${app.getVersion()}.ok`);
    if (fs.existsSync(marcador)) return;
    criarAtalhoDesktop();
    fs.writeFileSync(marcador, new Date().toISOString());
  } catch (e) {
    console.error('[main] Não foi possível criar o atalho automático:', e?.message || e);
  }
}

function createWindow() {
  // Janela bem ajustada ao monitor do PDV: nunca maior que a área de trabalho
  // disponível, sem estourar telas menores (alguns computadores são 1366x768
  // ou 1024x768). Tamanho de conteúdo, centralizada e com fundo escuro para
  // evitar o "flash branco" antes do React montar.
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1280, Math.max(800, wa.width));
  const height = Math.min(800, Math.max(620, wa.height));
  const win = new BrowserWindow({
    width,
    height,
    minWidth: Math.min(1024, wa.width),
    minHeight: Math.min(660, wa.height),
    useContentSize: true,
    center: true,
    show: false,
    backgroundColor: '#0f172a',
    title: APP_TITLE,
    icon: path.join(__dirname, '../public/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Renderer NÃO tem acesso ao Node: tudo via electronAPI do preload.
      // (Zero uso de require/process no src — verificado. XSS futuro não vira RCE.)
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });

  // ── ANTI-TELA-EM-BRANCO ──────────────────────────────────────────────
  // O SPA pode carregar o HTML mas falhar silenciosamente no JS (CSP, chunk
  // corrompido, cache velho). Nada disso lança erro no loadFile → capturamos
  // did-fail-load/did-finish-load e, se o #root não renderizar, caímos para a
  // versão web; se até ela falhar, mostramos uma tela de recuperação visível.
  // Assim o operador NUNCA vê uma janela vazia sem saber o que fazer.
  const carregarWebFallback = () => {
    if (win.isDestroyed()) return;
    win.loadURL(`${WEB_URL}/?mode=${APP_MODE}`).catch((e) => {
      if (win.isDestroyed()) return;
      const errPage = paginaDeErro(`Não foi possível carregar o aplicativo (local nem internet).\n\nDetalhe técnico: ${e?.message || 'desconhecido'}`);
      win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errPage)).catch(() => {});
    });
  };

  win.webContents.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
    if (!isMainFrame || win.isDestroyed()) return;
    // Código -3 (ERR_ABORTED) = navegação cancelada (comum em redirects) — ignora.
    if (code === -3) return;
    console.error(`[main] Falha de carga (${code}):`, desc);
    carregarWebFallback();
  });

  // Renderer morreu (OOM, crash de GPU, chunk corrompido): nunca deixar a
  // janela em branco — recarrega pela web. O usuário também pode clicar em
  // Ctrl+R para tentar de novo o bundle local.
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[main] Renderer terminou inesperadamente:', details?.reason);
    if (win.isDestroyed()) return;
    carregarWebFallback();
  });

  let localTentado = false;
  win.webContents.once('did-finish-load', () => {
    if (win.isDestroyed()) return;
    // Dá ao React um instante para montar antes de declarar "vazio".
    setTimeout(() => {
      if (win.isDestroyed()) return;
      win.webContents.executeJavaScript(
        'document.getElementById("root") ? document.getElementById("root").childElementCount : -1'
      ).then((qtd) => {
        if (qtd <= 0) {
          console.error(`[main] Renderer vazio (#root com ${qtd} filhos) — HTML carregou mas o app não montou.`);
          if (!localTentado) {
            // Força nova carga limpa; se persistir, pula para a web.
            localTentado = true;
            carregarWebFallback();
          }
        }
      }).catch(() => { /* execução indisponível — ignora */ });
    }, 3500);
  });

  // Em desenvolvimento, carrega do Vite. Em produção, carrega o index.html gerado
  // pelo Vite (dist/) já marcando o modo correto (admin/user).
  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL(`http://localhost:5177/?mode=${APP_MODE}`);
  } else {
    // SE O BUNDLE LOCAL FALHAR por qualquer motivo (arquivo ausente, antivírus,
    // extração portátil incompleta), NUNCA deixa a janela em branco: cai para a
    // versão hospedada, que tem as mesmas funções e o software continua usável.
    win.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { mode: APP_MODE }
    }).catch(carregarWebFallback);
  }

  // Remove menu padrão para parecer app nativo
  win.setMenuBarVisibility(false);

  // ── POPUPS PROFISSIONAIS ─────────────────────────────────────────────
  // O que abre em popup dentro do app:
  //  1) Janela de impressão /print → janela dedicada, do tamanho do papel,
  //     sem menu, com o bundle real do app (corrige o file:///print.html
  //     quebrado — resolveria para a RAIZ do disco e abriria "janela
  //     desorganizada" com o conteúdo inexistente). O payload da impressão
  //     chega pelo parâmetro ?d= (base64) — não depende do localStorage
  //     compartilhado dos arquivos file:// (não confiável).
  //  2) Demais popups (imagens/comprovantes, consoles web) → janela normal,
  //     redimensionável e sem menu, com tamanho mínimo decente.
  const resolverJanelaPrint = (url) => {
    const dados = new URL(url)?.searchParams?.get('d') || '';
    const printPath = path.join(__dirname, '../dist/print.html');
    const printWin = new BrowserWindow({
      width: 880,
      height: 960,
      minWidth: 840,
      minHeight: 600,
      autoHideMenuBar: true,
      backgroundColor: '#f8fafc',
      title: 'Impressão - Mercado Fácil',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    const alvo = pathToFileURL(printPath).toString() + (dados ? `?d=${encodeURIComponent(dados)}` : '');
    printWin.loadURL(alvo).catch(() => {
      printWin.loadFile(printPath).catch(() => {});
    });
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (app.isPackaged && /\/print\.html($|\?)/.test(url)) {
      resolverJanelaPrint(url);
      return { action: 'deny' };
    }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true,
        minWidth: 480,
        minHeight: 400,
        backgroundColor: '#ffffff',
      },
    };
  });

  return win;
}

app.whenReady().then(() => {
  const win = createWindow();
  // Ícone automático na Área de Trabalho logo na primeira execução (portable).
  criarAtalhoSeNecessario();
  setTimeout(() => checarAtualizacao(win), 15000); // primeira checagem após 15s
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC para Arquivos locais (backup localStorageService)
ipcMain.handle('save-file', async (_event, { filePath, data }) => {
  const safePath = path.basename(filePath);
  const full = path.join(app.getPath('userData'), 'data', 'local', safePath);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, data, 'utf-8');
  return true;
});

// Impressão SILENCIOSA (sem diálogo de impressão) — usada pelo cupom térmico:
// cria uma janela oculta com o HTML do cupom e imprime direto na impressora
// padrão (ou na `deviceName` informada) via webContents.print({ silent: true }).
// O front só precisa abrir quando NÃO estiver no Electron (navegador).
ipcMain.handle('print-html-silent', async (_event, { html, deviceName }) => {
  // Validação: o renderer pode ser comprometido num XSS — nunca confiar que
  // venha string/limite. HTML de cupom costuma ter <100 KB.
  if (typeof html !== 'string' || html.length === 0 || html.length > 200000) {
    return { ok: false, error: 'html inválido para impressão' };
  }
  if (deviceName !== undefined && typeof deviceName !== 'string') {
    return { ok: false, error: 'deviceName inválido' };
  }
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true }
  });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const result = await new Promise((resolve) => {
      const opts = { silent: true, printBackground: true };
      if (deviceName) opts.deviceName = String(deviceName);
      win.webContents.print(opts, (success) => resolve(success));
    });
    return { ok: result };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try { win.destroy(); } catch { /* noop */ }
  }
});

// IPC para Archiving/Backup
ipcMain.handle('save-backup', async (event, { fileName, data }) => {
  const backupDir = 'C:\\MercadoFacil_Backups';
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  // basename impede path traversal ("..\\..\\sistema.txt" escreveria fora da pasta).
  const safeName = path.basename(String(fileName || 'backup.json'));
  const filePath = path.join(backupDir, safeName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  return result.filePaths[0];
});

ipcMain.handle('create-shortcut', async () => {
  // Reusa o mesmo criador do atalho automático da primeira execução.
  try {
    return criarAtalhoDesktop();
  } catch {
    return '';
  }
});

// Fecha a janela de impressão /print de forma controlada (o window.close() do
// renderer não funciona em janelas criadas pelo main — allowScriptsToCloseWindows).
ipcMain.on('close-print-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

// Expõe o modo do app (admin/user) para a interface decidir a URL inicial
ipcMain.handle('get-app-mode', () => APP_MODE);
