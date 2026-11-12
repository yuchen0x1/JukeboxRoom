const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function replaceExecutableIcon(executable, iconFile) {
  const requireFromDesktop = require('node:module').createRequire(path.resolve(__dirname, '..', 'package.json'));
  const PELibrary = requireFromDesktop('pe-library');
  const ResEdit = requireFromDesktop('resedit');
  const executableData = fs.readFileSync(executable);
  const exe = PELibrary.NtExecutable.from(executableData, { ignoreCert: true });
  const resources = PELibrary.NtExecutableResource.from(exe);
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
  const group = groups.find((entry) => entry.icons.some((item) => (item.width || 256) === 256));
  if (!group) throw new Error('打包后的应用程序缺少主图标资源组');
  const icon = ResEdit.Data.IconFile.from(fs.readFileSync(iconFile));
  if (!icon.icons.length) throw new Error(`ICO 图标为空：${iconFile}`);
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    group.id,
    group.lang,
    icon.icons.map((item) => item.data),
  );
  resources.outputResource(exe);
  fs.writeFileSync(executable, Buffer.from(exe.generate()));
}

function findRcedit() {
  const explicit = process.env.RCEDIT_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;

  // electron-builder installs this copy for its Windows installer tooling. The
  // builder's newer tool-cache layout is not reliably discoverable from a
  // fixed-depth cache scan on GitHub-hosted runners.
  const bundled = findBundledRcedit();
  if (bundled) return bundled;

  const cacheRoots = [
    process.env.ELECTRON_BUILDER_CACHE,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache'),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.cache', 'electron-builder'),
    'D:\\DevTools\\cache\\electron-builder',
  ].filter(Boolean);

  for (const root of cacheRoots) {
    if (!fs.existsSync(root)) continue;
    const pending = [{ directory: root, depth: 0 }];
    while (pending.length) {
      const { directory, depth } = pending.pop();
      const direct = path.join(directory, 'rcedit-x64.exe');
      if (fs.existsSync(direct)) return direct;
      if (depth >= 2) continue;
      let entries = [];
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) pending.push({ directory: path.join(directory, entry.name), depth: depth + 1 });
      }
    }
  }

  throw new Error('找不到 electron-builder 的 rcedit-x64.exe；请设置 RCEDIT_PATH 指向该工具。');
}

function findBundledRcedit() {
  try {
    const entrypoint = require.resolve('electron-winstaller');
    const bundled = path.resolve(path.dirname(entrypoint), '..', 'vendor', 'rcedit.exe');
    if (fs.existsSync(bundled)) return bundled;
  } catch {
    // Keep the existing explicit-path and electron-builder-cache fallbacks.
  }
  return null;
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const executable = path.join(context.appOutDir, 'JukeboxRoom.exe');
  if (!fs.existsSync(executable)) throw new Error(`打包后的应用程序不存在：${executable}`);

  const iconFile = path.resolve(__dirname, '..', 'build', 'JukeboxRoom.ico');
  if (!fs.existsSync(iconFile)) throw new Error(`桌面 ICO 不存在：${iconFile}`);
  replaceExecutableIcon(executable, iconFile);

  const iconCheck = path.resolve(__dirname, '..', '..', 'scripts', 'check-desktop-icon.mjs');
  execFileSync(process.execPath, [iconCheck, '--app-out-dir', context.appOutDir], {
    stdio: 'inherit',
    windowsHide: true,
  });

  // electron-builder v26 起 extraResources 的 glob 复制不再包含 node_modules，
  // 内嵌 server 的依赖必须显式补齐，否则应用启动即 ERR_MODULE_NOT_FOUND（服务进程 code=1）。
  const serverNodeModules = path.resolve(__dirname, '..', '..', 'server', 'node_modules');
  const targetNodeModules = path.join(context.appOutDir, 'resources', 'server', 'node_modules');
  if (!fs.existsSync(path.join(serverNodeModules, 'dotenv'))) {
    throw new Error('server/node_modules 依赖不完整，请先在 server 目录执行 npm install 再打包');
  }
  if (!fs.existsSync(targetNodeModules)) {
    fs.cpSync(serverNodeModules, targetNodeModules, { recursive: true });
  }
};

module.exports.findBundledRcedit = findBundledRcedit;
