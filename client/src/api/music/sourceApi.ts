import { fetchWithTimeout } from '../http';
import { getCurrentRoomId } from '../../lib/roomContext';
import type { MusicSource } from '../../types';

/** /api/music/source/* 路由返回的歌曲结构 */
export interface SourceSearchSong {
  id: string;
  name: string;
  artist: string;
  album?: string;
  pic?: string;
  duration?: number;
  /** 是否 VIP 歌曲（房主登录后可播） */
  vip?: boolean;
  source: MusicSource;
}

/** 房主音源搜索（QQ音乐 / 酷狗 / 自定义源） */
export async function sourceSearch(source: MusicSource, keyword: string): Promise<SourceSearchSong[]> {
  if (!keyword.trim()) return [];
  const params = new URLSearchParams({ source, q: keyword.trim() });
  const roomId = getCurrentRoomId();
  if (roomId) params.set('roomId', roomId);
  const res = await fetchWithTimeout(`/api/music/source/search?${params}`, {}, 15000);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || '音源搜索失败');
  }
  const data = await res.json() as { songs?: SourceSearchSong[] };
  return Array.isArray(data.songs) ? data.songs : [];
}

/** 房主音源播放地址解析（动用该房间房主登录的凭据） */
export async function sourceResolvePlayUrl(source: MusicSource, id: string, quality?: string): Promise<string> {
  const params = new URLSearchParams({ source, id: id.trim() });
  const roomId = getCurrentRoomId();
  if (roomId) params.set('roomId', roomId);
  if (quality) params.set('quality', quality);
  const res = await fetchWithTimeout(`/api/music/source/url?${params}`, {}, 15000);
  const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error || '无法获取播放链接');
  }
  return data.url;
}
