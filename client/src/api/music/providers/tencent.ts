import type { MusicProvider, SearchResult } from '../types';
import { sourceSearch, sourceResolvePlayUrl } from '../sourceApi';

function normalize(raw: Awaited<ReturnType<typeof sourceSearch>>[number]): SearchResult {
  return {
    id: raw.id,
    source: 'tencent',
    name: raw.name,
    artist: raw.artist,
    album: raw.album || undefined,
    pic: raw.pic || undefined,
    duration: raw.duration,
    vip: raw.vip,
  };
}

/** QQ音乐（QQ 音乐）：搜索走官方网页接口，播放地址由服务端用房主 Cookie 解析 */
export const tencentProvider: MusicProvider = {
  id: 'tencent',
  name: 'QQ音乐',
  shortName: 'QQ音乐',
  color: 'var(--color-primary-hover)',
  supportsSearch: true,
  supportsIdLookup: false,
  description: '房主登录后全房可用 VIP 音源',
  async search(keyword) {
    const songs = await sourceSearch('tencent', keyword);
    return songs.map(normalize).filter((s) => s.id);
  },
  async getSongById() {
    return null;
  },
  async getSongUrl(song, quality?: string) {
    return sourceResolvePlayUrl('tencent', song.id, quality);
  },
  async getLyrics() {
    return '';
  },
  getCoverUrl(song) {
    return song.pic || '';
  },
};
