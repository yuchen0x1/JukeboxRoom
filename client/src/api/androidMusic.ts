import { Capacitor, CapacitorHttp, type HttpOptions, type HttpResponse } from '@capacitor/core';
import type { MusicSource, SearchResult, Song } from '../types';

const NETEASE_SEARCH_URL = 'https://music.163.com/api/search/get/';
const TENCENT_API_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const METING_API_URL = 'https://api.injahow.cn/meting/';
const HOT_PLAYLIST_ID = '3778678';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const DIRECT_SOURCES: Array<Extract<MusicSource, 'netease' | 'tencent'>> = ['netease', 'tencent'];

type HttpResult = Pick<HttpResponse, 'status' | 'headers' | 'url' | 'data'>;

function isNativeAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

async function request(options: HttpOptions): Promise<HttpResult> {
  if (isNativeAndroid()) {
    return CapacitorHttp.request({
      connectTimeout: 12000,
      readTimeout: 15000,
      responseType: 'text',
      ...options,
    });
  }

  const response = await fetch(options.url, {
    method: options.method || 'GET',
    headers: options.headers,
    body: typeof options.data === 'string' ? options.data : options.data ? JSON.stringify(options.data) : undefined,
    redirect: options.disableRedirects ? 'manual' : 'follow',
  });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    url: response.url,
    data: await response.text(),
  };
}

function responseText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return JSON.stringify(value);
}

function responseJson<T>(response: HttpResult, label: string): T {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${label}失败（HTTP ${response.status}）`);
  }
  if (typeof response.data !== 'string') return response.data as T;
  try {
    return JSON.parse(response.data) as T;
  } catch {
    throw new Error(`${label}返回了无法识别的数据`);
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(asObject) : [];
}

function normalizeNeteaseSong(raw: Record<string, unknown>): SearchResult | null {
  if (raw.id == null) return null;
  const album = asObject(raw.album);
  const artists = asArray(raw.artists);
  const coverId = String(album.picId || raw.id);
  return {
    id: String(raw.id),
    source: 'netease',
    name: String(raw.name || '未知歌曲'),
    artist: artists.map((artist) => String(artist.name || '')).filter(Boolean).join(' / ') || '未知歌手',
    album: String(album.name || ''),
    pic: String(album.picUrl || `${METING_API_URL}?server=netease&type=pic&id=${coverId}`),
    duration: Number(raw.duration) || undefined,
  };
}

function normalizeTencentSong(raw: Record<string, unknown>): SearchResult | null {
  const id = String(raw.mid || '');
  if (!id) return null;
  const singers = asArray(raw.singer);
  const album = asObject(raw.album);
  const singerMid = String(singers[0]?.singerMid || '');
  const albumMid = String(album.mid || '');
  return {
    id,
    source: 'tencent',
    name: String(raw.name || '未知歌曲'),
    artist: singers.map((singer) => String(singer.name || '')).filter(Boolean).join(' / ') || '未知歌手',
    album: String(album.name || ''),
    duration: Number(raw.interval) > 0 ? Number(raw.interval) * 1000 : undefined,
    vip: Boolean(asObject(raw.pay).pay_play),
    pic: albumMid
      ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg`
      : singerMid ? `https://y.gtimg.cn/music/photo_new/T001R300x300M000${singerMid}.jpg` : undefined,
  };
}

async function searchNetease(keyword: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ s: keyword, type: '1', limit: '30', offset: '0' });
  const response = await request({
    url: `${NETEASE_SEARCH_URL}?${params}`,
    headers: { 'User-Agent': USER_AGENT, Referer: 'https://music.163.com/', Accept: 'application/json' },
  });
  const payload = asObject(responseJson<unknown>(response, '网易云搜索'));
  const songs = asArray(asObject(payload.result).songs).map(normalizeNeteaseSong).filter((song): song is SearchResult => Boolean(song));
  if (!asObject(payload.result).songs) throw new Error('网易云搜索没有返回歌曲列表');
  return songs;
}

async function searchTencent(keyword: string): Promise<SearchResult[]> {
  const response = await request({
    url: TENCENT_API_URL,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://y.qq.com/', 'User-Agent': USER_AGENT },
    data: {
      req_1: {
        method: 'DoSearchForQQMusicDesktop',
        module: 'music.search.SearchCgiService',
        param: { search_type: 0, query: keyword, page_num: 1, num_per_page: 30 },
      },
    },
  });
  const payload = asObject(responseJson<unknown>(response, 'QQ 音乐搜索'));
  const responseData = asObject(asObject(payload.req_1).data);
  const songList = asObject(asObject(responseData.body).song).list;
  const songs = asArray(songList).map(normalizeTencentSong)
    .filter((song): song is SearchResult => Boolean(song));
  if (!Array.isArray(songList)) {
    throw new Error('QQ 音乐搜索没有返回歌曲列表');
  }
  return songs;
}

export async function searchAndroidSongs(keyword: string, source: MusicSource | 'all' = 'all'): Promise<SearchResult[]> {
  const query = keyword.trim();
  if (!query) return [];
  const sources = source === 'all' || !DIRECT_SOURCES.includes(source as (typeof DIRECT_SOURCES)[number])
    ? DIRECT_SOURCES
    : [source as (typeof DIRECT_SOURCES)[number]];
  const requests = await Promise.allSettled(sources.map((provider) => (
    provider === 'netease' ? searchNetease(query) : searchTencent(query)
  )));
  const successes = requests.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  if (!successes.length) {
    const failure = requests.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    throw failure?.reason instanceof Error ? failure.reason : new Error('音乐平台暂时无法连接');
  }

  const merged: SearchResult[] = [];
  for (let index = 0; index < Math.max(...successes.map((songs) => songs.length)); index += 1) {
    for (const songs of successes) if (songs[index]) merged.push(songs[index]);
  }
  return merged;
}

function metingUrl(source: MusicSource, type: string, id: string, quality?: string): string {
  const params = new URLSearchParams({ server: source, type, id });
  if (quality) params.set('quality', quality);
  return `${METING_API_URL}?${params}`;
}

function responseHeader(response: HttpResult, name: string): string {
  const key = Object.keys(response.headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? String(response.headers[key] || '') : '';
}

function parseRedirectUrl(response: HttpResult, originalUrl: string): string {
  const location = responseHeader(response, 'location').trim();
  if (location) return new URL(location, originalUrl).toString();
  const text = responseText(response.data).trim();
  if (text.startsWith('@')) return text.slice(1);
  if (/^https?:\/\//i.test(text)) return text;
  try {
    const parsed = asObject(JSON.parse(text));
    const url = String(parsed.url || asObject(parsed.data).url || '').trim();
    if (/^https?:\/\//i.test(url)) return url;
  } catch {
    // Most Meting instances return the media address as a redirect.
  }
  throw new Error('音源服务没有返回可播放地址');
}

async function resolveTencentUrl(song: Pick<Song, 'id'>, quality: string): Promise<string> {
  const prefixes: Record<string, string> = { standard: 'M500', higher: 'M500', exhigh: 'M800', lossless: 'F000', hires: 'F000' };
  const response = await request({
    url: TENCENT_API_URL,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://y.qq.com/n/ryqq/player', 'User-Agent': USER_AGENT },
    data: {
      req_1: {
        module: 'vkey.GetVkeyServerBase',
        method: 'CgiGetVkey',
        param: {
          guid: String(Math.floor(Math.random() * 9e9) + 1e9),
          songmid: [song.id],
          songtype: [0],
          uin: '',
          loginflag: 1,
          platform: '20',
          filename: [`${prefixes[quality] || 'M500'}${song.id}.mp3`],
        },
      },
    },
  });
  const payload = asObject(responseJson<unknown>(response, 'QQ 音乐音源解析'));
  const info = asObject(asObject(payload.req_1).data);
  const midurlinfo = asArray(info.midurlinfo);
  const purl = String(midurlinfo[0]?.purl || '');
  if (!purl) throw new Error('这首 QQ 音乐暂时没有可用的播放地址');
  if (/^https?:\/\//i.test(purl)) return purl;
  const hosts = Array.isArray(info.sip) ? info.sip.filter((item): item is string => typeof item === 'string') : [];
  const host = hosts.find((item) => item.startsWith('https://')) || hosts[0] || 'https://ws.stream.qqmusic.qq.com/';
  return `${host}${purl}`;
}

export async function getAndroidSongUrl(song: Pick<Song, 'id' | 'source' | 'url'>, quality: string): Promise<string> {
  if (song.url && /^https?:\/\//i.test(song.url) && !song.url.includes('/api/meting')) return song.url;
  const source = song.source || 'netease';
  if (source === 'tencent') return resolveTencentUrl(song, quality);
  const url = metingUrl('netease', 'url', song.id, quality);
  const response = await request({ url, disableRedirects: true });
  if (response.status < 200 || response.status >= 400) throw new Error(`网易云音源解析失败（HTTP ${response.status}）`);
  return parseRedirectUrl(response, url);
}

export async function getAndroidLyrics(song: Pick<Song, 'id' | 'source' | 'name' | 'lrc'>): Promise<string> {
  if (song.lrc?.startsWith('[')) return song.lrc;
  const source = song.source === 'tencent' ? 'tencent' : 'netease';
  try {
    const response = await request({ url: metingUrl(source, 'lrc', song.id) });
    if (response.status >= 200 && response.status < 300) {
      const lyrics = responseText(response.data).trim();
      if (lyrics) return lyrics;
    }
  } catch {
    // Try the public lyric fallback below.
  }
  if (!song.name) return '';
  const params = new URLSearchParams({ msg: song.name, n: '1' });
  const response = await request({ url: `https://api.52vmy.cn/api/music/lrc?${params}` });
  return response.status >= 200 && response.status < 300 ? responseText(response.data) : '';
}

function normalizeMetingSong(raw: Record<string, unknown>): SearchResult | null {
  const rawUrl = String(raw.url || '');
  const id = raw.id == null ? rawUrl.match(/[?&]id=([^&]+)/)?.[1] : String(raw.id);
  if (!id) return null;
  const artist = Array.isArray(raw.artist)
    ? raw.artist.map((item) => String(asObject(item).name || '')).filter(Boolean).join(' / ')
    : String(raw.artist || raw.author || '未知歌手');
  return {
    id: decodeURIComponent(id),
    source: 'netease',
    name: String(raw.name || raw.title || '未知歌曲'),
    artist: artist || '未知歌手',
    album: String(raw.album || ''),
    pic: String(raw.pic || raw.cover || ''),
    duration: Number(raw.duration || raw.dt) || undefined,
    url: rawUrl || undefined,
    lrc: String(raw.lrc || '') || undefined,
  };
}

export async function getAndroidTopSongs(limit = 30): Promise<SearchResult[]> {
  const response = await request({ url: metingUrl('netease', 'playlist', HOT_PLAYLIST_ID) });
  const songs = asArray(responseJson<unknown>(response, '网易云热榜'))
    .map(normalizeMetingSong)
    .filter((song): song is SearchResult => Boolean(song));
  return songs.slice(0, Math.max(1, limit));
}
