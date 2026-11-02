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
  openMusicConfig: () => safeInvoke('jukebox:open-music-config'),
  restartApp: () => safeInvoke('jukebox:restart-app'),
  onMaximizedChanged: (listener) => {
    const handler = (_event, maximized) => listener(Boolean(maximized));
    ipcRenderer.on('jukebox:window-maximized', handler);
    return () => ipcRenderer.removeListener('jukebox:window-maximized', handler);
  },
}));
