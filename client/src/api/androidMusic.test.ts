import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAndroidLyrics, getAndroidSongUrl, searchAndroidSongsPage } from './androidMusic';
import { saveMobileMetingUrl } from '../lib/mobileSettings';

const native = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' }, CapacitorHttp: native }));
const response = (data: unknown) => ({ status: 200, data, headers: {}, url: '' });

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) });
  native.request.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('Android provider maintenance', () => {
  it('pages Netease correctly and accepts current album/artist fields', async () => {
    native.request.mockResolvedValue(response({ result: { songs: [{ id: 1, name: '曲目', al: { name: '专辑', picUrl: 'https://cdn.test/cover.jpg' }, ar: [{ name: '歌手' }], dt: 120000 }] } }));
    const result = await searchAndroidSongsPage('曲目', 'netease', 3);
    expect(native.request.mock.calls[0][0].url).toContain('offset=60');
    expect(result.songs[0]).toMatchObject({ artist: '歌手', album: '专辑', duration: 120000, pic: 'https://cdn.test/cover.jpg' });
    expect(result.hasMore).toBe(false);
  });
  it('retains another provider when one fails and reports the partial failure', async () => {
    native.request.mockImplementation(async (options) => {
      if (options.method === 'POST') throw new Error('QQ offline');
      return response({ result: { songs: Array.from({ length: 30 }, (_, id) => ({ id, name: '曲目' })) } });
    });
    const result = await searchAndroidSongsPage('曲目');
    expect(result.songs).toHaveLength(30);
    expect(result.hasMore).toBe(true);
    expect(result.warnings[0]).toContain('QQ 音乐');
  });
  it('uses QQ page number and singer fallback artwork', async () => {
    native.request.mockResolvedValue(response({ req_1: { data: { body: { song: { list: [{ mid: 'song', singer: [{ mid: 'singer', name: '歌手' }] }] } } } } }));
    const result = await searchAndroidSongsPage('歌手', 'tencent', 2);
    expect(native.request.mock.calls[0][0].data.req_1.param.page_num).toBe(2);
    expect(result.songs[0].pic).toContain('singer.jpg');
  });
  it('uses the saved HTTPS endpoint for media parsing', async () => {
    saveMobileMetingUrl('https://music.example.test/custom/');
    native.request.mockResolvedValue({ status: 302, headers: { Location: 'https://cdn.test/song.mp3' }, data: '', url: '' });
    expect(await getAndroidSongUrl({ id: '1', source: 'netease' }, 'standard')).toBe('https://cdn.test/song.mp3');
    expect(native.request.mock.calls[0][0].url).toContain('https://music.example.test/custom/?');
  });
  it('falls back to the exact Netease song ID instead of a name match', async () => {
    native.request.mockRejectedValueOnce(new Error('Meting offline')).mockResolvedValueOnce(response({ lrc: { lyric: '[00:01]正确歌词' } }));
    expect(await getAndroidLyrics({ id: '123', source: 'netease', name: '重名歌曲' })).toBe('[00:01]正确歌词');
    expect(native.request.mock.calls[1][0].url).toContain('id=123');
  });
  it('does not interpret unsupported platform IDs as Netease IDs', async () => {
    await expect(getAndroidSongUrl({ id: 'abc', source: 'kugou' }, 'standard')).rejects.toThrow('暂不支持');
    expect(native.request).not.toHaveBeenCalled();
  });
});
