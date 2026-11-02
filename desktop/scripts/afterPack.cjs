const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function findRcedit() {
  const explicit = process.env.RCEDIT_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;

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

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const executable = path.join(context.appOutDir, 'JukeboxRoom.exe');
  const icon = path.resolve(__dirname, '..', 'build', 'JukeboxRoom.ico');
  if (!fs.existsSync(executable)) throw new Error(`打包后的应用程序不存在：${executable}`);
  if (!fs.existsSync(icon)) throw new Error(`应用图标不存在：${icon}`);

  execFileSync(findRcedit(), [executable, '--set-icon', icon], { stdio: 'inherit' });
};
