import type { MusicProvider, SearchResult } from '../types';
import { sourceSearch, sourceResolvePlayUrl, type SourceSearchSong } from '../sourceApi';

function normalize(raw: SourceSearchSong): SearchResult {
  return {
    id: raw.id,
    source: 'kugou',
    name: raw.name,
    artist: raw.artist,
    album: raw.album || undefined,
    pic: raw.pic || undefined,
    duration: raw.duration,
    vip: raw.vip,
  };
}

/** 酷狗音乐（酷狗音乐）：官方网页搜索，播放地址由服务端按房主登录态解析 */
export const kugouProvider: MusicProvider = {
  id: 'kugou',
  name: '酷狗音乐',
  shortName: '酷狗音乐',
  color: '#2688ee',
  supportsSearch: true,
  supportsIdLookup: false,
  description: '酷狗音乐（房主登录后可用 VIP 音源）',
  async search(keyword) {
    const songs = await sourceSearch('kugou', keyword);
    return songs.map(normalize).filter((s) => s.id);
  },

  async getSongById() {
    return null;
  },

  async getSongUrl(song, quality?: string) {
    return sourceResolvePlayUrl('kugou', song.id, quality);
  },

  async getLyrics() {
    // 歌词由 api/music/index.ts 的 fallback（按歌名）兜底
    return '';
  },

  getCoverUrl(song) {
    return song.pic || '';
  },
};
