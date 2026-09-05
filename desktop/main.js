/**
 * OpenMusic 桌面版（Electron 壳）。
 * 启动时在本机拉起 OpenMusic 服务端（内嵌 Node 运行），再用窗口加载页面。
 * 配置与数据目录：%APPDATA%/OpenMusic（openmusic.env 可覆盖任意服务端环境变量）。
 */
const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');

const isPackaged = app.isPackaged;
const resourcesBase = isPackaged ? process.resourcesPath : path.resolve(__dirname, '..');
const serverDir = path.join(resourcesBase, 'server');
const serverEntry = path.join(serverDir, 'index.js');

const READY_TIMEOUT_MS = 20_000;
const CONFIG_TEMPLATE = [
  '# OpenMusic 桌面版配置：每行一个 KEY=VALUE，修改后重启应用生效。',
  '# 搜歌/播放依赖 Meting-API，必填一个可用地址（自托管或可信公共服务）：',
  '#   METING_API_URL=https://your-meting-api',
  '#   METING_API_AUTH=your-meting-token',
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
let mainWindow = null;
let reportedExit = false;

function stopServer() {
  if (!serverChild) return;
  try {
    serverChild.kill();
  } catch {
    // 进程可能已退出
  }
  serverChild = null;
}

async function startServer() {
  const port = await getFreePort();
  const configPath = path.join(app.getPath('userData'), 'openmusic.env');
  if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf8');
  const userEnv = readConfigFile(configPath);

  const missingSecrets = !userEnv.CLIENT_ID_SECRET || !userEnv.AUTH_JWT_SECRET;
  if (missingSecrets) {
    const generated = [
      '# 以下由 OpenMusic 自动生成，删除会导致账号身份和登录态失效',
      `CLIENT_ID_SECRET=${crypto.randomBytes(32).toString('hex')}`,
      `AUTH_JWT_SECRET=${crypto.randomBytes(32).toString('hex')}`,
      '',
    ].join('\n');
    fs.appendFileSync(configPath, generated, 'utf8');
    Object.assign(userEnv, readConfigFile(configPath));
  }

  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const env = {
    ...process.env,
    ...userEnv,
    NODE_ENV: 'production',
    PORT: String(port),
    CLIENT_URL: `http://127.0.0.1:${port}`,
    OPENMUSIC_DATA_DIR: dataDir,
    ELECTRON_RUN_AS_NODE: '1',
  };

  serverChild = spawn(process.execPath, [serverEntry], {
    cwd: serverDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverChild.stdout.on('data', (chunk) => process.stdout.write(chunk));
  serverChild.stderr.on('data', (chunk) => process.stderr.write(chunk));
  serverChild.on('exit', (code) => {
    serverChild = null;
    if (reportedExit) return;
    reportedExit = true;
    dialog.showErrorBox(
      'OpenMusic 本地服务已退出',
      `本地服务进程异常退出（code=${code ?? 'unknown'}）。\n` +
        '常见原因：openmusic.env 配置了无效变量，或端口/数据目录不可用。\n' +
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
    dialog.showErrorBox('OpenMusic 启动失败', `无法启动本地服务：${err.message}`);
    app.quit();
    return;
  }

  const base = `http://127.0.0.1:${port}`;
  const ready = await waitUntilReady(`${base}/api/health/ready`);
  if (!ready) {
    dialog.showErrorBox('OpenMusic 启动失败', `本地服务在 ${READY_TIMEOUT_MS / 1000} 秒内未就绪，请重启重试。`);
    app.quit();
    return;
  }

  console.log(`[desktop] local server ready: ${base}`);
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    autoHideMenuBar: true,
    title: 'OpenMusic',
    backgroundColor: '#141414',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  const isLocalUrl = (url) => url.startsWith(`${base}/`) || url === base;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalUrl(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isLocalUrl(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  await mainWindow.loadURL(base);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  stopServer();
  app.quit();
});
app.on('before-quit', stopServer);
process.on('exit', stopServer);
