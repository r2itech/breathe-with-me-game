const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appBridge', {
  isElectron: true,
  setFullscreen: (on) => ipcRenderer.send('hs:set-fullscreen', on),
  isFullscreen: () => ipcRenderer.invoke('hs:is-fullscreen'),
  quit: () => ipcRenderer.send('hs:quit'),
  openExternal: (url) => ipcRenderer.send('hs:open-external', url),
});
