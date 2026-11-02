/**
 * 将品牌图标包中的 512px PNG 同步为 Electron 辅助图标资源。
 * Windows 安装器与窗口主图标使用 desktop/build/JukeboxRoom.ico。
 * 用法：node scripts/gen-desktop-icon.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'client', 'public', 'icons', 'jukeboxroom-512.png');
const destination = path.join(root, 'desktop', 'build', 'icon.png');

if (!fs.existsSync(source)) {
  throw new Error(`品牌图标源文件不存在：${source}`);
}

fs.copyFileSync(source, destination);
console.log(`[gen-desktop-icon] 已同步品牌图标 ${destination}`);
