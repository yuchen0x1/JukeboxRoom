import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANNEL_GITHUB,
  compareVersions,
  createUpdateService,
  isAllowedReleaseRedirectUrl,
  normalizeRelease,
  parseVersion,
  resolveChannel,
} from './update.js';

const githubAsset = (name) => `https://github.com/yuchen0x1/JukeboxRoom/releases/download/v2.0.2/${name}`;

test('版本比较支持 v 前缀和缺省的小版本号', () => {
  assert.deepEqual(parseVersion('v2.3'), [2, 3, 0]);
  assert.equal(compareVersions('v2.0.10', '2.0.2'), 1);
  assert.equal(compareVersions('2.0.0', 'v2.0.0'), 0);
  assert.equal(compareVersions('2.0.0', '2.1.0'), -1);
});

test('Release 只解析 GitHub 官方桌面、Android 和 iOS 资产', () => {
  const release = normalizeRelease({
    tag_name: 'v2.0.2',
    name: 'JukeboxRoom v2.0.2',
    html_url: 'https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v2.0.2',
    assets: [
      { name: 'jukeboxroom-desktop-setup-v2.0.2-x64.exe', browser_download_url: githubAsset('desktop-setup.exe'), size: 10 },
      { name: 'openmusic-android-v2.0.2.apk', browser_download_url: githubAsset('android.apk'), size: 20 },
      { name: 'openmusic-ios-v2.0.2.ipa', browser_download_url: githubAsset('ios.ipa'), size: 30 },
    ],
  });
  assert.equal(release.latestVersion, '2.0.2');
  assert.equal(release.assets.desktop.name, 'jukeboxroom-desktop-setup-v2.0.2-x64.exe');
  assert.equal(release.assets.desktop.url, githubAsset('desktop-setup.exe'));
  assert.equal(release.assets.android.url, githubAsset('android.apk'));
  assert.equal(release.assets.ios.url, githubAsset('ios.ipa'));
  assert.equal(release.releaseUrl, 'https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v2.0.2');
});

test('Release 只识别正式 JukeboxRoom Windows 安装程序', () => {
  const release = normalizeRelease({
    tag_name: 'v0.0.5',
    assets: [
      { name: 'jukeboxroom-desktop-portable-0.0.5-x64.exe', browser_download_url: githubAsset('portable.exe'), size: 10 },
      { name: 'jukeboxroom-desktop-0.0.5-x64.zip', browser_download_url: githubAsset('desktop.zip'), size: 10 },
      { name: 'jukeboxroom-desktop-setup-0.0.5-x64.exe', browser_download_url: githubAsset('setup.exe'), size: 10 },
    ],
  });
  assert.equal(release.assets.desktop.name, 'jukeboxroom-desktop-setup-0.0.5-x64.exe');
  assert.equal(release.assets.desktop.url, githubAsset('setup.exe'));
});

test('GitHub Release 资产域名与重定向 CDN 被放行，其他来源被拒绝', () => {
  assert.equal(isAllowedReleaseRedirectUrl(githubAsset('app.apk')), true);
  assert.equal(isAllowedReleaseRedirectUrl('https://objects.githubusercontent.com/app.apk'), true);
  assert.equal(isAllowedReleaseRedirectUrl('https://release-assets.githubusercontent.com/app.apk'), true);
  assert.equal(isAllowedReleaseRedirectUrl('https://gitee.com/yuchen0x1/JukeboxRoom/releases/download/v2.0.2/app.apk'), false);
  assert.equal(isAllowedReleaseRedirectUrl('https://evil.example.com/app.apk'), false);
  assert.equal(normalizeRelease({ tag_name: 'v2.0.2', html_url: 'https://gitee.com/example/app/releases', assets: [] }).releaseUrl, null);
});

test('更新通道固定为 GitHub，即使存在其他通道配置', async () => {
  const oldChannel = process.env.UPDATE_CHANNEL;
  process.env.UPDATE_CHANNEL = 'gitee';
  try {
    assert.equal(await resolveChannel(), CHANNEL_GITHUB);
  } finally {
    if (oldChannel === undefined) delete process.env.UPDATE_CHANNEL;
    else process.env.UPDATE_CHANNEL = oldChannel;
  }
});

test('GitHub 更新服务只请求一次官方地址并缓存结果', async () => {
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
  assert.equal(first.channel, CHANNEL_GITHUB);
  assert.equal(first.updateAvailable, true);
  assert.equal(second.checkedAt, first.checkedAt);
  assert.equal(calls, 1);
  assert.equal(urls[0].url.startsWith('https://api.github.com/repos/'), true);
  assert.equal(urls[0].headers.Authorization, undefined);
  assert.equal(urls[0].headers.Accept, 'application/vnd.github+json');
});

test('GitHub token 通过 Bearer 请求头发送', async () => {
  let headers;
  const service = createUpdateService({
    githubToken: 'github-test-token',
    fetchImpl: async (_url, options) => {
      headers = options.headers;
      return { ok: true, async json() { return { tag_name: 'v2.0.1', assets: [] }; } };
    },
  });
  await service.getUpdateInfo();
  assert.equal(headers.Authorization, 'Bearer github-test-token');
});

test('GitHub 暂时不可用时不回退其他源', async () => {
  const requested = [];
  const service = createUpdateService({
    fetchImpl: async (url) => {
      requested.push(String(url));
      return { ok: false, status: 503 };
    },
  });
  await assert.rejects(service.getUpdateInfo(), /GitHub 更新源返回 HTTP 503/);
  assert.equal(requested.length, 2);
  assert.equal(requested.every((url) => url.startsWith('https://github.com/') || url.startsWith('https://api.github.com/')), true);
});

test('GitHub API 限流时从 releases.atom 订阅源读取版本', async () => {
  const requested = [];
  const service = createUpdateService({
    currentVersion: '2.0.0',
    fetchImpl: async (url) => {
      requested.push(String(url));
      if (String(url).includes('/api.github.com/')) return { ok: false, status: 403 };
      return {
        ok: true,
        async text() {
          return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">
            <entry>
              <id>tag:github.com,2008:Repository/1/v2.0.1</id>
              <updated>2026-11-02T10:00:00Z</updated>
              <link rel="alternate" type="text/html" href="https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v2.0.1"/>
              <title>JukeboxRoom v2.0.1</title>
              <content type="html">&lt;p&gt;GitHub 发行版&lt;/p&gt;</content>
            </entry>
          </feed>`;
        },
      };
    },
  });
  const info = await service.getUpdateInfo();
  assert.equal(info.latestVersion, '2.0.1');
  assert.equal(info.releaseName, 'JukeboxRoom v2.0.1');
  assert.equal(info.updateAvailable, true);
  assert.equal(requested.length, 2);
  assert.equal(requested[1], 'https://github.com/yuchen0x1/JukeboxRoom/releases.atom');
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
