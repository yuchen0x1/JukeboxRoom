import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDefaultAllowedMediaHostSuffixes,
  isAllowedMediaHost,
  isAllowedMediaUrl,
  parseConfiguredMediaHosts,
} from './mediaProxyPolicy.js';

test('媒体代理默认允许四类音乐 CDN，拒绝相似但不匹配的域名', () => {
  assert.equal(isAllowedMediaHost('m10.music.126.net'), true);
  assert.equal(isAllowedMediaHost('y.gtimg.cn'), true);
  assert.equal(isAllowedMediaHost('fs.w.kugou.com'), true);
  assert.equal(isAllowedMediaHost('v3-web.douyinvod.com'), true);
  assert.equal(isAllowedMediaHost('evil126.net'), false);
  assert.equal(isAllowedMediaHost('music.example.com'), false);
});

test('额外媒体域名支持通配符并且不会放行协议或凭据', () => {
  const extraHosts = parseConfiguredMediaHosts('cdn.example.com; *.vendor.test');
  assert.deepEqual(extraHosts, ['cdn.example.com', 'vendor.test']);
  assert.equal(isAllowedMediaUrl('https://cdn.example.com/song.mp3', { extraHosts }), true);
  assert.equal(isAllowedMediaUrl('https://a.vendor.test/song.mp3', { extraHosts }), true);
  assert.equal(isAllowedMediaUrl('ftp://cdn.example.com/song.mp3', { extraHosts }), false);
  assert.equal(isAllowedMediaUrl('https://user:pass@cdn.example.com/song.mp3', { extraHosts }), false);
});

test('默认白名单保持可审计的固定集合', () => {
  const suffixes = getDefaultAllowedMediaHostSuffixes();
  assert.ok(suffixes.includes('126.net'));
  assert.ok(suffixes.includes('qq.com'));
  assert.ok(suffixes.includes('kugou.com'));
  assert.ok(suffixes.includes('douyinvod.com'));
});
