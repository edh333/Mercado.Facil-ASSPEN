const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

// Modo do app definido no momento do build:
//   APP_MODE=user  → Mercado Fácil - Usuário (compras dos familiares)
//   APP_MODE=admin → Mercado Fácil - Administrador (painel completo)
const APP_MODE = process.env.APP_MODE === 'admin' ? 'admin' : 'user';
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
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

  // Em desenvolvimento, carrega do Vite. Em produção, carrega o index.html gerado
  // pelo Vite (dist/) já marcando o modo correto (admin/user).
  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL(`http://localhost:5177/?mode=${APP_MODE}`);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { mode: APP_MODE }
    });
  }

  // Remove menu padrão para parecer app nativo
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  const win = createWindow();
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
  const { execSync } = require('child_process');
  const desktopPath = path.join(require('os').homedir(), 'Desktop');
  const iconPath = path.join(process.execPath, '..', 'resources', 'app.asar.unpacked', 'public', 'logo.png');
  const psScript = `
    $WS = New-Object -ComObject WScript.Shell;
    $SC = $WS.CreateShortcut("${desktopPath.replace(/\\/g, '\\\\')}\\\\${APP_TITLE}.lnk");
    $SC.TargetPath = "${process.execPath.replace(/\\/g, '\\\\')}";
    $SC.IconLocation = "${iconPath.replace(/\\/g, '\\\\')}";
    $SC.Save();
  `;
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"')}"`, { timeout: 10000 });
  return desktopPath;
});

// Expõe o modo do app (admin/user) para a interface decidir a URL inicial
ipcMain.handle('get-app-mode', () => APP_MODE);
