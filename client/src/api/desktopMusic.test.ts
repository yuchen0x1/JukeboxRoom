import { describe, expect, it } from 'vitest';
import { buildDesktopSongPlaybackUrls } from './desktopMusic';

describe('desktop playback URL fallback', () => {
  it('keeps the original CDN URL as a one-time fallback behind the media proxy', () => {
    const direct = 'https://cdn.example.test/audio/song.mp3';
    const urls = buildDesktopSongPlaybackUrls(direct);

    expect(urls.primary).toBe(`/api/media-proxy?url=${encodeURIComponent(direct)}`);
    expect(urls.fallback).toBe(direct);
  });

  it('does not manufacture a fallback for same-origin media', () => {
    const urls = buildDesktopSongPlaybackUrls('/api/media-proxy?url=already-proxied');

    expect(urls).toEqual({ primary: '/api/media-proxy?url=already-proxied' });
  });
});
