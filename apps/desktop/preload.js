const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  selectImportFile() {
    return ipcRenderer.invoke('filesystem:select-import');
  },
  getStoragePaths() {
    return ipcRenderer.invoke('filesystem:get-paths');
  }
});
