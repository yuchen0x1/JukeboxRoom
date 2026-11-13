// Optional local E2E: install Playwright into .evolution/qa-tools first.
// Uses a disposable server, fresh browser contexts and synthetic test tracks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireQa = createRequire(path.join(root, '.evolution/qa-tools/package.json'));
const { chromium } = requireQa('playwright');
const { io } = createRequire(path.join(root, 'client/package.json'))('socket.io-client');
const workspace = path.join(root, '.evolution');
fs.mkdirSync(workspace, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(workspace, 'runtime-queue-'));
const probe = net.createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['index.js'], {
  cwd: path.join(root, 'server'),
  env: {
    ...process.env, PORT: String(port), CLIENT_URL: base, NODE_ENV: 'production',
    OPENMUSIC_DATA_DIR: dataDir, CLIENT_ID_SECRET: randomBytes(32).toString('hex'),
    AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTO_UPDATE: '0',
    REDIS_URL: '', REDIS_HOST: '', LIBRARY_WATCH_ENABLED: '0', MUSIC_LIBRARY_PATHS: '',
    METING_API_URL: '', METING_SEARCH_API_URL: '',
    ADMIN_INIT_USERNAME: '', ADMIN_INIT_PASSWORD: '', JUKEBOX_DESKTOP_MODE: '0',
  }, stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
child.stdout.on('data', (chunk) => { serverLog += chunk; });
child.stderr.on('data', (chunk) => { serverLog += chunk; });
let browser;
const sockets = [];
const errors = [];
const pages = [];

async function socketFor(context, roomId, nickname) {
  // These cookies belong only to the fresh, disposable test contexts.
  const cookie = (await context.cookies(base)).map((item) => `${item.name}=${item.value}`).join('; ');
  const socket = io(base, { transports: ['websocket'], extraHeaders: { Cookie: cookie, Origin: base }, reconnection: false });
  sockets.push(socket);
  await Promise.race([once(socket, 'connect'), once(socket, 'connect_error').then(([err]) => Promise.reject(err))]);
  const joined = await ack(socket, 'join_room', { roomId, nickname });
  assert.equal(joined.success, true, joined.error);
  return socket;
}
function ack(socket, event, payload) {
  return socket.timeout(8000).emitWithAck(event, payload);
}
function visible(page, selector) { return page.locator(`${selector}:visible`).first(); }
function panel(page) { return visible(page, '[aria-label="播放队列管理"]'); }
function watch(page) { pages.push(page); page.on('pageerror', (error) => errors.push(error.message)); }

try {
  const deadline = Date.now() + 20_000;
  while (true) {
    try { if ((await fetch(`${base}/api/health/ready`)).ok) break; } catch { /* starting */ }
    if (Date.now() >= deadline || child.exitCode !== null) throw new Error('Test server did not start');
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  const host = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await host.newPage(); watch(page);
  await page.goto(base); await page.waitForLoadState('networkidle');
  await visible(page, 'input[aria-label="你的昵称"]').fill('测试房主');
  await page.getByRole('button', { name: '创建房间', exact: true }).last().click();
  await page.getByPlaceholder('例如：周杰伦专场').fill('队列交互验收');
  await page.getByRole('button', { name: '创建并进入' }).click();
  await page.waitForURL(/\/room\//);
  await page.waitForLoadState('networkidle');
  const roomId = new URL(page.url()).pathname.split('/').pop();
  console.log(`PASS create room through UI`);

  const guest = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const guestPage = await guest.newPage(); watch(guestPage);
  await guestPage.goto(base); await guestPage.waitForLoadState('networkidle');
  await visible(guestPage, 'input[aria-label="你的昵称"]').fill('测试成员');
  await guestPage.getByRole('button', { name: '加入房间', exact: true }).first().click();
  await guestPage.getByPlaceholder('6 位房间号').fill(roomId);
  await guestPage.getByRole('button', { name: '加入房间', exact: true }).last().click();
  await guestPage.waitForURL(/\/room\//);
  await guestPage.waitForLoadState('networkidle');

  const hostSocket = await socketFor(host, roomId, '测试房主');
  const guestSocket = await socketFor(guest, roomId, '测试成员');
  let room;
  for (let i = 0; i < 12; i += 1) {
    const response = await ack(i > 8 ? guestSocket : hostSocket, 'add_song', {
      song: { id: `queue-e2e-${i}`, source: 'netease', name: `验收曲目 ${i}`, artist: i > 8 ? '成员歌手' : '房主歌手', duration: 600_000 },
    });
    assert.equal(response.success, true, response.error); room = response.room;
  }
  console.log('PASS two user sessions join and enqueue through real Socket.IO');
  await panel(page).getByRole('searchbox', { name: '搜索播放队列' }).fill('成员歌手');
  await panel(page).getByText('3 / 12 首', { exact: true }).waitFor();
  await panel(page).getByRole('searchbox').fill('不存在的歌曲');
  await panel(page).getByText('没有匹配的歌曲，试试其他关键词或重置筛选').waitFor();
  await panel(page).getByRole('button', { name: '重置筛选' }).click();

  await panel(guestPage).getByRole('button', { name: '我的点歌', exact: true }).click();
  await panel(guestPage).getByText('3 / 12 首', { exact: true }).waitFor();
  const denied = await ack(guestSocket, 'remove_songs', { queueIds: [room.queue[0].queueId, room.queue.at(-1).queueId] });
  assert.equal(denied.success, false);
  const deniedCurrent = await ack(hostSocket, 'remove_songs', { queueIds: [room.current.queueId] });
  assert.equal(deniedCurrent.success, false);
  console.log('PASS search, mine filter, permissions and current track protection');

  await panel(guestPage).getByRole('button', { name: '批量管理', exact: true }).click();
  await panel(guestPage).getByRole('button', { name: '全选可移除歌曲' }).click();
  await panel(guestPage).getByRole('button', { name: '移除所选' }).click();
  await panel(guestPage).getByRole('button', { name: '取消', exact: true }).click();
  await panel(guestPage).getByText('已选 3 首', { exact: true }).waitFor();
  await panel(guestPage).getByRole('button', { name: '移除所选' }).click();
  await panel(guestPage).getByRole('button', { name: '确认移除' }).click();
  await panel(guestPage).getByRole('status').filter({ hasText: '已移除 3 首' }).waitFor();
  await panel(page).getByText('8 首待播', { exact: true }).waitFor();
  assert.equal((await ack(hostSocket, 'remove_songs', { queueIds: [room.queue.at(-1).queueId] })).success, false);
  console.log('PASS confirmed batch removal broadcasts to another user; stale retry fails safely');
  await page.screenshot({ path: path.join(root, 'docs/screenshots/queue-management-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  // Mobile queue opens in its own sheet; inspect the rendered controls below if this changes.
  if (!(await panel(page).count()) || !(await panel(page).isVisible())) {
    await page.getByRole('button', { name: '播放队列', exact: true }).click();
  }
  await panel(page).getByRole('searchbox').fill('验收曲目 2');
  await panel(page).getByText('1 / 9 首', { exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile horizontal overflow');
  await page.screenshot({ path: path.join(root, 'docs/screenshots/queue-management-mobile.png'), fullPage: true });
  assert.deepEqual(errors, [], 'Uncaught browser errors');
  console.log('PASS mobile search, responsive layout, desktop/mobile screenshots and zero uncaught JS errors');
} catch (error) {
  console.error(error.stack);
  for (const [index, page] of pages.entries()) {
    await page.screenshot({ path: path.join(workspace, `browser-failure-${index}.png`), fullPage: true }).catch(() => {});
    console.error(`PAGE ${index}:`, (await page.locator('body').innerText().catch(() => '')).slice(0, 5000));
  }
  fs.writeFileSync(path.join(workspace, 'browser-server.log'), serverLog);
  process.exitCode = 1;
} finally {
  sockets.forEach((socket) => socket.disconnect());
  await browser?.close();
  child.kill();
  if (child.exitCode === null) await once(child, 'exit');
  if (path.dirname(dataDir) !== workspace || !path.basename(dataDir).startsWith('runtime-queue-')) throw new Error('Invalid test cleanup path');
  fs.rmSync(dataDir, { recursive: true, force: true });
}
