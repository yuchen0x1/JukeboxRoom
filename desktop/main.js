/**
 * JukeboxRoom 桌面版（Electron 壳）。
 * 启动时在本机拉起 JukeboxRoom 服务端（内嵌 Node 运行），再用窗口加载页面。
 * 配置与数据目录：优先沿用旧版 %APPDATA%/openmusic-desktop，首次安装的新目录为 %APPDATA%/JukeboxRoom。
 */
const { app, BrowserWindow, Tray, Menu, dialog, ipcMain, nativeImage, shell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');

for (const output of [process.stdout, process.stderr]) {
  output.on('error', (error) => {
    if (error.code !== 'EPIPE') process.emitWarning(error);
  });
}

const isPackaged = app.isPackaged;
if (!isPackaged) app.setName('JukeboxRoom Development');

// 产品名已改为 JukeboxRoom；沿用 Electron 原默认目录或已存在的旧目录，避免升级后配置与本地数据看似丢失。
const appDataPath = app.getPath('appData');
const defaultUserDataPath = app.getPath('userData');
const existingUserDataPath = isPackaged ? [
  path.join(appDataPath, 'openmusic-desktop'),
  path.join(appDataPath, 'OpenMusic'),
  defaultUserDataPath,
  path.join(appDataPath, 'JukeboxRoom'),
].find((candidate) => fs.existsSync(candidate)) : null;
app.setPath('userData', existingUserDataPath || path.join(appDataPath, isPackaged ? 'JukeboxRoom' : 'JukeboxRoom Development'));

const resourcesBase = isPackaged ? process.resourcesPath : path.resolve(__dirname, '..');
const serverDir = path.join(resourcesBase, 'server');
const serverEntry = path.join(serverDir, 'index.js');

const READY_TIMEOUT_MS = 20_000;
const DESKTOP_MUSIC_STATE_MAX_BYTES = 2 * 1024 * 1024;
const DESKTOP_MUSIC_STATE_KEYS = new Set([
  'current',
  'queue',
  'favorites',
  'history',
  'playlists',
  'recentSearches',
  'volume',
  'playbackQuality',
  'repeatMode',
  'shuffle',
  'sourceFilter',
]);
const CONFIG_TEMPLATE = [
  '# JukeboxRoom 桌面版配置：每行一个 KEY=VALUE，修改后重启应用生效。',
  '# 网易云免登录播放依赖 Meting-API（自托管或可信公共服务）；扫码登录后可尝试使用本人账号播放：',
  '#   METING_API_URL=https://your-meting-api',
  '#   METING_API_AUTH=your-meting-token',
  '#   METING_SEARCH_API_URL=https://your-search-api',
  '# 酷狗免登录播放的备选解析：',
  '#   CYAPI_KEY=your-cyapi-key',
  '# 本机/内网自托管 Meting 时再开启：',
  '#   ALLOW_PRIVATE_UPSTREAMS=1',
  '# 可选：酷狗蓝点 CYAPI_KEY=...；其余变量参考 server/.env.example。',
  '',
].join('\n');

function readConfigFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

function protectConfigFile(filePath) {
  try {
    // POSIX 部署中配置文件含有第三方账号密钥，限制为当前用户可读写。
    // Windows 对 chmod 的支持有限，但调用是安全的，并不会阻断桌面端启动。
    fs.chmodSync(filePath, 0o600);
  } catch {
    // 权限保护失败不应阻断本地应用启动；配置仍保存在 userData 目录。
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen({ host: '127.0.0.1', port: 0 }, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function waitUntilReady(url) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  return new Promise((resolve) => {
    const tick = async () => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          resolve(true);
          return;
        }
      } catch {
        // 服务未就绪，继续等待
      }
      if (Date.now() > deadline) {
        resolve(false);
        return;
      }
      setTimeout(tick, 300);
    };
    tick();
  });
}

let serverChild = null;
let serverStopping = false;
let mainWindow = null;
let tray = null;
let trayHintShown = false;
let reportedExit = false;
let desktopMusicWriteQueue = Promise.resolve();
let desktopMusicWriteTarget = 0;
let desktopMusicStateGeneration = 0;

function normalizeDesktopMusicState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid desktop music state');
  }
  const serialized = JSON.stringify(value);
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > DESKTOP_MUSIC_STATE_MAX_BYTES) {
    throw new Error('Desktop music state is too large');
  }
  const state = JSON.parse(serialized);
  if (Object.keys(state).some((key) => !DESKTOP_MUSIC_STATE_KEYS.has(key))) {
    throw new Error('Desktop music state contains an unsupported field');
  }
  for (const key of ['queue', 'favorites', 'history', 'playlists', 'recentSearches']) {
    if (!Array.isArray(state[key])) throw new Error(`Invalid desktop music state field: ${key}`);
  }
  return { state, serialized };
}

async function loadDesktopMusicState() {
  const userDataPath = app.getPath('userData');
  const statePaths = [
    path.join(userDataPath, 'music-library-a.json'),
    path.join(userDataPath, 'music-library-b.json'),
    path.join(userDataPath, 'music-library.json'),
  ];
  const candidates = await Promise.all(statePaths.map(async (statePath, index) => {
    try {
      const [raw, stat] = await Promise.all([
        fs.promises.readFile(statePath, 'utf8'),
        fs.promises.stat(statePath),
      ]);
      return { raw, modifiedAt: stat.mtimeMs, index };
    } catch (error) {
      if (error.code !== 'ENOENT') process.emitWarning(`Unable to read desktop music library: ${error.message}`);
      return null;
    }
  }));

  const validCandidates = [];
  for (const candidate of candidates.filter(Boolean)) {
    try {
      const document = JSON.parse(candidate.raw);
      const isVersioned = document?.schemaVersion === 1
        && Number.isSafeInteger(document.generation)
        && document.generation > 0;
      const normalized = normalizeDesktopMusicState(isVersioned ? document.state : document);
      validCandidates.push({
        ...candidate,
        state: normalized.state,
        generation: isVersioned ? document.generation : 0,
      });
    } catch (error) {
      process.emitWarning(`Ignoring an invalid desktop music library slot: ${error.message}`);
    }
  }

  const latest = validCandidates.sort((a, b) => b.generation - a.generation || b.modifiedAt - a.modifiedAt)[0];
  if (latest) {
    desktopMusicStateGeneration = latest.generation;
    desktopMusicWriteTarget = latest.index < 2 ? 1 - latest.index : 0;
    return latest.state;
  }

  desktopMusicStateGeneration = 0;
  desktopMusicWriteTarget = 0;
  return null;
}

function saveDesktopMusicState(value) {
  const { state } = normalizeDesktopMusicState(value);
  const nextWrite = desktopMusicWriteQueue.then(async () => {
    const generation = desktopMusicStateGeneration + 1;
    const serialized = JSON.stringify({ schemaVersion: 1, generation, state });
    if (Buffer.byteLength(serialized, 'utf8') > DESKTOP_MUSIC_STATE_MAX_BYTES) {
      throw new Error('Desktop music state is too large');
    }
    const slots = ['music-library-a.json', 'music-library-b.json'].map((name) => path.join(app.getPath('userData'), name));
    const targetIndex = desktopMusicWriteTarget;
    await fs.promises.mkdir(path.dirname(slots[targetIndex]), { recursive: true });
    await fs.promises.writeFile(slots[targetIndex], serialized, { encoding: 'utf8', mode: 0o600 });
    desktopMusicStateGeneration = generation;
    desktopMusicWriteTarget = 1 - targetIndex;
  });
  desktopMusicWriteQueue = nextWrite.catch(() => undefined);
  return nextWrite.then(() => true);
}

function resolveTrayIcon() {
  for (const name of ['JukeboxRoom.ico', 'icon.png']) {
    const iconPath = path.join(__dirname, 'build', name);
    if (!fs.existsSync(iconPath)) continue;
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) return image;
  }
  return null;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

let currentTrackTitle = '';

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const title = currentTrackTitle ? `正在播放: ${currentTrackTitle}` : 'JukeboxRoom · 音乐就绪';
  tray.setToolTip(title.slice(0, 127));
  const items = [
    { label: currentTrackTitle ? `🎵 ${currentTrackTitle}` : '🎵 暂无播放曲目', enabled: false },
    { type: 'separator' },
    { label: '显示主界面', click: () => showMainWindow() },
    {
      label: '播放 / 暂停',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('jukebox:tray-toggle-play');
        }
      },
    },
    {
      label: '下一首',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('jukebox:tray-next-track');
        }
      },
    },
    { type: 'separator' },
    { label: '退出 JukeboxRoom', click: () => { app.isQuitting = true; app.quit(); } },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function createTray() {
  const icon = resolveTrayIcon();
  if (!icon) {
    // 托盘不可用时保持“关闭即退出”的原行为，避免窗口隐藏后应用无入口可恢复
    process.emitWarning('托盘图标资源缺失，关闭主窗口将直接退出应用');
    return;
  }
  tray = new Tray(icon);
  updateTrayMenu();
  tray.on('click', () => showMainWindow());
  tray.on('double-click', () => showMainWindow());
}

function stopServer() {
  if (!serverChild) return;
  const child = serverChild;
  serverChild = null;
  serverStopping = true;
  try {
    child.kill();
  } catch {
    // 进程可能已退出
  }
}

async function startServer() {
  const port = await getFreePort();
  const configPath = path.join(app.getPath('userData'), 'jukeboxroom.env');
  if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, CONFIG_TEMPLATE, { encoding: 'utf8', mode: 0o600 });
  protectConfigFile(configPath);
  const userEnv = readConfigFile(configPath);

  const generatedSecrets = [];
  if (!userEnv.CLIENT_ID_SECRET || !userEnv.AUTH_JWT_SECRET || !userEnv.DESKTOP_CREDENTIAL_SECRET) {
    generatedSecrets.push('# 以下密钥由 JukeboxRoom 自动生成，请勿分享或删除。');
    if (!userEnv.CLIENT_ID_SECRET) generatedSecrets.push(`CLIENT_ID_SECRET=${crypto.randomBytes(32).toString('hex')}`);
    if (!userEnv.AUTH_JWT_SECRET) generatedSecrets.push(`AUTH_JWT_SECRET=${crypto.randomBytes(32).toString('hex')}`);
    if (!userEnv.DESKTOP_CREDENTIAL_SECRET) generatedSecrets.push(`DESKTOP_CREDENTIAL_SECRET=${crypto.randomBytes(32).toString('hex')}`);
    generatedSecrets.push('');
    fs.appendFileSync(configPath, generatedSecrets.join('\n'), { encoding: 'utf8', mode: 0o600 });
    protectConfigFile(configPath);
    Object.assign(userEnv, readConfigFile(configPath));
  }

  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const env = {
    ...process.env,
    ...userEnv,
    NODE_ENV: 'production',
    JUKEBOX_DESKTOP_MODE: '1',
    PORT: String(port),
    CLIENT_URL: `http://127.0.0.1:${port}`,
    OPENMUSIC_DATA_DIR: dataDir,
    ELECTRON_RUN_AS_NODE: '1',
  };

  serverStopping = false;
  const child = spawn(process.execPath, [serverEntry], {
    cwd: serverDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverChild = child;
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  child.on('exit', (code) => {
    if (serverChild === child) serverChild = null;
    if (serverStopping || reportedExit) return;
    reportedExit = true;
    dialog.showErrorBox(
      'JukeboxRoom 本地服务已退出',
      `本地服务进程异常退出（code=${code ?? 'unknown'}）。\n` +
        '常见原因：jukeboxroom.env 配置了无效变量，或端口/数据目录不可用。\n' +
        `配置位置：${configPath}`,
    );
    app.quit();
  });
  return port;
}

async function createWindow() {
  let port;
  try {
    port = await startServer();
  } catch (err) {
    dialog.showErrorBox('JukeboxRoom 启动失败', `无法启动本地服务：${err.message}`);
    app.quit();
    return;
  }

  const base = `http://127.0.0.1:${port}`;
  const ready = await waitUntilReady(`${base}/api/health/ready`);
  if (!ready) {
    dialog.showErrorBox('JukeboxRoom 启动失败', `本地服务在 ${READY_TIMEOUT_MS / 1000} 秒内未就绪，请重启重试。`);
    app.quit();
    return;
  }

  console.log(`[desktop] local server ready: ${base}`);
  const appIcon = path.join(__dirname, 'build', 'JukeboxRoom.ico');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    closable: true,
    fullscreenable: true,
    thickFrame: true,
    autoHideMenuBar: true,
    title: 'JukeboxRoom',
    icon: appIcon,
    backgroundColor: '#0b0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const assertTrustedWindowRequest = (event) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error('Untrusted window control request');
    }
    if (event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Window controls are only available to the main frame');
    }
    try {
      if (new URL(event.senderFrame.url).origin !== base) throw new Error('Unexpected renderer origin');
    } catch {
      throw new Error('Unexpected renderer origin');
    }
  };

  const windowHandlers = {
    'jukebox:window-minimize': (event) => {
      assertTrustedWindowRequest(event);
      mainWindow.minimize();
    },
    'jukebox:window-toggle-maximize': (event) => {
      assertTrustedWindowRequest(event);
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
      return mainWindow.isMaximized();
    },
    'jukebox:window-close': (event) => {
      assertTrustedWindowRequest(event);
      mainWindow.close();
    },
    'jukebox:window-is-maximized': (event) => {
      assertTrustedWindowRequest(event);
      return mainWindow.isMaximized();
    },
    'jukebox:load-music-state': async (event) => {
      assertTrustedWindowRequest(event);
      return loadDesktopMusicState();
    },
    'jukebox:save-music-state': async (event, state) => {
      assertTrustedWindowRequest(event);
      return saveDesktopMusicState(state);
    },
    'jukebox:open-music-config': async (event) => {
      assertTrustedWindowRequest(event);
      const configPath = path.join(app.getPath('userData'), 'jukeboxroom.env');
      await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
      if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf8');
      return (await shell.openPath(configPath)) === '';
    },
    // 卸载时不再自动删除 userData（见 package.json 的 deleteAppDataOnUninstall），
    // 这里提供显式入口：用户可以自行查看或清理，避免"想清干净却找不到位置"。
    'jukebox:open-data-dir': async (event) => {
      assertTrustedWindowRequest(event);
      const dataPath = app.getPath('userData');
      await fs.promises.mkdir(dataPath, { recursive: true });
      return (await shell.openPath(dataPath)) === '';
    },
    'jukebox:clear-local-data': async (event) => {
      assertTrustedWindowRequest(event);
      if (!mainWindow || mainWindow.isDestroyed()) return false;
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['取消', '清空并重启'],
        defaultId: 0,
        cancelId: 0,
        title: '清空本地数据',
        message: '确定要清空本机全部本地数据吗？',
        detail: '将删除本地曲库索引、播放队列、收藏、歌单、房间数据和配置。此操作不可撤销，建议先备份。',
        noLink: true,
      });
      if (response !== 1) return false;
      const userDataPath = app.getPath('userData');
      const removable = [
        'data',
        'music-library.json',
        'music-library-a.json',
        'music-library-b.json',
        'jukeboxroom.env',
      ];
      for (const name of removable) {
        await fs.promises.rm(path.join(userDataPath, name), { recursive: true, force: true });
      }
      app.relaunch();
      app.quit();
      return true;
    },
    'jukebox:set-tray-track': (event, title) => {
      assertTrustedWindowRequest(event);
      currentTrackTitle = typeof title === 'string' ? title.slice(0, 60) : '';
      updateTrayMenu();
      return true;
    },
    'jukebox:restart-app': (event) => {
      assertTrustedWindowRequest(event);
      app.relaunch();
      app.quit();
    },
  };

  for (const [channel, handler] of Object.entries(windowHandlers)) ipcMain.handle(channel, handler);

  const publishMaximizedState = () => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow.webContents.send('jukebox:window-maximized', mainWindow.isMaximized());
    }
  };
  mainWindow.on('maximize', publishMaximizedState);
  mainWindow.on('unmaximize', publishMaximizedState);
  const isLocalUrl = (url) => url.startsWith(`${base}/`) || url === base;
  // 只把 http/https 交给系统浏览器：否则渲染层被注入后可用 file:、ms-msdt: 等任意协议执行本机程序
  const isSafeExternalUrl = (url) => {
    try {
      const protocol = new URL(url).protocol;
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  };
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalUrl(url)) return { action: 'allow' };
    if (isSafeExternalUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isLocalUrl(url)) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) shell.openExternal(url);
  });

  await mainWindow.loadURL(base);

  createTray();

  // 点关闭 = 最小化到托盘继续播放（与常见音乐软件一致）；真正退出走托盘菜单或应用退出流程
  mainWindow.on('close', (event) => {
    if (app.isQuitting || !tray) return;
    event.preventDefault();
    mainWindow.hide();
    if (!trayHintShown) {
      trayHintShown = true;
      if (process.platform === 'win32' && typeof tray.displayBalloon === 'function') {
        try {
          tray.displayBalloon({
            title: 'JukeboxRoom 仍在运行',
            content: '已最小化到系统托盘：点击托盘图标恢复界面，右键图标可选择退出。',
          });
        } catch {
          // 气泡提示失败不影响托盘功能
        }
      }
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 已在托盘后台运行时再次启动，唤起主窗口而不是无响应
    showMainWindow();
  });
  app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  stopServer();
  app.quit();
});
app.on('before-quit', () => {
  // 标记正在退出，让主窗口的“关闭转托盘”拦截放行窗口真正关闭
  app.isQuitting = true;
  stopServer();
});
process.on('exit', stopServer);

app.on('will-quit', () => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
  for (const channel of [
    'jukebox:window-minimize',
    'jukebox:window-toggle-maximize',
    'jukebox:window-close',
    'jukebox:window-is-maximized',
    'jukebox:load-music-state',
    'jukebox:save-music-state',
    'jukebox:open-music-config',
    'jukebox:restart-app',
  ]) ipcMain.removeHandler(channel);
});
