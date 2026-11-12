/**
 * Build the Windows desktop PNG and multi-size ICO from the transparent source asset.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(root, 'desktop', 'build');
const clientIconDir = path.join(root, 'client', 'public', 'icons');
const source = path.join(buildDir, 'icon-source.png');
const resizeScript = path.join(root, 'desktop', 'scripts', 'resize-icon-layers.ps1');
const pngDestination = path.join(buildDir, 'icon.png');
const icoDestination = path.join(buildDir, 'JukeboxRoom.ico');
const sizes = [16, 20, 24, 32, 40, 48, 64, 72, 96, 128, 192, 256, 512, 1024];
const clientIconSizes = [16, 32, 48, 64, 128, 192, 256, 512, 1024];
const icoSizes = [16, 20, 24, 32, 40, 48, 64, 72, 96, 128, 256];
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngHeader(buffer, label) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error(`${label} 不是有效 PNG`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
  };
}

function makeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length + entries.length * 16;
  const directory = entries.map(({ size, data }) => {
    const record = Buffer.alloc(16);
    record[0] = size === 256 ? 0 : size;
    record[1] = size === 256 ? 0 : size;
    record.writeUInt16LE(1, 4);
    record.writeUInt16LE(32, 6);
    record.writeUInt32LE(data.length, 8);
    record.writeUInt32LE(offset, 12);
    offset += data.length;
    return record;
  });
  return Buffer.concat([header, ...directory, ...entries.map(({ data }) => data)]);
}

function removeTempDirectory(directory) {
  const tempRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(directory);
  const relative = path.relative(tempRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`拒绝清理临时目录之外的路径：${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

if (process.platform !== 'win32') {
  throw new Error('Windows 图标缩放需要 Windows System.Drawing；请在 Windows 环境运行此脚本。');
}
if (!fs.existsSync(source)) {
  throw new Error(`透明 Windows 图标源文件不存在：${source}`);
}
if (!fs.existsSync(resizeScript)) {
  throw new Error(`图标缩放脚本不存在：${resizeScript}`);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jukeboxroom-icon-'));
try {
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', resizeScript, '-Source', source, '-OutputDirectory', tempDir,
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`图标缩放失败（PowerShell exit ${result.status}）`);

  const entries = sizes.map((size) => {
    const file = path.join(tempDir, `${size}.png`);
    if (!fs.existsSync(file)) throw new Error(`缺少生成的 ${size}x${size} PNG`);
    const data = fs.readFileSync(file);
    const header = readPngHeader(data, `${size}x${size}`);
    if (header.width !== size || header.height !== size || header.bitDepth !== 8 || header.colorType !== 6) {
      throw new Error(`${size}x${size} PNG 不是 8-bit RGBA 或尺寸不匹配`);
    }
    return { size, data, file };
  });

  fs.mkdirSync(buildDir, { recursive: true });
  fs.mkdirSync(clientIconDir, { recursive: true });
  fs.copyFileSync(entries.find((entry) => entry.size === 512).file, pngDestination);
  fs.writeFileSync(icoDestination, makeIco(entries.filter((entry) => icoSizes.includes(entry.size))));
  for (const size of clientIconSizes) {
    const entry = entries.find((item) => item.size === size);
    if (!entry) throw new Error(`缺少客户端 ${size}x${size} PNG`);
    fs.copyFileSync(entry.file, path.join(clientIconDir, `jukeboxroom-${size}.png`));
  }
  console.log(`[gen-desktop-icon] 已生成透明桌面 PNG、Web/桌面 UI PNG 与 ${icoSizes.length} 个 ICO 图层：${icoDestination}`);
} finally {
  removeTempDirectory(tempDir);
}
