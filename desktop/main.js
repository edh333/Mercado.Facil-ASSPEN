const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

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
    title: "Mercado Fácil - ASSPEN",
    icon: path.join(__dirname, '../public/logo.png'), // Certifique-se de que o ícone existe
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: true
    }
  });

  // Em desenvolvimento, carrega do Vite. Em produção, carrega o index.html gerado.
  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL('http://localhost:5177');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
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
    $SC = $WS.CreateShortcut("${desktopPath.replace(/\\/g, '\\\\')}\\\\Mercado Facil.lnk");
    $SC.TargetPath = "${process.execPath.replace(/\\/g, '\\\\')}";
    $SC.IconLocation = "${iconPath.replace(/\\/g, '\\\\')}";
    $SC.Save();
  `;
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"')}"`, { timeout: 10000 });
  return desktopPath;
});
