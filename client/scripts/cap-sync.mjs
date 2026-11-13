/** Sync Android's bundled player or the iOS HTTPS site without deleting web builds. */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCapacitorConfig } from './capacitor-config.mjs';

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(clientRoot, 'capacitor.config.json');
const envPath = resolve(clientRoot, '.env.capacitor');
const platform = process.argv[2] || 'android';
const original = readFileSync(configPath);
let serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || '';
if (!serverUrl && existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const match = rawLine.trim().match(/^CAPACITOR_SERVER_URL=(.+)$/);
    if (match) { serverUrl = match[1].trim().replace(/^["']|["']$/g, ''); break; }
  }
}

try {
  const config = createCapacitorConfig(JSON.parse(original.toString('utf8')), platform, serverUrl);
  if (platform === 'android') {
    console.log('[cap-sync] Android 独立播放器：构建并同步本地资源');
    const build = spawnSync('npm run build', { cwd: clientRoot, stdio: 'inherit', shell: true });
    if (build.status !== 0) throw new Error('前端构建失败，未同步原生工程');
  } else {
    console.log('[cap-sync] iOS 远程站点：同步占位资源，保留现有 dist');
  }
  try {
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const sync = spawnSync('npx', ['cap', 'sync', platform], { cwd: clientRoot, stdio: 'inherit', shell: process.platform === 'win32' });
    if (sync.error) throw sync.error;
    if (sync.status !== 0) throw new Error(`Capacitor ${platform} 同步失败`);
  } finally {
    // Restore byte-for-byte, even when the native toolchain rejects the sync.
    writeFileSync(configPath, original);
  }
} catch (error) {
  console.error(`[cap-sync] ${error instanceof Error ? error.message : '同步失败'}`);
  process.exitCode = 1;
}
