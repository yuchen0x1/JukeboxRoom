import type { MusicProvider, SearchResult } from '../types';
import { fetchWithTimeout } from '../../http';

async function requestSearch(keyword: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ source: 'migu', q: keyword.trim() });
  const res = await fetchWithTimeout(`/api/desktop/music/search?${params}`, {}, 15000);
  const data = await res.json().catch(() => ({})) as { songs?: SearchResult[]; error?: string };
  if (!res.ok) throw new Error(data.error || '咪咕音乐搜索失败');
  return Array.isArray(data.songs) ? data.songs : [];
}

export const miguProvider: MusicProvider = {
  id: 'migu',
  name: '咪咕音乐',
  shortName: '咪咕音乐',
  color: '#20c4f4',
  supportsSearch: true,
  supportsIdLookup: false,
  description: '试验性接入：手机号验证码登录后解析播放',
  async search(keyword) {
    return requestSearch(keyword);
  },
  async getSongById() {
    return null;
  },
  async getSongUrl(song, quality) {
    const params = new URLSearchParams({ source: 'migu', id: song.id, quality: quality || 'standard' });
    const res = await fetchWithTimeout(`/api/desktop/music/song-url?${params}`, {}, 20000);
    const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
    if (!res.ok || !data.url) throw new Error(data.error || '无法获取咪咕音乐播放地址');
    return data.url;
  },
  async getLyrics(song) {
    if (song.lrc?.startsWith('[')) return song.lrc;
    if (!song.lrc) return '';
    const res = await fetchWithTimeout(song.lrc, {}, 15000);
    return res.ok ? res.text() : '';
  },
  getCoverUrl(song) {
    return song.pic || '';
  },
};
