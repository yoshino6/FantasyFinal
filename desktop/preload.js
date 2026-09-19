const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fantasyPetDesktop', {
  platform: process.platform,
  version: process.versions.electron,
  moveWindow: (dx, dy) => ipcRenderer.invoke('window-move', { dx, dy }),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  showContextMenu: () => ipcRenderer.send('pet-context-menu'),
  onAlwaysOnTopChanged: (callback) => {
    ipcRenderer.on('always-on-top-changed', (_event, value) => callback(value));
  }
});
