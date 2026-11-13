// Optional UI regression check using the workspace's existing Playwright installation.
// Native media/network responses are fixtures; this is not an Android device playback test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireQa = createRequire(path.join(root, '.evolution/qa-tools/package.json'));
const { chromium } = requireQa('playwright');
const dist = path.join(root, 'client/dist');
const output = process.env.JUKEBOXROOM_QA_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'jukeboxroom-mobile-ui-'));
fs.mkdirSync(output, { recursive: true });
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.md': 'text/markdown', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const file = path.resolve(dist, `.${new URL(req.url, 'http://localhost').pathname}`);
  if (file !== dist && !file.startsWith(dist + path.sep)) { res.writeHead(403).end(); return; }
  const resolved = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dist, 'index.html');
  res.setHeader('content-type', types[path.extname(resolved)] || 'application/octet-stream');
  res.end(fs.readFileSync(resolved));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const errors = [];
let browser;
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.addInitScript(() => {
    window.androidBridge = {};
    window.__qaRequests = [];
    const methods = (names) => names.map((name) => ({ name, rtype: 'promise' }));
    const release = (version, android = false) => ({ tag_name: `v${version}`, published_at: '2026-11-12T21:45:29Z', body: `# JukeboxRoom v${version}\n\n## 本版更新\n- 移动端验收记录`, assets: android ? [{ name: `jukeboxroom-android-${version}-debug.apk`, browser_download_url: `https://github.com/yuchen0x1/JukeboxRoom/releases/download/v${version}/app.apk` }] : [] });
    window.Capacitor = {
      PluginHeaders: [
        { name: 'NativeMedia', methods: [...methods(['getState', 'load', 'play', 'pause', 'stop', 'seekTo', 'setVolume', 'removeListener']), { name: 'addListener', rtype: 'callback' }] },
        { name: 'App', methods: [...methods(['getInfo', 'minimizeApp', 'removeListener']), { name: 'addListener', rtype: 'callback' }] },
        { name: 'CapacitorHttp', methods: methods(['request', 'get']) },
      ],
      nativeCallback: () => 'fixture-listener',
      nativePromise: async (plugin, method, options = {}) => {
        if (plugin === 'App') return { version: '0.0.17' };
        if (plugin === 'NativeMedia') return { queueId: null, status: 'idle', positionMs: 0, durationMs: 0 };
        const url = new URL(options.url); window.__qaRequests.push(options.url);
        let data = [];
        if (url.hostname === 'api.github.com') data = [release('0.0.18'), release('0.0.13', true)];
        else if (url.hostname === 'music.163.com') {
          const query = url.searchParams.get('s'); const offset = Number(url.searchParams.get('offset'));
          if (query === '慢查询') { await new Promise((resolve) => setTimeout(resolve, 300)); window.__slowResolved = true; }
          data = { result: { songs: Array.from({ length: offset ? 1 : 30 }, (_, i) => ({ id: offset + i + 1, name: `${query} ${offset + i + 1}`, artists: [{ name: '测试歌手' }] })) } };
        } else if (url.hostname === 'u.y.qq.com') data = { req_1: { data: { body: { song: { list: [{ mid: 'qq-fixture', name: 'QQ 验收曲目', singer: [{ name: '测试歌手' }] }] } } } } };
        return { status: 200, data, headers: {}, url: options.url };
      },
    };
  });
  const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base); await page.waitForLoadState('networkidle');
  await page.getByRole('navigation', { name: '音乐导航' }).getByRole('button', { name: '搜索', exact: true }).click();
  await page.getByRole('button', { name: '网易云', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索歌曲、歌手或专辑' }).fill('分页');
  await page.getByRole('button', { name: '开始搜索' }).click();
  await page.getByText('分页 30', { exact: true }).waitFor();
  await page.getByRole('button', { name: '加载更多歌曲' }).click();
  await page.getByText('分页 31', { exact: true }).waitFor();
  assert.equal(await page.locator('.android-song-row').count(), 31);
  console.log('PASS Android search pagination preserves existing results');
  await page.getByRole('button', { name: 'QQ音乐', exact: true }).click();
  await page.getByText('QQ 验收曲目', { exact: true }).waitFor();
  assert.equal(await page.locator('.android-song-row').count(), 1);
  await page.getByRole('button', { name: '网易云', exact: true }).click();
  await page.getByText('分页 30', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: '搜索歌曲、歌手或专辑' }).fill('慢查询');
  await page.getByRole('button', { name: '开始搜索' }).click();
  await page.waitForFunction(() => window.__qaRequests.some((url) => url.includes(encodeURIComponent('慢查询'))));
  await page.getByRole('button', { name: '清除搜索' }).click();
  await page.waitForFunction(() => window.__slowResolved);
  await page.getByText('搜一首想听的歌', { exact: true }).waitFor();
  assert.equal(await page.locator('.android-song-row').count(), 0);
  console.log('PASS Android source switching and stale response protection');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('Meting 服务地址（HTTPS）').fill('https://fixture.example.test/meting/');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('音源服务已保存，榜单会重新加载。').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('jukeboxroom:mobile-meting-url:v1')), 'https://fixture.example.test/meting/');
  await page.getByRole('button', { name: '检查 Android 更新' }).click();
  await page.getByText('当前没有更高版本的 Android 安装包', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: /下载 Android/ }).count(), 0);
  await page.getByRole('button', { name: '更新日志', exact: true }).click();
  await page.getByRole('heading', { name: 'v0.0.18', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'v本版更新', exact: true }).count(), 0);
  await page.getByRole('button', { name: '关闭更新日志' }).click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(output, 'android-settings.png'), fullPage: true });
  console.log('PASS Android endpoint settings, asset-aware updates and online release history');

  for (const admin of [false, true]) {
    const web = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    if (admin) await web.addInitScript(() => {
      localStorage.setItem('jukebox_admin_token', 'fixture-admin-token');
      localStorage.setItem('jukebox_admin_user', JSON.stringify({ role: 'admin' }));
    });
    let posts = 0;
    await web.route('**/api/**', (route) => {
      const request = route.request(); const pathname = new URL(request.url()).pathname;
      let body = {}; let status = 200;
      if (pathname === '/api/update') body = { ok: true, currentVersion: '0.0.17', latestVersion: '0.0.18', updateAvailable: true, assets: { desktop: null, android: null, ios: null }, releaseNotes: '验收版本', publishedAt: null };
      else if (pathname === '/api/update/apply/status') body = { ok: true, supported: true, phase: 'idle' };
      else if (pathname === '/api/update/apply') { posts += 1; status = 403; body = { ok: false, error: '权限已撤销' }; }
      else if (pathname === '/api/session/bootstrap') body = { clientId: 'fixture-client' };
      else if (pathname === '/api/rooms') body = [];
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await web.route('**/socket.io/**', (route) => route.abort());
    const webPage = await web.newPage(); webPage.on('pageerror', (error) => errors.push(error.message));
    await webPage.goto(base); await webPage.waitForLoadState('networkidle');
    await webPage.getByRole('status').getByText('发现新版本 v0.0.18', { exact: true }).waitFor();
    if (!admin) assert.equal(await webPage.getByRole('button', { name: '更新服务器', exact: true }).count(), 0);
    else {
      webPage.on('dialog', (dialog) => dialog.accept());
      await webPage.getByRole('button', { name: '更新服务器', exact: true }).click();
      await webPage.getByRole('alert').filter({ hasText: '没有权限执行此操作' }).waitFor();
      assert.equal(posts, 1);
      assert.equal(await webPage.getByText('正在更新服务器', { exact: false }).count(), 0);
    }
    await web.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS Web updater hides administration from visitors and displays permission failures');
  console.log(`Screenshots: ${output}`);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
