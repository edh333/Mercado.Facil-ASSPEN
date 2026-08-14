const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Modo do app definido no momento do build:
//   APP_MODE=user  → Mercado Fácil - Usuário (compras dos familiares)
//   APP_MODE=admin → Mercado Fácil - Administrador (painel completo)
const APP_MODE = process.env.APP_MODE === 'admin' ? 'admin' : 'user';
const APP_TITLE = APP_MODE === 'admin'
  ? 'Mercado Fácil - Administrador'
  : 'Mercado Fácil - Usuário';

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
      nodeIntegration: true,
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
  createWindow();
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
  const filePath = path.join(backupDir, fileName);
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
