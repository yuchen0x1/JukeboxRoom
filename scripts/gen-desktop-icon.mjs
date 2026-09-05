/**
 * 生成桌面版应用图标（desktop/build/icon.png）。
 * 以 client/public/favicon.svg 的红色唱片 logo 为准，512x512，4x4 超采样抗锯齿。
 * 用法：node scripts/gen-desktop-icon.mjs
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outPath = path.join(root, 'desktop', 'build', 'icon.png');

const SIZE = 512;
const SS = 4;

// favicon.svg: <circle r=48 fill=#ec4141> <circle r=20 fill=#1a1a1a> <circle r=6 fill=#ec4141>
const LAYERS = [
  { r: 0.48, color: [0xec, 0x41, 0x41] },
  { r: 0.2, color: [0x1a, 0x1a, 0x1a] },
  { r: 0.06, color: [0xec, 0x41, 0x41] },
];

function circleCoverage(cx, cy, r, x, y) {
  const sampleStep = 1 / SS;
  let hit = 0;
  for (let sy = 0; sy < SS; sy += 1) {
    for (let sx = 0; sx < SS; sx += 1) {
      const px = x + (sx + 0.5) * sampleStep;
      const py = y + (sy + 0.5) * sampleStep;
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= r * r) hit += 1;
    }
  }
  return hit / (SS * SS);
}

const raw = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (const layer of LAYERS) {
      const cov = circleCoverage(SIZE / 2, SIZE / 2, layer.r * SIZE, x, y);
      if (cov === 0) continue;
      const na = cov;
      r = layer.color[0] * na + r * (1 - na);
      g = layer.color[1] * na + g * (1 - na);
      b = layer.color[2] * na + b * (1 - na);
      a = na + a * (1 - na);
    }
    const off = (y * SIZE + x) * 4;
    raw[off] = Math.round(r);
    raw[off + 1] = Math.round(g);
    raw[off + 2] = Math.round(b);
    raw[off + 3] = Math.round(a * 255);
  }
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA

const stride = SIZE * 4;
const scanlined = Buffer.alloc((stride + 1) * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  scanlined[y * (stride + 1)] = 0; // filter: none
  raw.copy(scanlined, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(scanlined, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, png);
console.log(`[gen-desktop-icon] 已生成 ${outPath} (${SIZE}x${SIZE}, ${png.length} bytes)`);
