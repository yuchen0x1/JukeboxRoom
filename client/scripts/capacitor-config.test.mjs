import assert from 'node:assert/strict';
import test from 'node:test';
import { createCapacitorConfig } from './capacitor-config.mjs';

test('Android always bundles its player and leaves the source configuration intact', () => {
  const base = { appId: 'com.openmusic.app', webDir: 'dist', server: { url: 'https://old.test' } };
  const config = createCapacitorConfig(base, 'android', 'https://ios.test');
  assert.equal(config.webDir, 'dist'); assert.equal(config.server, undefined);
  assert.equal(base.server.url, 'https://old.test');
});
test('iOS uses the existing stub directory without replacing a built website', () => {
  const config = createCapacitorConfig({}, 'ios', 'https://music.example.test/');
  assert.equal(config.webDir, 'capacitor-stub');
  assert.equal(config.server.url, 'https://music.example.test');
  assert.equal(config.server.cleartext, false);
});
test('iOS rejects missing or unsafe remote URLs before syncing', () => {
  for (const value of ['', 'http://example.test', 'https://user:secret@example.test', 'https://example.test/#secret']) {
    assert.throws(() => createCapacitorConfig({}, 'ios', value));
  }
  assert.throws(() => createCapacitorConfig({}, 'windows'));
});
