const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: () => true,
  saveBackup: (fileName, data) => ipcRenderer.invoke('save-backup', { fileName, data }),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  createShortcut: () => ipcRenderer.invoke('create-shortcut')
});
