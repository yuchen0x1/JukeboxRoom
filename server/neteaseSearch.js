/**
 * 网易云音乐 Web API 直连搜索（免费、无需 Key）。
 *
 * 热榜（neteaseToplist.js）已采用同样的 music.163.com 直连方式。
 * 公共 Meting 实例普遍不支持 type=search / search_playlist，
 * 因此这两类请求优先走本模块，失败时由调用方回退 Meting 搜索备源。
 */

const NETEASE_SEARCH_URL = 'https://music.163.com/api/search/get/';
const NETEASE_DETAIL_URL = 'https://music.163.com/api/song/detail';
const NETEASE_LYRIC_URL = 'https://music.163.com/api/song/lyric';
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 200;
const METADATA_CACHE_TTL_MS = 10 * 60_000;

const NETEASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://music.163.com/',
  Accept: 'application/json',
};

/** @type {Map<string, { expiresAt: number; data: object[] }>} */
const cache = new Map();
const songMetadataCache = new Map();
const lyricCache = new Map();

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function writeCache(key, data) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data });
}

async function neteaseSearchGet(params) {
  const url = `${NETEASE_SEARCH_URL}?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { headers: NETEASE_HEADERS, signal: controller.signal });
    if (!response.ok) throw new Error(`网易搜索接口返回 HTTP ${response.status}`);
    const body = await response.json();
    if (!body?.result) throw new Error('网易搜索接口返回异常数据');
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

async function neteaseJsonGet(url, params) {
  const query = new URLSearchParams(params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${url}?${query}`, {
      headers: {
        ...NETEASE_HEADERS,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`网易接口返回 HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function readMetadataCache(cacheStore, key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }
  return entry.value;
}

function writeMetadataCache(cacheStore, key, value) {
  if (cacheStore.size >= CACHE_MAX_ENTRIES) {
    cacheStore.delete(cacheStore.keys().next().value);
  }
  cacheStore.set(key, {
    expiresAt: Date.now() + METADATA_CACHE_TTL_MS,
    value,
  });
}

/** 归一化为 Meting 风格歌曲结构（不含 url/lrc，播放与歌词由客户端经主源按需解析） */
function normalizeSong(raw) {
  if (!raw || raw.id == null) return null;
  const id = String(raw.id);
  const artists = Array.isArray(raw.artists) ? raw.artists : [];
  return {
    id,
    name: String(raw.name || '未知歌曲'),
    artist: artists.map((a) => a?.name).filter(Boolean).join(' / ') || '未知歌手',
    album: raw.album?.name || undefined,
    // 网易搜索接口近期只返回 picId，不再稳定返回 picUrl；使用同源详情代理兜底。
    pic: raw.album?.picUrl || `/api/music/netease/cover?id=${encodeURIComponent(id)}`,
    duration: typeof raw.duration === 'number' && raw.duration > 0 ? raw.duration : undefined,
  };
}

function normalizePlaylist(raw) {
  if (!raw || raw.id == null) return null;
  return {
    id: String(raw.id),
    name: String(raw.name || '未命名歌单'),
    coverImgUrl: raw.coverImgUrl || raw.picUrl || undefined,
    creator: raw.creator?.nickname ? { nickname: String(raw.creator.nickname) } : undefined,
    trackCount: Number(raw.trackCount) || 0,
    playCount: Number(raw.playCount) || 0,
  };
}

/**
 * 网易云歌曲搜索。返回 Meting 风格歌曲数组；无结果返回空数组，
 * 接口异常时抛错（调用方决定是否回退 Meting 备源）。
 */
export async function neteaseSearchSongs(keyword, limit = 30) {
  const key = `song:${keyword}:${limit}`;
  const cached = readCache(key);
  if (cached) return cached;

  const result = await neteaseSearchGet(new URLSearchParams({ s: keyword, type: '1', limit: String(limit), offset: '0' }));
  if (!Array.isArray(result.songs)) throw new Error('网易歌曲搜索返回缺少数组');
  const songs = result.songs.map(normalizeSong).filter(Boolean);
  writeCache(key, songs);
  return songs;
}

/** 获取网易云歌曲详情中的专辑封面地址（无 Meting 时供封面代理使用）。 */
export async function fetchNeteaseSongCover(id) {
  const songId = String(id || '').trim();
  if (!/^\d{1,20}$/.test(songId)) return '';

  const cached = readMetadataCache(songMetadataCache, songId);
  if (cached !== null) return cached;

  try {
    const data = await neteaseJsonGet(NETEASE_DETAIL_URL, {
      ids: JSON.stringify([songId]),
    });
    const cover = String(data?.songs?.[0]?.album?.picUrl || '').trim();
    writeMetadataCache(songMetadataCache, songId, cover);
    return cover;
  } catch {
    return '';
  }
}

/** 获取网易云官方 LRC（Meting 不可用时的歌词兜底）。 */
export async function fetchNeteaseSongLyrics(id) {
  const songId = String(id || '').trim();
  if (!/^\d{1,20}$/.test(songId)) return '';

  const cached = readMetadataCache(lyricCache, songId);
  if (cached !== null) return cached;

  try {
    const data = await neteaseJsonGet(NETEASE_LYRIC_URL, {
      id: songId,
      lv: '1',
      kv: '1',
      tv: '-1',
    });
    const lyric = String(data?.lrc?.lyric || '').trim();
    writeMetadataCache(lyricCache, songId, lyric);
    return lyric;
  } catch {
    return '';
  }
}

/** 测试/运维用：清理网易元数据缓存，避免跨请求持有旧结果。 */
export function clearNeteaseMetadataCache() {
  songMetadataCache.clear();
  lyricCache.clear();
}

/** 网易云歌单搜索，结构与客户端 normalizePlaylist 期望字段对齐 */
export async function neteaseSearchPlaylists(keyword, limit = 30) {
  const key = `playlist:${keyword}:${limit}`;
  const cached = readCache(key);
  if (cached) return cached;

  const result = await neteaseSearchGet(new URLSearchParams({ s: keyword, type: '1000', limit: String(limit), offset: '0' }));
  if (!Array.isArray(result.playlists)) throw new Error('网易歌单搜索返回缺少数组');
  const playlists = result.playlists.map(normalizePlaylist).filter(Boolean);
  writeCache(key, playlists);
  return playlists;
}
