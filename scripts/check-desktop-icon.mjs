/**
 * Validate the transparent source, generated platform icons, ICO layers,
 * packaged app resources, and (after dist) the PE icon resources.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(root, 'desktop', 'build');
const clientIconDir = path.join(root, 'client', 'public', 'icons');
const clientDistIconDir = path.join(root, 'client', 'dist', 'icons');
const sourcePath = path.join(buildDir, 'icon-source.png');
const pngPath = path.join(buildDir, 'icon.png');
const icoPath = path.join(buildDir, 'JukeboxRoom.ico');
const requiredIcoSizes = [16, 20, 24, 32, 40, 48, 64, 72, 96, 128, 256];
const clientIconSizes = [16, 32, 48, 64, 128, 192, 256, 512, 1024];
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngRequire = createRequire(path.join(root, 'server', 'package.json'));
const { PNG } = pngRequire('pngjs');
const args = process.argv.slice(2);
const appOutDirIndex = args.indexOf('--app-out-dir');
const appOutDir = appOutDirIndex >= 0 ? args[appOutDirIndex + 1] : null;
const checkArtifacts = args.includes('--artifacts');

function fail(message) {
  throw new Error(`[check-desktop-icon] ${message}`);
}

function analyzePng(data, png, file, label) {
  let alphaZero = 0;
  let alphaPartial = 0;
  let alphaOpaque = 0;
  let transparentRgbNonZero = 0;
  let edgeNonZero = 0;
  let edgeOpaque = 0;
  let matteFringePixels = 0;
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      const alpha = png.data[offset + 3];
      const edge = x === 0 || y === 0 || x === png.width - 1 || y === png.height - 1;
      if (edge) {
        if (alpha > 0) edgeNonZero += 1;
        if (alpha === 255) edgeOpaque += 1;
      }
      // A black matte fringe is only suspicious when a low-alpha dark pixel
      // touches both transparent canvas and a bright opaque logo pixel.
      // This avoids rejecting intentional dark details inside the logo.
      if (alpha > 0 && alpha <= 64 && Math.max(
        png.data[offset],
        png.data[offset + 1],
        png.data[offset + 2],
      ) <= 8 && x > 0 && y > 0 && x < png.width - 1 && y < png.height - 1) {
        let touchesTransparent = false;
        let touchesBrightOpaque = false;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue;
            const neighborOffset = ((y + dy) * png.width + (x + dx)) * 4;
            const neighborAlpha = png.data[neighborOffset + 3];
            const neighborRgb = Math.max(
              png.data[neighborOffset],
              png.data[neighborOffset + 1],
              png.data[neighborOffset + 2],
            );
            if (neighborAlpha === 0) touchesTransparent = true;
            if (neighborAlpha >= 128 && neighborRgb > 32) touchesBrightOpaque = true;
          }
        }
        if (touchesTransparent && touchesBrightOpaque) matteFringePixels += 1;
      }
      if (alpha === 0) {
        alphaZero += 1;
        if (png.data[offset] || png.data[offset + 1] || png.data[offset + 2]) transparentRgbNonZero += 1;
      } else {
        if (alpha === 255) alphaOpaque += 1;
        else alphaPartial += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return {
    file,
    label,
    data,
    png,
    alphaZero,
    alphaPartial,
    alphaOpaque,
    transparentRgbNonZero,
    edgeNonZero,
    edgeOpaque,
    matteFringePixels,
    bbox: [minX, minY, maxX, maxY],
  };
}

function decodePng(data, label) {
  if (!data.subarray(0, 8).equals(pngSignature)) fail(`${label} 不是 PNG`);
  try {
    return PNG.sync.read(data);
  } catch (error) {
    fail(`${label} 无法解码：${error.message}`);
  }
}

function readPng(file, label) {
  if (!fs.existsSync(file)) fail(`${label} 不存在：${file}`);
  const data = fs.readFileSync(file);
  const png = decodePng(data, label);
  return analyzePng(data, png, file, label);
}

function readPngPayload(data, label) {
  const png = decodePng(data, label);
  return analyzePng(data, png, null, label);
}

function verifyPng(info, label, expectedSize, { requireAlpha = true } = {}) {
  if (info.png.width !== expectedSize || info.png.height !== expectedSize) {
    fail(`${label} 尺寸应为 ${expectedSize}x${expectedSize}，实际 ${info.png.width}x${info.png.height}`);
  }
  if (requireAlpha && (!info.alphaZero || !info.alphaPartial)) {
    fail(`${label} 缺少真实透明和抗锯齿 Alpha`);
  }
  if (info.transparentRgbNonZero) {
    fail(`${label} 存在 ${info.transparentRgbNonZero} 个透明像素带 RGB 污染`);
  }
  const matteLimit = Math.max(64, Math.ceil(info.png.width * info.png.height * 0.01));
  if (info.matteFringePixels > matteLimit) {
    fail(`${label} 存在 ${info.matteFringePixels} 个疑似黑色半透明边缘像素（阈值 ${matteLimit}）`);
  }
  if (info.edgeOpaque) {
    fail(`${label} 外边界存在 ${info.edgeOpaque} 个完全不透明像素，疑似铺满背景或黑色外框`);
  }
  const edgePixelCount = Math.max(1, info.png.width * 2 + info.png.height * 2 - 4);
  if (info.edgeNonZero > edgePixelCount * 0.75) {
    fail(`${label} 外边界 ${info.edgeNonZero}/${edgePixelCount} 像素非透明，疑似连续背景外框`);
  }
  for (const [x, y] of [[0, 0], [info.png.width - 1, 0], [0, info.png.height - 1], [info.png.width - 1, info.png.height - 1]]) {
    if (info.png.data[(y * info.png.width + x) * 4 + 3] !== 0) {
      fail(`${label} 角点 (${x},${y}) 不透明`);
    }
  }
}

function parseIco(file) {
  if (!fs.existsSync(file)) fail(`ICO 不存在：${file}`);
  const buffer = fs.readFileSync(file);
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    fail(`ICO 头部无效：${file}`);
  }
  const count = buffer.readUInt16LE(4);
  const entries = [];
  const seen = new Set();
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    if (offset + 16 > buffer.length) fail(`ICO 目录项 ${index} 越界`);
    const width = buffer[offset] || 256;
    const height = buffer[offset + 1] || 256;
    if (width !== height) fail(`ICO 图层 ${width}x${height} 不是正方形`);
    if (seen.has(width)) fail(`ICO 重复包含 ${width}x${height} 图层`);
    seen.add(width);
    const bytesInRes = buffer.readUInt32LE(offset + 8);
    const imageOffset = buffer.readUInt32LE(offset + 12);
    const payload = buffer.subarray(imageOffset, imageOffset + bytesInRes);
    if (payload.length !== bytesInRes) fail(`ICO ${width}x${height} 数据越界`);
    const decoded = readPngPayload(payload, `${width}x${height} ICO 图层`);
    if (decoded.png.width !== width || decoded.png.height !== height) {
      fail(`ICO 目录 ${width}x${height} 与 PNG 实际尺寸 ${decoded.png.width}x${decoded.png.height} 不一致`);
    }
    entries.push({ width, height, payload, decoded });
  }
  return { buffer, entries };
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function verifyClientIcons(desktopPng) {
  for (const size of clientIconSizes) {
    const file = path.join(clientIconDir, `jukeboxroom-${size}.png`);
    const info = readPng(file, `client/public/icons/jukeboxroom-${size}.png`);
    verifyPng(info, `client/public/icons/jukeboxroom-${size}.png`, size);
    if (size === 512 && sha256(info.data) !== sha256(desktopPng.data)) {
      fail('client/public/icons/jukeboxroom-512.png 与 desktop/build/icon.png 不一致');
    }
    if (fs.statSync(file).mtimeMs < fs.statSync(sourcePath).mtimeMs) {
      fail(`客户端 ${size}x${size} 图标早于透明源图，疑似旧资源`);
    }
    const distFile = path.join(clientDistIconDir, `jukeboxroom-${size}.png`);
    if (fs.existsSync(clientDistIconDir)) {
      const distInfo = readPng(distFile, `client/dist/icons/jukeboxroom-${size}.png`);
      verifyPng(distInfo, `client/dist/icons/jukeboxroom-${size}.png`, size);
      if (sha256(distInfo.data) !== sha256(info.data)) {
        fail(`client/dist/icons/jukeboxroom-${size}.png 与 client/public/icons 同尺寸资源不一致，请先重新构建客户端`);
      }
    }
  }
}

function verifyExecutableIcon(executable, expectedIco, label) {
  if (!fs.existsSync(executable)) fail(`${label} 不存在：${executable}`);
  let resources;
  let groups;
  try {
    const peRequire = createRequire(path.join(root, 'desktop', 'package.json'));
    const PELibrary = peRequire('pe-library');
    const ResEdit = peRequire('resedit');
    const pe = PELibrary.NtExecutable.from(fs.readFileSync(executable), { ignoreCert: true });
    resources = PELibrary.NtExecutableResource.from(pe);
    groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
  } catch (error) {
    fail(`${label} PE 图标资源无法解析：${error.message}`);
  }
  if (!groups.length) fail(`${label} 缺少 RT_GROUP_ICON 资源`);

  const expectedBySize = new Map(expectedIco.entries.map((entry) => [entry.width, entry]));
  const group = groups.find((candidate) => candidate.icons.some((icon) => (icon.width || 256) === 256));
  if (!group) fail(`${label} 缺少包含 256x256 的图标组`);
  const items = group.getIconItemsFromEntries(resources.entries);
  if (items.length !== group.icons.length) fail(`${label} 图标组目录与 RT_ICON 数量不一致`);
  const itemRecords = items.map((item) => {
    if (item.isRaw?.()) return { item, length: Buffer.from(item.bin).length };
    if (item.isIcon?.()) return { item, length: Buffer.from(item.generate()).length };
    return { item, length: -1 };
  });
  const usedItems = new Set();

  const actualSizes = [];
  for (const icon of group.icons) {
    const size = icon.width || 256;
    const itemIndex = itemRecords.findIndex((record, index) => !usedItems.has(index) && record.length === icon.dataSize);
    if (itemIndex < 0) fail(`${label} 找不到 ${size}x${size} 图层的 RT_ICON 数据`);
    usedItems.add(itemIndex);
    const item = itemRecords[itemIndex].item;
    const expected = expectedBySize.get(size);
    if (!expected) fail(`${label} 含有未生成的 ${size}x${size} 图层`);
    if (item.isRaw?.()) {
      const payload = Buffer.from(item.bin);
      if (sha256(payload) !== sha256(expected.payload)) {
        fail(`${label} 的 ${size}x${size} 图层与 JukeboxRoom.ico 不一致`);
      }
      const decoded = readPngPayload(payload, `${label} ${size}x${size} 图层`);
      verifyPng(decoded, `${label} ${size}x${size} 图层`, size);
    } else if (item.isIcon?.()) {
      const pixels = Buffer.from(item.pixels);
      const masks = Buffer.from(item.masks);
      const hasPartialAlpha = pixels.some((value, index) => index % 4 === 3 && value > 0 && value < 255);
      const hasTransparentAlpha = pixels.some((value, index) => index % 4 === 3 && value === 0) || masks.some((value) => value !== 0);
      if (item.width !== size || item.height !== size || item.bitmapInfo?.bitCount !== 32) {
        fail(`${label} 的 ${size}x${size} DIB 图层尺寸或色深无效`);
      }
      if (!hasTransparentAlpha || !hasPartialAlpha) {
        fail(`${label} 的 ${size}x${size} DIB 图层缺少透明/半透明信息`);
      }
    } else {
      fail(`${label} 的 ${size}x${size} 图层类型无法识别`);
    }
    actualSizes.push(size);
  }
  if (actualSizes.length !== expectedIco.entries.length || new Set(actualSizes).size !== expectedIco.entries.length) {
    fail(`${label} 图标图层数量不匹配（实际 ${actualSizes.join(',')}，期望 ${expectedIco.entries.map((entry) => entry.width).join(',')}）`);
  }
}

const source = readPng(sourcePath, '透明源图');
if (source.png.width !== source.png.height || source.png.width < 512) {
  fail('透明源图必须为至少 512x512 正方形');
}
verifyPng(source, '透明源图', source.png.width);

const png = readPng(pngPath, 'desktop/build/icon.png');
verifyPng(png, 'desktop/build/icon.png', 512);
verifyClientIcons(png);

const ico = parseIco(icoPath);
const icoSizes = ico.entries.map((entry) => entry.width);
for (const size of requiredIcoSizes) {
  if (!icoSizes.includes(size)) fail(`ICO 缺少 ${size}x${size} 图层（实际：${icoSizes.join(',')}）`);
}
if (icoSizes.length !== requiredIcoSizes.length || icoSizes.some((size) => !requiredIcoSizes.includes(size))) {
  fail(`ICO 图层集合不符合要求（实际：${icoSizes.join(',')}，期望：${requiredIcoSizes.join(',')}）`);
}
for (const entry of ico.entries) {
  verifyPng(entry.decoded, `ICO ${entry.width}x${entry.height}`, entry.width);
}

const sourceMtime = fs.statSync(sourcePath).mtimeMs;
if (fs.statSync(pngPath).mtimeMs < sourceMtime || fs.statSync(icoPath).mtimeMs < sourceMtime) {
  fail('生成的 desktop 图标早于透明源图，疑似使用了旧资源');
}

if (appOutDir) {
  const asarPath = path.join(appOutDir, 'resources', 'app.asar');
  if (!fs.existsSync(asarPath)) fail(`打包结果缺少 app.asar：${asarPath}`);
  const asarRequire = createRequire(path.join(root, 'desktop', 'package.json'));
  const asar = asarRequire('@electron/asar');
  const packedIco = asar.extractFile(asarPath, 'build/JukeboxRoom.ico');
  const packedPng = asar.extractFile(asarPath, 'build/icon.png');
  if (sha256(packedIco) !== sha256(ico.buffer)) fail('app.asar 内的 JukeboxRoom.ico 与最新生成文件不一致');
  if (sha256(packedPng) !== sha256(png.data)) fail('app.asar 内的 build/icon.png 与最新生成文件不一致');
  for (const size of clientIconSizes) {
    const packagedClientIcon = path.join(appOutDir, 'resources', 'client', 'dist', 'icons', `jukeboxroom-${size}.png`);
    const packagedData = fs.existsSync(packagedClientIcon) ? fs.readFileSync(packagedClientIcon) : null;
    const sourceData = fs.readFileSync(path.join(clientIconDir, `jukeboxroom-${size}.png`));
    if (!packagedData) fail(`打包结果缺少 client/dist/icons/jukeboxroom-${size}.png`);
    if (sha256(packagedData) !== sha256(sourceData)) {
      fail(`打包结果中的 client/dist/icons/jukeboxroom-${size}.png 与最新生成资源不一致`);
    }
  }
  verifyExecutableIcon(
    path.join(appOutDir, 'JukeboxRoom.exe'),
    ico,
    '打包结果/JukeboxRoom.exe',
  );
}

if (checkArtifacts) {
  const releaseDir = path.join(root, 'release', 'desktop');
  const desktopPackage = JSON.parse(fs.readFileSync(path.join(root, 'desktop', 'package.json'), 'utf8'));
  const installer = path.join(releaseDir, `jukeboxroom-desktop-setup-${desktopPackage.version}-x64.exe`);
  const unpacked = path.join(releaseDir, 'win-unpacked', 'JukeboxRoom.exe');
  verifyExecutableIcon(unpacked, ico, 'win-unpacked/JukeboxRoom.exe');
  verifyExecutableIcon(installer, ico, 'NSIS 安装程序');
}

const artifactLabel = checkArtifacts ? ' pe=checked' : '';
console.log(`[check-desktop-icon] PASS source=${source.png.width}x${source.png.height} client=[${clientIconSizes.join(',')}] ico=[${icoSizes.join(',')}] sha256=${sha256(ico.buffer)}${artifactLabel}`);
