import type { MusicProvider, SearchResult } from '../types';
import { sourceSearch, sourceResolvePlayUrl } from '../sourceApi';

function normalize(raw: Awaited<ReturnType<typeof sourceSearch>>[number]): SearchResult {
  return {
    id: raw.id,
    source: 'qishui',
    name: raw.name,
    artist: raw.artist,
    album: raw.album || undefined,
    pic: raw.pic || undefined,
    duration: raw.duration,
    vip: raw.vip,
  };
}

/** 汽水音乐（汽水音乐，经房主配置的自定义音源接口） */
export const qishuiProvider: MusicProvider = {
  id: 'qishui',
  name: '汽水音乐',
  shortName: '汽水音乐',
  color: '#f5a623',
  supportsSearch: true,
  supportsIdLookup: false,
  description: '汽水音乐（房主配置自定义音源后可用）',
  async search(keyword) {
    const songs = await sourceSearch('qishui', keyword);
    return songs.map(normalize).filter((s) => s.id);
  },
  async getSongById() {
    return null;
  },
  async getSongUrl(song, quality?: string) {
    return sourceResolvePlayUrl('qishui', song.id, quality);
  },
  async getLyrics() {
    return '';
  },
  getCoverUrl(song) {
    return song.pic || '';
  },
};
