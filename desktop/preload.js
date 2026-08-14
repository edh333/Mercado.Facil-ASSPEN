const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: () => true,
  printHtmlSilent: (html, deviceName) => ipcRenderer.invoke('print-html-silent', { html, deviceName }),
  saveFile: (filePath, data) => ipcRenderer.invoke('save-file', { filePath, data }),
  saveBackup: (fileName, data) => ipcRenderer.invoke('save-backup', { fileName, data }),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  createShortcut: () => ipcRenderer.invoke('create-shortcut'),
  getAppMode: () => ipcRenderer.invoke('get-app-mode')
});
