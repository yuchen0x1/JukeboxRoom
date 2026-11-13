import { afterEach, expect, it, vi } from 'vitest';
import { normalizeMobileMetingUrl, DEFAULT_MOBILE_METING_URL } from './mobileSettings';
import { selectAndroidUpdate } from '../api/mobileUpdates';
import { acceptsNativeState, nativeQueueId } from './nativePlayback';

afterEach(() => vi.unstubAllGlobals());
it('validates mobile endpoint configuration without accepting embedded credentials', () => {
  expect(normalizeMobileMetingUrl('')).toBe(DEFAULT_MOBILE_METING_URL);
  for (const value of ['http://example.test', 'https://user:secret@example.test', 'https://example.test/?token=secret', 'javascript:alert(1)']) {
    expect(() => normalizeMobileMetingUrl(value)).toThrow();
  }
});
it('selects the newest actual Android asset even when the latest release is Windows only', () => {
  const release = (version: string, platform: string) => ({ tag_name: `v${version}`, assets: [{ name: `jukeboxroom-${platform}-${version}.${platform === 'android' ? 'apk' : 'exe'}`, browser_download_url: `https://github.com/yuchen0x1/JukeboxRoom/releases/download/v${version}/app.apk` }] });
  const releases = [release('0.0.17', 'desktop'), release('0.0.13', 'android'), release('0.0.12', 'android')];
  expect(selectAndroidUpdate(releases, '0.0.12')).toMatchObject({ version: '0.0.13', updateAvailable: true });
  expect(selectAndroidUpdate(releases, '0.0.17')).toMatchObject({ version: '0.0.13', updateAvailable: false });
  expect(selectAndroidUpdate([{ ...release('0.0.18', 'android'), prerelease: true }], '0.0.12')).toBeNull();
});
it('refuses foreign APK download links', () => {
  expect(selectAndroidUpdate([{ tag_name: 'v0.0.18', assets: [{ name: 'jukeboxroom-android-0.0.18.apk', browser_download_url: 'https://github.com.evil.test/app.apk' }] }], '0.0.17')).toBeNull();
});
it('rejects old native player events after track changes and retries', () => {
  const track = { trackKey: 'song', requestId: 2 };
  const state = { queueId: nativeQueueId(track), status: 'playing' as const, positionMs: 1, durationMs: 1 };
  expect(acceptsNativeState(state, track)).toBe(true);
  expect(acceptsNativeState(state, { ...track, requestId: 3 })).toBe(false);
  expect(acceptsNativeState(state, { ...track, trackKey: 'other' })).toBe(false);
  expect(acceptsNativeState(state, null)).toBe(false);
});
