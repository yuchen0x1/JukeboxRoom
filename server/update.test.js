import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANNEL_GITEE,
  compareVersions,
  createUpdateService,
  isAllowedReleaseRedirectUrl,
  normalizeRelease,
  parseVersion,
  resolveChannel,
} from './update.js';

const giteeAsset = (name) => `https://gitee.com/yuchen0x1/JukeboxRoom/releases/download/v2.0.2/${name}`;

test('版本比较支持 v 前缀和缺省的小版本号', () => {
  assert.deepEqual(parseVersion('v2.3'), [2, 3, 0]);
  assert.equal(compareVersions('v2.0.10', '2.0.2'), 1);
  assert.equal(compareVersions('2.0.0', 'v2.0.0'), 0);
  assert.equal(compareVersions('2.0.0', '2.1.0'), -1);
});

test('Release 只解析 Gitee 官方桌面、Android 和 iOS 资产', () => {
  const release = normalizeRelease({
    tag_name: 'v2.0.2',
    name: 'OpenMusic v2.0.2',
    html_url: 'https://gitee.com/yuchen0x1/JukeboxRoom/releases/tag/v2.0.2',
    assets: [
      { name: 'jukeboxroom-desktop-setup-v2.0.2-x64.exe', browser_download_url: giteeAsset('desktop-setup.exe'), size: 10 },
      { name: 'openmusic-android-v2.0.2.apk', browser_download_url: giteeAsset('android.apk'), size: 20 },
      { name: 'openmusic-ios-v2.0.2.ipa', browser_download_url: giteeAsset('ios.ipa'), size: 30 },
    ],
  });
  assert.equal(release.latestVersion, '2.0.2');
  assert.equal(release.assets.desktop.name, 'jukeboxroom-desktop-setup-v2.0.2-x64.exe');
  assert.equal(release.assets.desktop.url, giteeAsset('desktop-setup.exe'));
  assert.equal(release.assets.android.url, giteeAsset('android.apk'));
  assert.equal(release.assets.ios.url, giteeAsset('ios.ipa'));
  assert.equal(release.releaseUrl, 'https://gitee.com/yuchen0x1/JukeboxRoom/releases/tag/v2.0.2');
});

test('Release 只识别正式 JukeboxRoom Windows 安装程序', () => {
  const release = normalizeRelease({
    tag_name: 'v0.0.5',
    assets: [
      { name: 'jukeboxroom-desktop-portable-0.0.5-x64.exe', browser_download_url: giteeAsset('portable.exe'), size: 10 },
      { name: 'jukeboxroom-desktop-0.0.5-x64.zip', browser_download_url: giteeAsset('desktop.zip'), size: 10 },
      { name: 'jukeboxroom-desktop-setup-0.0.5-x64.exe', browser_download_url: giteeAsset('setup.exe'), size: 10 },
    ],
  });
  assert.equal(release.assets.desktop.name, 'jukeboxroom-desktop-setup-0.0.5-x64.exe');
  assert.equal(release.assets.desktop.url, giteeAsset('setup.exe'));
});

test('国外更新地址和资产直链全部被拒绝', () => {
  assert.equal(isAllowedReleaseRedirectUrl('https://github.com/example/app/releases/download/v2.0.2/app.apk'), false);
  assert.equal(isAllowedReleaseRedirectUrl('https://objects.githubusercontent.com/app.apk'), false);
  assert.equal(normalizeRelease({ tag_name: 'v2.0.2', html_url: 'https://github.com/example/app/releases', assets: [] }).releaseUrl, null);
});

test('更新通道固定为 Gitee，即使存在旧的国外通道配置', async () => {
  const oldChannel = process.env.UPDATE_CHANNEL;
  process.env.UPDATE_CHANNEL = 'github';
  try {
    assert.equal(await resolveChannel(), CHANNEL_GITEE);
  } finally {
    if (oldChannel === undefined) delete process.env.UPDATE_CHANNEL;
    else process.env.UPDATE_CHANNEL = oldChannel;
  }
});

test('Gitee 更新服务只请求一次官方地址并缓存结果', async () => {
  let calls = 0;
  const urls = [];
  const service = createUpdateService({
    currentVersion: '2.0.0',
    cacheTtlMs: 60_000,
    fetchImpl: async (url, options) => {
      calls += 1;
      urls.push({ url: String(url), headers: options.headers });
      return { ok: true, async json() { return { tag_name: 'v2.0.1', assets: [] }; } };
    },
  });
  const first = await service.getUpdateInfo();
  const second = await service.getUpdateInfo();
  assert.equal(first.channel, CHANNEL_GITEE);
  assert.equal(first.updateAvailable, true);
  assert.equal(second.checkedAt, first.checkedAt);
  assert.equal(calls, 1);
  assert.equal(urls[0].url.startsWith('https://gitee.com/'), true);
  assert.equal(urls[0].headers.Authorization, undefined);
});

test('Gitee token通过官方请求头发送', async () => {
  let headers;
  const service = createUpdateService({
    giteeToken: 'gitee-test-token',
    fetchImpl: async (_url, options) => {
      headers = options.headers;
      return { ok: true, async json() { return { tag_name: 'v2.0.1', assets: [] }; } };
    },
  });
  await service.getUpdateInfo();
  assert.equal(headers.Authorization, 'token gitee-test-token');
});

test('Gitee 暂时不可用时不回退国外源', async () => {
  const requested = [];
  const service = createUpdateService({
    fetchImpl: async (url) => {
      requested.push(String(url));
      return { ok: false, status: 503 };
    },
  });
  await assert.rejects(service.getUpdateInfo(), /Gitee 更新源返回 HTTP 503/);
  assert.equal(requested.length, 2);
  assert.equal(requested.every((url) => url.startsWith('https://gitee.com/')), true);
});

test('Gitee API 受限时从 Gitee Release 页面读取版本', async () => {
  const requested = [];
  const service = createUpdateService({
    currentVersion: '2.0.0',
    fetchImpl: async (url) => {
      requested.push(String(url));
      if (String(url).includes('/api/v5/')) return { ok: false, status: 403 };
      return {
        ok: true,
        async text() {
          return `<a class='releases-sidebar-item' data-tag='v2.0.1' href='#release-v2.0.1'>最新</a><a class="title" href="/yuchen0x1/JukeboxRoom/releases/tag/v2.0.1">国内发行版 v2.0.1</a>`;
        },
      };
    },
  });
  const info = await service.getUpdateInfo();
  assert.equal(info.latestVersion, '2.0.1');
  assert.equal(info.updateAvailable, true);
  assert.equal(requested.length, 2);
  assert.equal(requested.every((url) => url.startsWith('https://gitee.com/')), true);
});

test('Gitee API 受限时可解析 Gitee 的 JSON 页面响应', async () => {
  const service = createUpdateService({
    currentVersion: '2.0.0',
    fetchImpl: async (url) => {
      if (String(url).includes('/api/v5/')) return { ok: false, status: 403 };
      return {
        ok: true,
        async text() {
          return JSON.stringify({ releases: [{ tag: { name: 'v2.0.1' }, release: { title: '国内 JSON 发行版', path: '/yuchen0x1/JukeboxRoom/releases/tag/v2.0.1', description: 'JSON fallback' } }] });
        },
      };
    },
  });
  const info = await service.getUpdateInfo();
  assert.equal(info.latestVersion, '2.0.1');
  assert.equal(info.releaseName, '国内 JSON 发行版');
  assert.equal(info.updateAvailable, true);
});

test('更新源短暂故障时返回最近一次成功结果', async () => {
  let calls = 0;
  const service = createUpdateService({
    currentVersion: '2.0.0',
    cacheTtlMs: 0,
    staleCacheTtlMs: 60_000,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return { ok: true, async json() { return { tag_name: 'v2.0.1', assets: [] }; } };
      return { ok: false, status: 503 };
    },
  });
  await service.getUpdateInfo();
  const stale = await service.getUpdateInfo();
  assert.equal(stale.stale, true);
  assert.equal(stale.latestVersion, '2.0.1');
});
