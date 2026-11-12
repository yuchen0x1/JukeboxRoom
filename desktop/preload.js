const { contextBridge, ipcRenderer } = require('electron');

// 统一吞掉 IPC 失败（窗口已销毁瞬间点击、校验不通过等），避免渲染层 unhandledrejection
const safeInvoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args).catch(() => undefined);

contextBridge.exposeInMainWorld('jukeboxWindow', Object.freeze({
  minimize: () => safeInvoke('jukebox:window-minimize'),
  toggleMaximize: () => safeInvoke('jukebox:window-toggle-maximize'),
  close: () => safeInvoke('jukebox:window-close'),
  isMaximized: () => safeInvoke('jukebox:window-is-maximized'),
  loadMusicState: () => safeInvoke('jukebox:load-music-state'),
  saveMusicState: (state) => safeInvoke('jukebox:save-music-state', state),
  setTrayTrack: (title) => safeInvoke('jukebox:set-tray-track', title),
  openMusicConfig: () => safeInvoke('jukebox:open-music-config'),
  openDataDir: () => safeInvoke('jukebox:open-data-dir'),
  clearLocalData: () => safeInvoke('jukebox:clear-local-data'),
  restartApp: () => safeInvoke('jukebox:restart-app'),
  onTrayTogglePlay: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('jukebox:tray-toggle-play', handler);
    return () => ipcRenderer.removeListener('jukebox:tray-toggle-play', handler);
  },
  onTrayNextTrack: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('jukebox:tray-next-track', handler);
    return () => ipcRenderer.removeListener('jukebox:tray-next-track', handler);
  },
  onMaximizedChanged: (listener) => {
    const handler = (_event, maximized) => listener(Boolean(maximized));
    ipcRenderer.on('jukebox:window-maximized', handler);
    return () => ipcRenderer.removeListener('jukebox:window-maximized', handler);
  },
}));

contextBridge.exposeInMainWorld('desktopUpdater', Object.freeze({
  getState: () => safeInvoke('jukebox:updater-get-state'),
  check: () => safeInvoke('jukebox:updater-check'),
  download: () => safeInvoke('jukebox:updater-download'),
  cancelDownload: () => safeInvoke('jukebox:updater-cancel-download'),
  install: () => safeInvoke('jukebox:updater-install'),
  onState: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on('jukebox:updater-state', handler);
    return () => ipcRenderer.removeListener('jukebox:updater-state', handler);
  },
}));
