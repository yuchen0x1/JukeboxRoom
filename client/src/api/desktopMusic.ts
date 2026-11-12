import type { MusicSource, SearchResult, Song } from '../types';
import { fetchWithTimeout } from './http';
import { getLyrics, searchSongs } from './music';
import { toProxiedMediaUrl } from '../lib/mediaProxyUrl';

export type DesktopSourceFilter = 'all' | MusicSource;
export type DesktopAccountSource = MusicSource;
export type DesktopSourceLogins = Record<DesktopAccountSource, boolean>;
export type DesktopQrStatus = 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'failed';

export interface DesktopMusicCapabilities {
  sources: Record<MusicSource, {
    search: boolean;
    playback: boolean;
    accountRequiredForVip?: boolean;
  }>;
}

const DESKTOP_SOURCES: Array<Exclude<DesktopSourceFilter, 'all'>> = [
  'netease',
  'tencent',
  'kugou',
  'qishui',
  'migu',
];

export async function searchDesktopSongs(
  keyword: string,
  source: DesktopSourceFilter = 'all',
): Promise<SearchResult[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const sources = source === 'all' ? DESKTOP_SOURCES : [source];
  const batches = await Promise.allSettled(sources.map((provider) => (
    provider === 'qishui' ? searchDesktopQishuiSongs(trimmed) : searchSongs(provider, trimmed)
  )));
  const songs: SearchResult[] = [];
  const seen = new Set<string>();
  let succeeded = false;

  for (const batch of batches) {
    if (batch.status !== 'fulfilled') continue;
    succeeded = true;
    for (const song of batch.value) {
      const key = `${song.source}:${song.id}`;
      if (!song.id || seen.has(key)) continue;
      seen.add(key);
      songs.push(song);
    }
  }

  if (!succeeded) throw new Error('所有选中的音乐源都无法连接');
  return songs;
}

export async function searchDesktopQishuiSongs(keyword: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ source: 'qishui', q: keyword.trim() });
  const res = await fetchWithTimeout(`/api/desktop/music/search?${params}`, {}, 15000);
  const data = await res.json().catch(() => ({})) as { songs?: SearchResult[]; error?: string };
  if (!res.ok) throw new Error(data.error || '汽水音乐搜索失败');
  return Array.isArray(data.songs) ? data.songs : [];
}

export async function getDesktopTopSongs(limit = 30): Promise<SearchResult[]> {
  const res = await fetchWithTimeout(`/api/music/toplist/netease?limit=${limit}`, {}, 15000);
  const data = await res.json().catch(() => ({})) as { songs?: SearchResult[]; error?: string };
  if (!res.ok) throw new Error(data.error || '获取网易云榜单失败');
  return Array.isArray(data.songs) ? data.songs : [];
}

export async function getDesktopMusicCapabilities(): Promise<DesktopMusicCapabilities> {
  const res = await fetchWithTimeout('/api/desktop/music/capabilities');
  if (!res.ok) throw new Error('读取音源状态失败');
  return res.json() as Promise<DesktopMusicCapabilities>;
}

export async function getDesktopSourceLogins(): Promise<DesktopSourceLogins> {
  const res = await fetchWithTimeout('/api/desktop/music/accounts');
  const data = await res.json().catch(() => ({})) as { sources?: Partial<DesktopSourceLogins>; error?: string };
  if (!res.ok) throw new Error(data.error || '读取音乐账号状态失败');
  return {
    netease: Boolean(data.sources?.netease),
    tencent: Boolean(data.sources?.tencent),
    kugou: Boolean(data.sources?.kugou),
    qishui: Boolean(data.sources?.qishui),
    migu: Boolean(data.sources?.migu),
  };
}

export async function startDesktopSourceLogin(source: DesktopAccountSource): Promise<{ sessionKey: string; qrImage: string }> {
  const res = await fetchWithTimeout('/api/desktop/music/accounts/qr/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  }, 15000);
  const data = await res.json().catch(() => ({})) as { sessionKey?: string; qrImage?: string; error?: string };
  if (!res.ok || !data.sessionKey || !data.qrImage) throw new Error(data.error || '获取登录二维码失败');
  return { sessionKey: data.sessionKey, qrImage: data.qrImage };
}

export async function pollDesktopSourceLogin(
  source: DesktopAccountSource,
  sessionKey: string,
): Promise<{ status: DesktopQrStatus; message?: string }> {
  const params = new URLSearchParams({ source, session: sessionKey });
  const res = await fetchWithTimeout(`/api/desktop/music/accounts/qr/poll?${params}`, {}, 12000);
  const data = await res.json().catch(() => ({})) as { status?: DesktopQrStatus; error?: string; message?: string };
  if (!res.ok || !data.status) throw new Error(data.error || '读取登录状态失败');
  return { status: data.status, message: data.message };
}

export async function saveDesktopSourceCookie(source: DesktopAccountSource, cookie: string): Promise<void> {
  const res = await fetchWithTimeout(`/api/desktop/music/accounts/${source}/cookie`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie }),
  });
  const data = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) throw new Error(data.error || '账号凭据保存失败');
}

export async function removeDesktopSourceLogin(source: DesktopAccountSource): Promise<void> {
  const res = await fetchWithTimeout(`/api/desktop/music/accounts/${source}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) throw new Error(data.error || '退出账号失败');
}

export async function sendDesktopMiguSmsCode(phone: string): Promise<void> {
  const res = await fetchWithTimeout('/api/desktop/music/accounts/migu/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  }, 15000);
  const data = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) throw new Error(data.error || '咪咕验证码发送失败');
}

export async function loginDesktopMigu(phone: string, code: string): Promise<void> {
  const res = await fetchWithTimeout('/api/desktop/music/accounts/migu/sms/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  }, 20000);
  const data = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) throw new Error(data.error || '咪咕登录失败');
}

export async function resolveDesktopSongUrl(
  song: Pick<Song, 'id' | 'source'>,
  quality: string,
): Promise<string> {
  const params = new URLSearchParams({ source: song.source || 'netease', id: song.id, quality });
  const res = await fetchWithTimeout(`/api/desktop/music/song-url?${params}`, {}, 20000);
  const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error || '无法获取播放地址');
  return toProxiedMediaUrl(data.url);
}

export async function getDesktopLyrics(song: Pick<Song, 'id' | 'source' | 'name' | 'lrc'>): Promise<string> {
  return getLyrics(song);
}
