const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jukeboxWindow', Object.freeze({
  minimize: () => ipcRenderer.invoke('jukebox:window-minimize'),
  toggleMaximize: () => ipcRenderer.invoke('jukebox:window-toggle-maximize'),
  close: () => ipcRenderer.invoke('jukebox:window-close').catch(() => undefined),
  isMaximized: () => ipcRenderer.invoke('jukebox:window-is-maximized'),
  loadMusicState: () => ipcRenderer.invoke('jukebox:load-music-state'),
  saveMusicState: (state) => ipcRenderer.invoke('jukebox:save-music-state', state),
  openMusicConfig: () => ipcRenderer.invoke('jukebox:open-music-config'),
  restartApp: () => ipcRenderer.invoke('jukebox:restart-app'),
  onMaximizedChanged: (listener) => {
    const handler = (_event, maximized) => listener(Boolean(maximized));
    ipcRenderer.on('jukebox:window-maximized', handler);
    return () => ipcRenderer.removeListener('jukebox:window-maximized', handler);
  },
}));
