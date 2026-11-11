#!/usr/bin/env node
/**
 * 前端包体预算检查。
 *
 * 为什么需要：`three-vendor` 有 900KB（gzip 236KB）。它只应在进入 3D 视觉模式
 * （galaxy / topography）时按需下载。曾出现过 zustand 的 use-sync-external-store
 * 被 manualChunks 的 `id.includes('three')` 误匹配进 three-vendor，导致
 * Home → roomStore → react.js → three-vendor 形成静态闭环，所有首屏页面都白拉 900KB。
 *
 * 检查项：
 * 1. 普通入口（Home / Room / TvDisplay / Admin）的静态 import 闭包不得包含 three-vendor。
 * 2. 每个入口的静态闭包 gzip 体积不得超过预算。
 * 3. 3D 入口（GalaxyBackground3D / TopographyBackground3D）必须能解析到 three-vendor。
 *
 * 用法：node scripts/check-bundle.mjs [--dist client/dist]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const THREE_CHUNK = 'three-vendor.js';
const THREE_ONLY_ENTRIES = ['GalaxyBackground3D.js', 'TopographyBackground3D.js'];
/** 静态闭包 gzip 预算（KB）。当前实测 Home≈153、Room≈213、TvDisplay≈160、Admin≈84。 */
const ENTRY_BUDGET_KB = {
  'Home.js': 200,
  'Room.js': 260,
  'TvDisplay.js': 200,
  'Admin.js': 120,
};

function parseArgs(argv) {
  const index = argv.indexOf('--dist');
  if (index !== -1 && argv[index + 1]) return path.resolve(argv[index + 1]);
  return path.join(repoRoot, 'client', 'dist');
}

const distDir = parseArgs(process.argv.slice(2));
const assetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(assetsDir)) {
  console.error(`[bundle] 找不到构建产物：${assetsDir}`);
  console.error('[bundle] 请先运行 npm run build');
  process.exit(1);
}

const staticImportPattern = /(?:from|import)\s*["']\.\/([A-Za-z0-9_.-]+\.js)["']/g;
const depCache = new Map();

function staticDeps(file) {
  if (depCache.has(file)) return depCache.get(file);
  const full = path.join(assetsDir, file);
  if (!fs.existsSync(full)) {
    depCache.set(file, []);
    return [];
  }
  const source = fs.readFileSync(full, 'utf8');
  const deps = new Set();
  for (const match of source.matchAll(staticImportPattern)) deps.add(match[1]);
  const list = [...deps];
  depCache.set(file, list);
  return list;
}

/** 收集入口文件的静态 import 闭包（不含动态 import）。 */
function staticClosure(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const dep of staticDeps(file)) {
      if (!seen.has(dep)) stack.push(dep);
    }
  }
  return seen;
}

function gzipSizeKb(files) {
  let total = 0;
  for (const file of files) {
    const full = path.join(assetsDir, file);
    if (fs.existsSync(full)) {
      total += zlib.gzipSync(fs.readFileSync(full), { level: 9 }).length;
    }
  }
  return total / 1024;
}

const failures = [];
const report = [];

for (const [entry, budgetKb] of Object.entries(ENTRY_BUDGET_KB)) {
  if (!fs.existsSync(path.join(assetsDir, entry))) {
    failures.push(`缺少入口 chunk：${entry}`);
    continue;
  }
  const closure = staticClosure(entry);
  const pullsThree = closure.has(THREE_CHUNK);
  const sizeKb = gzipSizeKb(closure);

  report.push(`${entry.padEnd(14)} chunks=${String(closure.size).padStart(2)} gzip=${sizeKb.toFixed(0)}KB 预算=${budgetKb}KB three=${pullsThree ? 'YES' : 'no'}`);

  if (pullsThree) {
    failures.push(`${entry} 的静态闭包包含 ${THREE_CHUNK}（3D 依赖必须是懒加载）`);
  }
  if (sizeKb > budgetKb) {
    failures.push(`${entry} 静态闭包 gzip ${sizeKb.toFixed(0)}KB 超出预算 ${budgetKb}KB`);
  }
}

for (const entry of THREE_ONLY_ENTRIES) {
  if (!fs.existsSync(path.join(assetsDir, entry))) {
    failures.push(`缺少 3D 入口 chunk：${entry}`);
    continue;
  }
  const closure = staticClosure(entry);
  report.push(`${entry.padEnd(26)} chunks=${String(closure.size).padStart(2)} three=${closure.has(THREE_CHUNK) ? 'YES' : 'NO'}`);
  if (!closure.has(THREE_CHUNK)) {
    failures.push(`${entry} 未能解析到 ${THREE_CHUNK}，3D 页面可能已损坏`);
  }
}

/**
 * Service Worker 必须在构建时注入版本化缓存名。
 * 构建产物是稳定文件名，固定缓存名会让离线用户长期拿到旧 bundle。
 */
const swPath = path.join(distDir, 'sw.js');
if (!fs.existsSync(swPath)) {
  failures.push('缺少 dist/sw.js（PWA 离线壳层）');
} else {
  const swSource = fs.readFileSync(swPath, 'utf8');
  if (swSource.includes('__SW_VERSION__')) {
    failures.push('dist/sw.js 仍包含未替换的 __SW_VERSION__ 占位符');
  }
  const cacheMatch = swSource.match(/const CACHE = `\$\{CACHE_PREFIX\}([^`]+)`/);
  if (!cacheMatch) {
    failures.push('dist/sw.js 未使用版本化缓存名（预期 CACHE = `${CACHE_PREFIX}<version>`）');
  } else {
    report.push(`sw.js cache         ${cacheMatch[1]}`);
  }
}

console.log('[bundle] 静态闭包体积：');
for (const line of report) console.log(`  ${line}`);

if (failures.length > 0) {
  console.error('\n[bundle] 检查未通过：');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}

console.log('\n[bundle] 检查通过：首屏不加载 3D 依赖，且各入口体积在预算内。');
