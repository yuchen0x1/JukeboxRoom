import './loadEnv.js';

// 兜底：定时任务/后台异步里的未捕获拒绝绝不能带走整个进程。
// 一旦进程退出，内存模式下的所有房间会瞬间消失，前端表现为「加载房间列表失败」。
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.message : reason);
});
process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error?.stack || error?.message || error);
});

import { resizeCoverForThumb } from './coverUrl.js';
import { serveUpstreamMedia } from './mediaProxy.js';
import { fetchMeting, formatMetingFetchError, joinMetingEndpoint } from './metingFetch.js';
import {
  searchTencent,
  searchKugou,
  searchQishui,
  resolveTencentPlayUrl,
  resolveKugouPlayUrl,
  resolveQishuiPlayUrl,
  startTencentQrLogin,
  pollTencentQrLogin,
  startKugouQrLogin,
  pollKugouQrLogin,
  startQishuiLogin,
  pollQishuiLogin,
  startNeteaseLogin,
  pollNeteaseLogin,
  resolveNeteasePlayUrl,
  startDesktopQishuiLogin,
  pollDesktopQishuiLogin,
  searchDesktopQishuiWithHealth,
  resolveDesktopQishuiPlayUrlWithHealth,
  clearDesktopQishuiLogin,
} from './sourceResolvers.js';
import { neteaseSearchSongs, neteaseSearchPlaylists } from './neteaseSearch.js';
import { mountWechatFileHelperProxy } from './wechatFileHelperProxy.js';
import { buildRobotsTxt, buildSitemapXml, resolveSiteOrigin } from './seoFiles.js';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { lookup } from 'dns/promises';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { resolveSecrets } from './security/secrets.js';
import { createRuntimeObservability } from './runtimeObservability.js';
import { isPrivateHostname, isPrivateIp as isOutboundPrivateIp, isSafeHttpUrl, resolveValidatedHttpUrl, safeFetchFollow } from './outboundUrl.js';
import {
  rateLimiter,
  createSocketRateLimiter,
  createConcurrencyLimiter,
  slidingCount,
} from './rateLimiter.js';
import { initRedisAdapter, closeRedis } from './redisAdapter.js';
import { registerUser, loginUser, authMiddleware, requireRole, ensureInitialAdmin, authRouter } from './auth/index.js';
import { taskRouter, startTaskScheduler, stopTaskScheduler } from './tasks/index.js';
import { adminRouter } from './admin/index.js';
import { recordAudit } from './audit/index.js';
import { libraryRouter, startLibraryWatcher, stopLibraryWatcher } from './library/index.js';
import { autodjRouter } from './autodj/index.js';
import { playlistsRouter } from './playlists/index.js';
import {
  collectDeviceIdsForUser,
  getUserIdForDevice,
  isAccessBanned,
  linkDeviceToUser,
  sanitizeDeviceId,
} from './deviceIdentity.js';
import {
  createRoom,
  getRoomPublic,
  getRoom,
  listRooms,
  listRoomIds,
  verifyRoomPassword,
  roomExists,
  initRooms,
  closeRoomManager,
  isRedisEnabled,
  addUser,
  removeUser,
  renameUser,
  renameRoom,
  setRoomLock,
  setRoomAudioQuality,
  setRoomSourceCredential,
  getRoomSourceCredential,
  ensureSeedRoom,
  setRoomMemberTier,
  removeRoomMemberTier,
  setRoomMemberSettings,
  postMemberWelcomeMessage,
  setRoomFmMode,
  setRoomAnnouncement,
  setSongRequestEnabled,
  banRoomSong,
  unbanRoomSong,
  setChatMute,
  addToQueue,
  removeFromQueue,
  clearQueue,
  skipSong,
  finishCurrentSong,
  ensurePlayback,
  retryStuckRandomLoading,
  markRandomLoading,
  setPlaying,
  seekTo,
  getRoomInternal,
  buildPlaybackState,
  requestJump,
  toggleQueueLike,
  toggleCurrentDislike,
  approveJump,
  rejectJump,
  requestSkip,
  approveSkip,
  rejectSkip,
  addChatMessage,
  toggleChatReaction,
  getChatHistoryForUser,
  getSongHistory,
  INITIAL_CHAT_LIMIT,
  advancePlaybackIfEnded,
  getPlaybackTime,
  canUserMutate,
  kickUser,
  transferOwner,
  setRoomAdmin,
  updateUserLocation,
  reportTrackDuration,
  setOnRoomPrefetchReady,
  setOnRoomStructureChanged,
  serializeRoomForViewer,
  prepareRoomBroadcast,
  roomUpdateForViewer,
} from './roomManager.js';
import {
  isCyapiConfigured,
  searchKugouMusic,
  getKugouSongDetail,
} from './cyapi.js';
import { importNeteasePlaylist, importQqPlaylist, fetchNeteasePlaylistMetas } from './playlistImport.js';
import { fetchNeteaseHotToplist } from './neteaseToplist.js';
import {
  closeRoomStorage,
  importFavoriteSongs,
  listFavoriteSongs,
  setFavoriteSong,
} from './roomStorage.js';
import { recordSongRequest, getHotSongs } from './songHotRank.js';
import {
  createChatImageUploadToken,
  isQiniuConfigured,
} from './qiniuOss.js';
import {
  isApihzStickerConfigured,
  searchApihzStickers,
} from './apihzSticker.js';
import { fetchRecentReleaseNotes, isAllowedReleaseRedirectUrl, updateService } from './update.js';
import { getProviderHealth } from './mediaHealth.js';
import { applySelfUpdate, getSelfUpdateState } from './selfUpdate.js';
import {
  getDesktopSourceCookieForPlayback,
  getDesktopSourceLogins,
  getDesktopSourceLoginsWithValidity,
  isTrustedDesktopRequest,
  removeDesktopSourceAccount,
  saveDesktopSourceCookie,
} from './desktopSourceAccounts.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const DESKTOP_MODE = process.env.JUKEBOX_DESKTOP_MODE === '1';
const METING_API_URL = (process.env.METING_API_URL || '').replace(/\/$/, '');
const METING_SEARCH_API_URL = (process.env.METING_SEARCH_API_URL || '').replace(/\/$/, '');
const METING_API_AUTH = process.env.METING_API_AUTH || '';
const VMY_LRC_URL = (process.env.VMY_LRC_URL || 'https://api.52vmy.cn/api/music/lrc').replace(/\/$/, '');
const DISCONNECT_GRACE_MS = 30_000;
const AUTO_ADVANCE_INTERVAL_MS = 500;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const MEDIA_HOST_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_MEDIA_HOST_CACHE_ENTRIES = 1_000;
const MAX_IP_LOCATION_CACHE_ENTRIES = 5_000;
const MAX_RATE_LIMIT_BUCKETS = 20_000;
const mediaHostSafetyCache = new Map();
const CLIENT_URL = (process.env.CLIENT_URL || '').replace(/\/$/, '');
const ALLOWED_ORIGINS = CLIENT_URL
  ? new Set(CLIENT_URL.split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean))
  : null;
const NATIVE_CLIENT_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const { CLIENT_ID_SECRET } = resolveSecrets({ logger: console });
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const METRICS_ENABLED = process.env.METRICS_ENABLED === '1';
const METRICS_TOKEN = String(process.env.METRICS_TOKEN || '').trim();
const runtime = createRuntimeObservability();

if (IS_PRODUCTION && !ALLOWED_ORIGINS) {
  runtime.logger.warn('NODE_ENV=production 但未配置 CLIENT_URL，浏览器跨域请求将被拒绝', { context: 'startup', env: process.env.NODE_ENV, clientUrl: process.env.CLIENT_URL });
}

const app = express();
app.set('trust proxy', TRUST_PROXY ? 1 : 'loopback');
const httpServer = createServer(app);

function corsOrigin(origin, callback) {
  if (!origin) {
    callback(null, true);
    return;
  }

  if (NATIVE_CLIENT_ORIGINS.has(origin.replace(/\/$/, ''))) {
    callback(null, true);
    return;
  }

  if (!ALLOWED_ORIGINS) {
    callback(null, !IS_PRODUCTION);
    return;
  }

  callback(null, ALLOWED_ORIGINS.has(origin.replace(/\/$/, '')));
}

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
  // 本地表情包以 data URL 经 WS 发送，默认 1MB 缓冲会直接断开连接
  maxHttpBufferSize: 8 * 1024 * 1024,
  // base64 表情几乎压不动，抬高阈值避免人多时 CPU 被 deflate 打满
  perMessageDeflate: {
    threshold: 262144,
  },
  httpCompression: true,
  allowRequest: (_req, callback) => {
    if (DESKTOP_MODE) {
      callback(new Error('Socket.IO is disabled for the desktop music player'), false);
      return;
    }
    callback(null, true);
  },
});

app.use(cors({ origin: corsOrigin }));
app.use(runtime.securityHeaders);
app.use(runtime.requestContext);
// Global HTTP rate limiter (per IP, 60 req/min by default)
app.use(rateLimiter({ name: 'http' }));
app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

// --- Phase-1 routers (auth / admin / library) + P0-4 task center ---
app.use('/api/auth', authRouter);
app.use('/api/admin/tasks', authMiddleware, requireRole('super_admin', 'admin'), taskRouter);
app.use('/api/admin', authMiddleware, requireRole('super_admin', 'admin'), adminRouter);
app.use('/api/library', authMiddleware, requireRole('super_admin', 'admin', 'moderator'), libraryRouter);
app.use('/api/autodj', authMiddleware, requireRole('super_admin', 'admin', 'moderator'), autodjRouter);
app.use('/api/playlists', authMiddleware, requireRole('super_admin', 'admin', 'moderator', 'user'), playlistsRouter);

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  return safeFetchFollow(url, options, timeoutMs);
}

async function requestFixedPublicUrl(url, options = {}, timeoutMs = 10000) {
  const validated = await resolveValidatedHttpUrl(url);
  if (!validated) throw new Error('拒绝访问不安全的外部 URL');
  return fetchMeting(url, { ...options, cache: false }, timeoutMs);
}

function normalizeClientIp(raw) {
  let ip = String(raw || '').replace(/^::ffff:/, '').trim();
  if (!ip) return '';

  const v4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (v4WithPort) return v4WithPort[1];

  return ip;
}

function getClientIpFromHeaders(headers = {}, remoteAddress = '', trustHeaders = false) {
  if (!trustHeaders) return normalizeClientIp(remoteAddress || '');
  const forwarded = headers['x-forwarded-for'];
  const rawForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstForwarded = rawForwarded?.split(',')[0]?.trim();
  const realIp = Array.isArray(headers['x-real-ip']) ? headers['x-real-ip'][0] : headers['x-real-ip'];
  return normalizeClientIp(firstForwarded || realIp || remoteAddress || '');
}

function logIpDebug(scope, headers, remoteAddress, resolvedIp) {
  if (process.env.DEBUG_IP !== '1') return;
  console.log(`[ip-debug:${scope}]`, {
    xff: headers?.['x-forwarded-for'],
    realIp: headers?.['x-real-ip'],
    remoteAddress,
    resolvedIp,
  });
}

function getRequestIp(req) {
  const ip = normalizeClientIp(req.ip || req.socket?.remoteAddress || '');
  logIpDebug('http', req.headers, req.socket?.remoteAddress || req.ip, ip);
  return ip;
}

function getClientIp(socket) {
  const headers = socket.request?.headers || socket.handshake.headers || {};
  const remoteAddress = socket.request?.socket?.remoteAddress || socket.handshake.address;
  const trustHeaders = TRUST_PROXY === '1';
  const ip = getClientIpFromHeaders(headers, remoteAddress, trustHeaders);
  logIpDebug('socket', headers, remoteAddress, ip);
  return ip;
}

function isPrivateIp(ip) {
  return isOutboundPrivateIp(ip);
}
const ipLocationCache = new Map();
const IP_LOCATION_CACHE_TTL_MS = 1000 * 60 * 60 * 24;

function normalizeLocationName(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text
    .replace(/^(中国|中华人民共和国)/, '')
    .replace(/(省|市|特别行政区|自治区|壮族自治区|回族自治区|维吾尔自治区)$/u, '')
    .slice(0, 12);
}

function parseBaiduIpLocation(value) {
  const text = String(value || '').trim();
  if (!text || text === '-') return '';

  const area = text.split(/\s+/)[0] || '';
  const match = area.match(/(.*?省|北京市|上海市|天津市|重庆市|.*?自治区|.*?特别行政区)/u);
  if (match?.[0]) return normalizeLocationName(match[0]);

  return normalizeLocationName(area);
}

function fallbackLocationForIp(ip) {
  if (!ip || isPrivateIp(ip)) return '本地';
  return '未知';
}

async function lookupIpLocation(ip) {
  const normalized = normalizeClientIp(ip);
  if (!normalized || isPrivateIp(normalized)) return fallbackLocationForIp(normalized);

  const cached = ipLocationCache.get(normalized);
  if (cached && Date.now() - cached.updatedAt < IP_LOCATION_CACHE_TTL_MS) {
    return cached.location;
  }

  let location = '未知';
  try {
    const rawUrl = `https://opendata.baidu.com/api.php?query=${encodeURIComponent(normalized)}&co=&resource_id=6006&oe=utf8`;
    if (!(await isSafeHttpUrl(rawUrl))) return fallbackLocationForIp(normalized);
    const response = await requestFixedPublicUrl(rawUrl, {}, 1200);
    if (response.ok) {
      const data = await response.json();
      if (String(data?.status) === '0') {
        location = parseBaiduIpLocation(data?.data?.[0]?.location) || location;
      }
    }
  } catch {
    location = fallbackLocationForIp(normalized);
  }

  setBoundedCacheEntry(ipLocationCache, normalized, { location, updatedAt: Date.now() }, MAX_IP_LOCATION_CACHE_ENTRIES);
  return location;
}

function attachUserLocation(roomId, userId, ip) {
  const initialLocation = fallbackLocationForIp(ip);
  updateUserLocation(roomId, userId, initialLocation);

  void lookupIpLocation(ip).then((location) => {
    // 仅更新内存字段，不触发全房 room_update（进房风暴时定位二次广播是卡顿主因之一）
    updateUserLocation(roomId, userId, location);
  }).catch(() => {});
}

const VALID_SOURCES = new Set(['netease', 'tencent', 'kugou', 'qishui']);

function limitText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function setBoundedCacheEntry(cache, key, value, maxEntries) {
  if (!cache.has(key) && cache.size >= maxEntries) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, value);
}

function createRateLimiter({ windowMs, max, maxBuckets = MAX_RATE_LIMIT_BUCKETS }) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      setBoundedCacheEntry(buckets, key, { count: 1, resetAt: now + windowMs }, maxBuckets);
      return true;
    }
    bucket.count += 1;
    return bucket.count <= max;
  };
}

const limitRoomCreate = createRateLimiter({ windowMs: 60_000, max: 20 });
const limitJoinAttempt = createRateLimiter({ windowMs: 60_000, max: 30 });
const limitProxyRequest = createRateLimiter({ windowMs: 60_000, max: 120 });
const limitUpdateApply = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 3 });
const limitSocketAction = createSocketRateLimiter({ windowMs: 60_000, max: 90, keyFn: (socket) => getClientIp(socket) || socket.id });
const limitSocketChat = createSocketRateLimiter({ windowMs: 60_000, max: 30, keyFn: (socket) => getClientIp(socket) || socket.id });
const MAX_CONCURRENT_SOCKETS_PER_IP = Number.parseInt(process.env.MAX_CONCURRENT_SOCKETS_PER_IP || '50', 10);
const concurrentSockets = createConcurrencyLimiter({
  max: Number.isInteger(MAX_CONCURRENT_SOCKETS_PER_IP) && MAX_CONCURRENT_SOCKETS_PER_IP > 0
    ? MAX_CONCURRENT_SOCKETS_PER_IP
    : 50,
  keyFn: (key) => key,
  maxKeys: MAX_RATE_LIMIT_BUCKETS,
});

function sanitizeClientSong(song) {
  if (!song || typeof song !== 'object') {
    return { error: '歌曲数据无效' };
  }

  const source = VALID_SOURCES.has(song.source) ? song.source : 'netease';
  const id = limitText(song.id, 128);
  const name = limitText(song.name, 100);
  const artist = limitText(song.artist, 100) || '未知歌手';

  if (!id || !name) {
    return { error: '歌曲数据缺少 id 或名称' };
  }

  const duration = Number(song.duration);
  const sanitized = {
    id,
    source,
    name,
    artist,
    album: limitText(song.album, 100) || undefined,
    pic: limitText(song.pic, 1000) || undefined,
    duration: Number.isFinite(duration) && duration > 0 && duration < 24 * 60 * 60 * 1000
      ? duration
      : undefined,
  };

  // 歌词/播放 URL 由客户端按需拉取，服务端不持久化。
  return { song: sanitized };
}

function buildMetingUrl(query, base = METING_API_URL) {
  const params = new URLSearchParams(query);
  if (METING_API_AUTH && !params.has('auth')) {
    params.set('auth', METING_API_AUTH);
  }
  return `${joinMetingEndpoint(base)}?${params.toString()}`;
}

function parseMetingPicQuery(url) {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.get('type') !== 'pic') return null;
    const server = parsed.searchParams.get('server');
    const id = parsed.searchParams.get('id');
    if (!server || !id) return null;
    return { server, id };
  } catch {
    return null;
  }
}

/** media-proxy 误收到 Meting pic API 时，先解析为真实图片 CDN 地址 */
async function resolveMediaProxyFetchUrl(fetchUrl, thumbPx = 0) {
  const pic = parseMetingPicQuery(fetchUrl);
  if (!pic) return fetchUrl;

  try {
    const response = await fetchMeting(
      buildMetingUrl({ server: pic.server, type: 'pic', id: pic.id }),
      { redirect: 'manual' },
      15000,
    );

    if (response.status >= 300 && response.status < 400) {
      let location = response.headers.get('location');
      if (location && thumbPx > 0) location = resizeCoverForThumb(location, thumbPx);
      return location || fetchUrl;
    }

    const text = (await response.text()).trim();
    if (text.startsWith('http')) {
      let direct = text.startsWith('@') ? text.slice(1) : text;
      if (thumbPx > 0) direct = resizeCoverForThumb(direct, thumbPx);
      return direct;
    }
  } catch (err) {
    console.error('Meting pic resolve error:', err.message);
  }

  return fetchUrl;
}

/** 从 Meting 地址的 query 中提取歌曲 id（清洗搜索结果时兜底） */
function extractIdFromMetingUrl(url) {
  try {
    return decodeURIComponent(new URL(url).searchParams.get('id') || '');
  } catch {
    return '';
  }
}

/**
 * 搜索结果清洗：剥离上游 url/lrc/pic，避免把搜索备源已失效的解析地址透传给客户端，
 * 播放/歌词/封面统一由客户端经 /api/meting 走主源解析。
 */
function sanitizeMetingSearchItem(item) {
  const id = item.id != null ? String(item.id) : extractIdFromMetingUrl(item.url);
  return {
    id,
    name: item.name ?? item.title,
    artist: item.artist ?? item.author,
    album: item.album || undefined,
    duration: item.duration || undefined,
  };
}

/**
 * type=search 路由：搜索优先走搜索备源（未登录的网易直连排序较差），
 * 备源不可用时网易回退官方直连、其余平台回退主源。
 * 命中搜索路径返回 true（响应已写出）。
 */
async function handleMetingSearch(query, res) {
  const server = String(query.server || 'netease');
  const keyword = String(query.id || '').trim();
  if (!keyword) return false;

  if (METING_SEARCH_API_URL) {
    try {
      const response = await fetchMeting(buildMetingUrl(query, METING_SEARCH_API_URL), { redirect: 'manual' });
      const text = await response.text();
      const parsed = JSON.parse(text);
      if (response.status < 400 && Array.isArray(parsed)) {
        res.json(parsed.map(sanitizeMetingSearchItem).filter((item) => item.id));
        return true;
      }
      console.warn('Meting search upstream returned invalid payload, fallback');
    } catch (err) {
      console.warn('Meting search upstream failed:', formatMetingFetchError(err));
    }
  }

  if (server === 'netease') {
    try {
      const songs = await neteaseSearchSongs(keyword);
      res.json(songs);
      return true;
    } catch (err) {
      console.warn('NetEase native search failed, fallback to primary:', err.message);
    }
  }
  return false;
}

/**
 * type=search_playlist 路由：公共 Meting 实例不支持该类型，
 * 网易歌单搜索走官方直连；其余平台无免费源，回退主源保持旧行为。
 */
async function handleMetingSearchPlaylist(query, res) {
  const server = String(query.server || 'netease');
  const keyword = String(query.id || '').trim();
  if (!keyword || server !== 'netease') return false;

  try {
    const playlists = await neteaseSearchPlaylists(keyword);
    res.json(playlists);
    return true;
  } catch (err) {
    console.warn('NetEase native playlist search failed, fallback to primary:', err.message);
    return false;
  }
}

async function proxyMetingResponse(targetUrl, res, thumbPx = 0, metingType = '') {
  // fetchMeting 已跟随同域规范化重定向，跨域 CDN 地址保留给客户端处理
  const response = await fetchMeting(targetUrl, { redirect: 'manual' });

  if (response.status >= 300 && response.status < 400) {
    let location = response.headers.get('location');
    if (location && thumbPx > 0) {
      location = resizeCoverForThumb(location, thumbPx);
    }
    if (location) {
      // type=url/lrc 必须返回文本 URL，不能把浏览器重定向到第三方 CDN（fetch 会触发 CORS）
      if (metingType === 'url' || metingType === 'lrc') {
        const body = location.startsWith('@') ? location.slice(1) : location;
        return res.type('text').send(body);
      }
      return res.redirect(response.status, location);
    }
  }

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (contentType.includes('application/json') || text.startsWith('[') || text.startsWith('{')) {
    try {
      return res.json(JSON.parse(text));
    } catch {
      return res.type('text').send(text);
    }
  }

  return res.type('text').send(text);
}

app.get('/api/health/live', (_req, res) => {
  res.json({ ok: true, status: 'live' });
});

app.get('/api/health/ready', (_req, res) => {
  if (!runtime.ready) return res.status(503).json({ ok: false, status: 'starting' });
  res.json({ ok: true, status: 'ready', storage: isRedisEnabled() ? 'redis' : 'memory' });
});

app.get('/api/health', (_req, res) => {
  if (!runtime.ready) return res.status(503).json({ ok: false, status: 'starting' });
  res.json({ ok: true, status: 'ready', storage: isRedisEnabled() ? 'redis' : 'memory' });
});

app.get('/api/update/changelog', async (_req, res) => {
  try {
    const releases = await fetchRecentReleaseNotes();
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.json({ ok: true, releases });
  } catch {
    res.json({ ok: false, releases: [] });
  }
});

app.get('/api/update', async (_req, res) => {
  try {
    const update = await updateService.getUpdateInfo();
    res.setHeader('Cache-Control', 'no-store');
    res.json(update);
  } catch (error) {
    console.warn('Update check failed:', error.message);
    res.status(503).json({ ok: false, error: '更新检查暂时不可用' });
  }
});

app.get('/metrics', (req, res) => {
  const authorized = !METRICS_TOKEN || req.headers.authorization === 'Bearer ' + METRICS_TOKEN;
  if (!METRICS_ENABLED || !authorized) return res.status(404).end();
  res.type('text/plain; version=0.0.4; charset=utf-8').send(runtime.metrics());
});

app.get('/api/music/hot', async (req, res) => {
  const limit = parseInt(String(req.query.limit || ''), 10);
  try {
    const songs = await getHotSongs(Number.isFinite(limit) ? limit : 20);
    res.json(songs);
  } catch (err) {
    console.error('Hot songs error:', err.message);
    res.status(500).json({ error: '获取热榜失败' });
  }
});

app.get('/api/music/toplist/netease', async (req, res) => {
  if (!limitProxyRequest(`toplist:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
  const limit = parseInt(String(req.query.limit || ''), 10);
  try {
    const data = await fetchNeteaseHotToplist(Number.isFinite(limit) ? limit : 200);
    res.json(data);
  } catch (err) {
    console.error('Netease toplist error:', err.message);
    res.status(502).json({ error: err.message || '获取热榜失败' });
  }
});

app.get('/api/music/netease/playlists/meta', async (req, res) => {
  if (!limitProxyRequest(`playlist-meta:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const ids = String(req.query.ids || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (ids.length === 0) {
    return res.json({ playlists: [] });
  }

  try {
    const playlists = await fetchNeteasePlaylistMetas(ids);
    res.json({ playlists });
  } catch (err) {
    console.error('Netease playlist meta error:', err.message);
    res.status(502).json({ error: '获取歌单信息失败' });
  }
});

app.get('/api/music/netease/playlists/search', async (req, res) => {
  if (!limitProxyRequest(`playlist-search:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const keyword = limitText(req.query.keyword || req.query.s, 80);
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
  if (!keyword) return res.json({ playlists: [], total: 0, page, limit });

  try {
    const targetUrl = buildMetingUrl({ server: 'netease', type: 'search_playlist', id: keyword });
    const response = await fetchMeting(targetUrl, {}, 10000);
    if (!response.ok) return res.status(response.status).json({ error: '网易云歌单搜索失败' });
    const data = await response.json();
    const playlists = Array.isArray(data) ? data : [];
    const normalized = playlists.map((item) => ({
      id: String(item.id || ''),
      name: String(item.name || item.title || '未命名歌单'),
      coverImgUrl: String(item.cover || item.coverImgUrl || item.pic || ''),
      creatorName: String(item.creator?.nickname || item.creator?.name || item.user?.nickname || ''),
      trackCount: Number(item.trackCount || item.track_count || item.song_count || 0),
      playCount: Number(item.playCount || item.playcount || 0),
    })).filter((item) => item.id);
    const start = (page - 1) * limit;
    res.json({
      page,
      limit,
      total: normalized.length,
      playlists: normalized.slice(start, start + limit),
    });
  } catch (err) {
    console.error('Netease playlist search error:', err.message);
    res.status(502).json({ error: '网易云歌单搜索失败' });
  }
});

app.get('/api/music/sources', (_req, res) => {
  const sources = [
    {
      id: 'netease',
      name: '网易云',
      shortName: '网易云',
      color: '#ec4141',
      supportsSearch: true,
      supportsIdLookup: true,
      description: '网易云（房主登录后 VIP 歌曲完整播放）',
    },
    {
      id: 'tencent',
      name: 'QQ音乐',
      shortName: 'QQ音乐',
      color: '#31c27c',
      supportsSearch: true,
      supportsIdLookup: false,
    },
    {
      id: 'kugou',
      name: '酷狗音乐',
      shortName: '酷狗音乐',
      color: '#2688ee',
      supportsSearch: true,
      supportsIdLookup: false,
      description: '酷狗音乐（房主登录后可用 VIP 音源）',
    },
    {
      id: 'qishui',
      name: '汽水音乐',
      shortName: '汽水音乐',
      color: '#f5a623',
      supportsSearch: true,
      supportsIdLookup: false,
      description: '汽水音乐（房主配置自定义音源后可用）',
    },
  ];
  res.json(sources);
});

/**
 * 一键更新会执行 git fetch/reset + 重装依赖 + 重建 + 重启，属破坏性运维操作。
 * 桌面模式同样需要本机桌面应用可信校验（跨站一次 POST 即可 git reset --hard 清掉未提交代码）；
 * 其余部署必须管理员身份，否则任意访客可重启服务、甚至让内存模式下所有房间数据随重启丢失。
 */
const selfUpdateGuards = DESKTOP_MODE
  ? [(req, res, next) => {
    if (!isTrustedDesktopRequest(req, PORT)) {
      return res.status(403).json({ ok: false, error: '仅允许本机桌面应用访问' });
    }
    next();
  }]
  : [authMiddleware, requireRole('super_admin', 'admin')];

app.post('/api/update/apply', ...selfUpdateGuards, (req, res) => {
  const info = getSelfUpdateState();
  if (!info.supported) return res.status(501).json({ ok: false, error: info.error || '当前部署方式不支持自动更新' });
  if (!limitUpdateApply(`update-apply:${getRequestIp(req)}`)) {
    return res.status(429).json({ ok: false, error: '请求过于频繁，请稍后再试' });
  }
  const result = applySelfUpdate();
  if (result.error) return res.status(400).json({ ok: false, error: result.error });
  res.json({ ok: true, ...result, hint: '更新中：约 1-3 分钟后服务自动重启，页面会自动恢复' });
});

app.get('/api/update/apply/status', ...selfUpdateGuards, (_req, res) => {
  res.json({ ok: true, ...getSelfUpdateState() });
});

app.get('/api/music/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, providers: getProviderHealth(), checkedAt: new Date().toISOString() });
});

if (DESKTOP_MODE) {
  app.use('/api/desktop', (req, res, next) => {
    if (!isTrustedDesktopRequest(req, PORT)) return res.status(403).json({ error: '仅允许本机桌面应用访问' });
    next();
  });

  app.get('/api/desktop/music/capabilities', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const sourceLogins = getDesktopSourceLogins();
    res.json({
      sources: {
        netease: { search: true, playback: Boolean(METING_API_URL) || sourceLogins.netease, accountRequiredForVip: true },
        tencent: { search: true, playback: true, accountRequiredForVip: true },
        kugou: { search: true, playback: true, accountRequiredForVip: true },
        qishui: { search: true, playback: true, accountRequiredForVip: true },
      },
    });
  });

  app.get('/api/desktop/music/accounts', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      // 携带有效期探测：cookie 过期的平台会显示为未登录
      res.json({ sources: await getDesktopSourceLoginsWithValidity() });
    } catch {
      res.json({ sources: getDesktopSourceLogins() });
    }
  });

  app.post('/api/desktop/music/accounts/qr/start', async (req, res) => {
    if (!limitProxyRequest(`desktop-account-start:${getRequestIp(req)}`)) {
      return res.status(429).json({ error: '登录请求过于频繁，请稍后再试' });
    }
    const source = String(req.body?.source || '').trim().toLowerCase();
    if (!['netease', 'tencent', 'kugou', 'qishui'].includes(source)) return res.status(400).json({ error: '不支持该音乐平台' });

    try {
      const result = source === 'netease'
        ? await startNeteaseLogin()
        : source === 'tencent'
          ? await startTencentQrLogin()
          : source === 'kugou'
            ? await startKugouQrLogin()
            : await startDesktopQishuiLogin();
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, sessionKey: result.sessionKey, qrImage: result.qrImage });
    } catch (err) {
      console.error('Desktop source QR start error:', err.message);
      res.status(502).json({ error: err.message || '获取登录二维码失败' });
    }
  });

  app.get('/api/desktop/music/accounts/qr/poll', async (req, res) => {
    if (!limitProxyRequest(`desktop-account-poll:${getRequestIp(req)}`)) {
      return res.status(429).json({ error: '登录状态查询过于频繁，请稍后再试' });
    }
    const source = String(req.query.source || '').trim().toLowerCase();
    const sessionKey = String(req.query.session || '').trim();
    if (!['netease', 'tencent', 'kugou', 'qishui'].includes(source)) return res.status(400).json({ error: '不支持该音乐平台' });
    if (!/^[a-f0-9]{16,64}$/i.test(sessionKey)) return res.status(400).json({ error: '登录会话无效，请重新获取二维码' });

    try {
      const result = source === 'netease'
        ? await pollNeteaseLogin(sessionKey)
        : source === 'tencent'
          ? await pollTencentQrLogin(sessionKey)
          : source === 'kugou'
            ? await pollKugouQrLogin(sessionKey)
            : await pollDesktopQishuiLogin(sessionKey);
      if (result.status === 'confirmed' && result.cookie) saveDesktopSourceCookie(source, result.cookie);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, status: result.status, loggedIn: result.status === 'confirmed', message: result.message });
    } catch (err) {
      console.error('Desktop source QR poll error:', err.message);
      res.status(502).json({ error: err.message || '登录状态查询失败' });
    }
  });

  app.post('/api/desktop/music/accounts/:source/cookie', (req, res) => {
    if (!limitProxyRequest(`desktop-account-cookie:${getRequestIp(req)}`)) {
      return res.status(429).json({ error: '账号保存请求过于频繁，请稍后再试' });
    }
    const source = String(req.params.source || '').trim().toLowerCase();
    if (source !== 'tencent') return res.status(400).json({ error: '该平台不支持手动 Cookie 登录' });
    try {
      saveDesktopSourceCookie(source, String(req.body?.cookie || ''));
      res.json({ success: true, sources: getDesktopSourceLogins() });
    } catch (err) {
      res.status(400).json({ error: err.message || '账号凭据保存失败' });
    }
  });

  app.delete('/api/desktop/music/accounts/:source', (req, res) => {
    const source = String(req.params.source || '').trim().toLowerCase();
    if (!['netease', 'tencent', 'kugou', 'qishui'].includes(source)) return res.status(400).json({ error: '不支持该音乐平台' });
    if (source === 'qishui') clearDesktopQishuiLogin();
    else removeDesktopSourceAccount(source);
    res.json({ success: true, sources: getDesktopSourceLogins() });
  });

  app.get('/api/desktop/music/search', async (req, res) => {
    if (!limitProxyRequest(`desktop-music-search:${getRequestIp(req)}`)) {
      return res.status(429).json({ error: '搜索请求过于频繁，请稍后再试' });
    }
    const source = String(req.query.source || '').trim().toLowerCase();
    const keyword = String(req.query.q || '').trim();
    if (source !== 'qishui') return res.status(400).json({ error: '桌面版当前仅通过该接口搜索汽水音乐' });
    if (!keyword || keyword.length > 120) return res.status(400).json({ error: '搜索关键词无效' });
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ songs: await searchDesktopQishuiWithHealth(keyword) });
    } catch (err) {
      console.error('Desktop Qishui search error:', err.message);
      res.status(502).json({ error: err.message || '汽水音乐搜索失败' });
    }
  });

  app.get('/api/desktop/music/song-url', async (req, res) => {
    if (!limitProxyRequest(`desktop-song-url:${getRequestIp(req)}`)) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }

    const source = String(req.query.source || '').trim().toLowerCase();
    const songId = String(req.query.id || '').trim();
    const quality = String(req.query.quality || 'standard').trim().toLowerCase();
    if (!['netease', 'tencent', 'kugou', 'qishui'].includes(source)) {
      return res.status(400).json({ error: '桌面版不支持该音源' });
    }
    if (!songId || songId.length > 128) return res.status(400).json({ error: '歌曲 id 无效' });

    try {
      let url = null;
      const accountCookie = getDesktopSourceCookieForPlayback(source);
      if (source === 'netease') {
        if (accountCookie) url = await resolveNeteasePlayUrl(songId, quality, accountCookie);
        if (!url && !METING_API_URL && !accountCookie) {
          return res.status(503).json({ error: '网易云播放需要在设置中配置可用的 METING_API_URL，或切换到 QQ 音乐、酷狗音源' });
        }
        if (!url && METING_API_URL) {
          const response = await fetchMeting(
            buildMetingUrl({ server: source, type: 'url', id: songId, quality }),
            { redirect: 'manual' },
          );
          url = response.headers.get('location') || '';
          if (!url && response.status < 300) {
            const bodyText = (await response.text()).trim();
            if (bodyText.startsWith('http')) url = bodyText;
          }
        }
      } else if (source === 'tencent') {
        url = await resolveTencentPlayUrl(songId, quality, accountCookie);
      } else if (source === 'kugou') {
        url = await resolveKugouPlayUrl(songId, quality, accountCookie);
      } else {
        url = await resolveDesktopQishuiPlayUrlWithHealth(songId, quality);
      }

      if (!url) return res.status(404).json({ error: '该歌曲暂时没有可用的免费音源，可尝试其他平台或音质' });
      if (!(await isSafeHttpUrl(url))) return res.status(403).json({ error: '音源地址未通过安全校验' });
      res.json({ url });
    } catch (err) {
      console.error('Desktop music URL error:', err.message);
      res.status(502).json({ error: formatMetingFetchError(err) || '音源解析失败' });
    }
  });
}

app.get('/api/meting', async (req, res) => {
  if (!limitProxyRequest(`meting:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  try {
    const thumbPx = parseInt(String(req.query.size || ''), 10) || 0;
    const query = { ...req.query };
    delete query.size;
    const metingType = String(query.type || '');
    if (metingType === 'search') {
      if (await handleMetingSearch(query, res)) return;
    } else if (metingType === 'search_playlist') {
      if (await handleMetingSearchPlaylist(query, res)) return;
    }
    await proxyMetingResponse(buildMetingUrl(query), res, thumbPx, metingType);
  } catch (err) {
    console.error('Meting proxy error:', formatMetingFetchError(err));
    res.status(502).json({ error: '无法连接 Meting API，请检查 METING_API_URL 配置' });
  }
});

/** HTTPS 站点下代理 http 音频/封面，避免浏览器混合内容警告 */
app.get('/api/media-proxy', async (req, res) => {
  if (!limitProxyRequest(`media:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const raw = String(req.query.url || '').trim();
  const thumbPx = Math.min(512, Math.max(0, parseInt(String(req.query.size || ''), 10) || 0));
  let fetchUrl = raw;
  let parsed;
  try {
    parsed = new URL(fetchUrl);
  } catch {
    return res.status(400).json({ error: '无效地址' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: '不支持的协议' });
  }

  if (isPrivateHostname(parsed.hostname)) {
    return res.status(403).json({ error: '禁止访问内网地址' });
  }

  try {
    if (parseMetingPicQuery(raw)) {
      fetchUrl = await resolveMediaProxyFetchUrl(raw, thumbPx);
    } else if (thumbPx > 0) {
      fetchUrl = resizeCoverForThumb(raw, thumbPx);
    } else {
      fetchUrl = raw;
    }

    if (!(await isSafeMediaUrl(fetchUrl))) {
      return res.status(403).json({ error: '禁止访问内网地址' });
    }

    await serveUpstreamMedia(fetchUrl, res, fetchWithTimeout, {
      range: req.headers.range,
      thumbPx,
      validateUrl: isSafeMediaUrl,
    });
  } catch (err) {
    console.error('Media proxy error:', err.message);
    if (!res.headersSent) res.status(502).json({ error: '媒体代理失败' });
  }
});

/** cyapi 酷狗音乐搜索 */
app.get('/api/music/cyapi/kugou/search', async (req, res) => {
  if (!limitProxyRequest(`kugou:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  if (!isCyapiConfigured()) {
    return res.status(503).json({ error: '未配置 CYAPI_KEY' });
  }

  const keyword = String(req.query.q || '').trim();
  const num = Math.min(Math.max(parseInt(String(req.query.num || '15'), 10) || 15, 1), 30);

  if (!keyword) return res.json([]);

  try {
    res.json(await searchKugouMusic(keyword, num));
  } catch (err) {
    console.error('Cyapi Kugou search error:', err.message);
    res.status(502).json({ error: '酷狗音乐搜索失败' });
  }
});

/** 导入外部歌单（分享链接） */
app.post('/api/music/playlist/import', async (req, res) => {
  if (!limitProxyRequest(`playlist:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const platform = String(req.body?.platform || '').trim();
  const input = String(req.body?.input || '').trim();
  if (!input) return res.status(400).json({ error: '请粘贴歌单分享链接' });
  if (platform !== 'netease' && platform !== 'qq') {
    return res.status(400).json({ error: '不支持的平台' });
  }

  try {
    const result = platform === 'netease'
      ? await importNeteasePlaylist(input)
      : await importQqPlaylist(input);
    res.json(result);
  } catch (err) {
    console.error('Playlist import error:', err.message);
    res.status(400).json({ error: err.message || '歌单导入失败' });
  }
});

/** cyapi 酷狗音乐详情（播放链接、歌词） */
app.get('/api/music/cyapi/kugou/song', async (req, res) => {
  if (!limitProxyRequest(`kugou-song:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  if (!isCyapiConfigured()) {
    return res.status(503).json({ error: '未配置 CYAPI_KEY' });
  }

  const id = String(req.query.id || '').trim();
  if (!id) return res.status(400).json({ error: '缺少歌曲 id' });

  try {
    const detail = await getKugouSongDetail(id);
    if (!detail) return res.status(404).json({ error: '歌曲不存在' });
    res.json(detail);
  } catch (err) {
    console.error('Cyapi Kugou song error:', err.message);
    res.status(502).json({ error: '酷狗音乐获取失败' });
  }
});

/** 房主音源：扫码登录 / 搜索 / 播放地址解析（凭据仅存服务端房间快照） */
const SOURCE_QR_PROVIDERS = new Set(['netease', 'tencent', 'kugou', 'qishui']);

function resolveRoomSourceAccess(req, roomId) {
  const identity = resolveIdentityFromRequest(req);
  if (!identity) return { error: '未登录', status: 401 };
  const room = getRoomInternal(roomId?.toUpperCase());
  if (!room) return { error: '房间不存在', status: 404 };
  return { identity, room, isCreator: room.creatorId === identity.userId, isMember: room.users.has(identity.userId) };
}

/** 房主发起扫码登录：返回二维码 */
app.post('/api/music/source/qr/start', async (req, res) => {
  if (!limitProxyRequest(`sourceqr:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
  const roomId = String(req.body?.roomId || '').trim();
  const source = String(req.body?.source || '').trim().toLowerCase();
  if (!SOURCE_QR_PROVIDERS.has(source)) return res.status(400).json({ error: '该平台不支持扫码登录' });

  const access = resolveRoomSourceAccess(req, roomId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  if (!access.isCreator) return res.status(403).json({ error: '仅房主可登录音源' });

  try {
    const result = source === 'netease'
      ? await startNeteaseLogin()
      : source === 'tencent'
        ? await startTencentQrLogin()
        : source === 'kugou'
          ? await startKugouQrLogin()
          : await startQishuiLogin(roomId.toUpperCase());
    res.json({ success: true, sessionKey: result.sessionKey, qrImage: result.qrImage });
  } catch (err) {
    console.error('Source QR start error:', err.message);
    res.status(502).json({ error: err.message || '获取登录二维码失败' });
  }
});

/** 房主轮询扫码状态：确认后凭据直接写入房间（仅广播已登录布尔） */
app.get('/api/music/source/qr/poll', async (req, res) => {
  const roomId = String(req.query.roomId || '').trim();
  const source = String(req.query.source || '').trim().toLowerCase();
  const sessionKey = String(req.query.session || '').trim();
  if (!SOURCE_QR_PROVIDERS.has(source)) return res.status(400).json({ error: '该平台不支持扫码登录' });

  const access = resolveRoomSourceAccess(req, roomId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  if (!access.isCreator) return res.status(403).json({ error: '仅房主可登录音源' });

  try {
    const result = source === 'netease'
      ? await pollNeteaseLogin(sessionKey)
      : source === 'tencent'
        ? await pollTencentQrLogin(sessionKey)
        : source === 'kugou'
          ? await pollKugouQrLogin(sessionKey)
          : await pollQishuiLogin(roomId.toUpperCase(), sessionKey);

    if (result.status === 'confirmed' && result.cookie) {
      const saved = setRoomSourceCredential(roomId.toUpperCase(), access.identity.userId, source, { cookie: result.cookie });
      if (saved.error) {
        // 凭据落库失败不应伪装成“二维码过期”，返回真实原因便于前端提示
        console.warn(`[netease-qr] 凭据写入房间失败：${saved.error}`);
        return res.status(400).json({ success: false, status: 'failed', error: saved.error });
      }
      broadcastRoomUpdate(roomId.toUpperCase());
    }
    if (result.status === 'confirmed') {
      // 汽水等会话在包内部已落库；广播刷新 sourceLogins
      broadcastRoomUpdate(roomId.toUpperCase());
    }
    res.json({ success: true, status: result.status, message: result.message });
  } catch (err) {
    console.error('Source QR poll error:', err.message);
    res.status(502).json({ error: err.message || '登录状态查询失败' });
  }
});

/** 音源搜索（QQ / 酷狗 / 自定义源） */
app.get('/api/music/source/search', async (req, res) => {
  if (!limitProxyRequest(`sourcesearch:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
  const source = String(req.query.source || '').trim().toLowerCase();
  const keyword = String(req.query.q || '').trim();
  if (!keyword) return res.status(400).json({ error: '缺少关键词' });

  try {
    let songs;
    if (source === 'tencent') songs = await searchTencent(keyword);
    else if (source === 'kugou') songs = await searchKugou(keyword);
    else if (source === 'qishui') {
      // 汽水搜索会动用房间/本机登录会话（风控按账号计），必须限定房间成员
      const roomId = String(req.query.roomId || '').trim().toUpperCase();
      const access = resolveRoomSourceAccess(req, roomId);
      if (access.error) return res.status(access.status).json({ error: access.error });
      if (!access.isCreator && !access.isMember) {
        return res.status(403).json({ error: '请先加入房间后再搜索汽水曲库' });
      }
      songs = await searchQishui(roomId, keyword);
    } else return res.status(400).json({ error: '不支持的音源' });

    res.json({ songs: songs || [] });
  } catch (err) {
    console.error('Source search error:', err.message);
    res.status(502).json({ error: formatMetingFetchError(err) || '音源搜索失败' });
  }
});

/** 音源播放地址解析：房间成员请求，动用该房间的房主凭据 */
app.get('/api/music/source/url', async (req, res) => {
  if (!limitProxyRequest(`sourceurl:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
  const roomId = String(req.query.roomId || '').trim();
  const source = String(req.query.source || '').trim().toLowerCase();
  const songId = String(req.query.id || '').trim();
  const quality = String(req.query.quality || '').trim().toLowerCase();
  if (!songId) return res.status(400).json({ error: '缺少歌曲 id' });

  const access = resolveRoomSourceAccess(req, roomId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  // 仅房间成员（含房主）可动用该房间的凭据解析
  if (!access.isCreator && !access.isMember) {
    return res.status(403).json({ error: '请先加入房间' });
  }

  const credential = getRoomSourceCredential(roomId.toUpperCase(), source);

  try {
    let url = null;
    if (source === 'netease') {
      if (credential?.cookie) {
        url = await resolveNeteasePlayUrl(songId, quality, credential.cookie);
      } else {
        // 免登录：走 Meting 免费链路（与 /api/meting 同语义，取解析后的直链）
        const response = await fetchMeting(buildMetingUrl({ server: 'netease', type: 'url', id: songId }), { redirect: 'manual' });
        let location = response.headers.get('location');
        if (!location && response.status < 300) {
          const bodyText = await response.text();
          location = bodyText.startsWith('http') ? bodyText : null;
        }
        url = location || null;
      }
    } else if (source === 'tencent') url = await resolveTencentPlayUrl(songId, quality, credential?.cookie || '');
    else if (source === 'kugou') url = await resolveKugouPlayUrl(songId, quality, credential?.cookie || '');
    else if (source === 'qishui') url = await resolveQishuiPlayUrl(roomId.toUpperCase(), songId, quality);
    else return res.status(400).json({ error: '不支持的音源' });

    if (!url) return res.status(404).json({ error: '该歌曲暂无可播放的音源，可尝试其他音质或平台' });
    res.json({ url });
  } catch (err) {
    console.error('Source url error:', err.message);
    res.status(502).json({ error: formatMetingFetchError(err) || '音源解析失败' });
  }
});

/** 歌词备用：52vmy，按歌名搜索 */
app.get('/api/music/lrc-fallback', async (req, res) => {
  if (!limitProxyRequest(`lrc:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const msg = String(req.query.msg || '').trim();
  const n = String(req.query.n || '1');
  if (!msg) return res.status(400).json({ error: '缺少歌曲名' });

  try {
    const params = new URLSearchParams({ msg, n });
    const rawUrl = `${VMY_LRC_URL}?${params}`;
    if (!(await isSafeHttpUrl(rawUrl))) {
      return res.status(403).json({ error: '禁止访问内网地址' });
    }
    const response = await requestFixedPublicUrl(rawUrl);
    if (!response.ok) {
      return res.status(502).json({ error: '歌词接口请求失败' });
    }
    const text = await response.text();
    res.type('text/plain; charset=utf-8').send(text);
  } catch (err) {
    console.error('LRC fallback error:', err.message);
    res.status(502).json({ error: '歌词获取失败' });
  }
});

const IDENTITY_UID_COOKIE = 'openmusic_uid';
const IDENTITY_TOKEN_COOKIE = 'openmusic_token';
const DEVICE_ID_COOKIE = 'openmusic_did';
const IDENTITY_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365 * 5;

function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    try {
      out[decodeURIComponent(key)] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function sanitizeClientId(value) {
  const id = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{8,64}$/.test(id) ? id : '';
}

function signClientId(clientId) {
  return createHmac('sha256', CLIENT_ID_SECRET).update(clientId).digest('base64url');
}

function verifyClientToken(clientId, token) {
  const id = sanitizeClientId(clientId);
  const rawToken = String(token || '').trim();
  if (!id || !rawToken) return false;

  try {
    const expected = Buffer.from(signClientId(id));
    const actual = Buffer.from(rawToken);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function createServerClientId() {
  return randomBytes(18).toString('base64url');
}

function setIdentityCookieHeaders(res, userId, token, deviceId = null) {
  const secure = IS_PRODUCTION ? '; Secure' : '';
  const base = `Path=/; Max-Age=${IDENTITY_COOKIE_MAX_AGE_SEC}; HttpOnly; SameSite=Lax${secure}`;
  const cookies = [
    `${IDENTITY_UID_COOKIE}=${encodeURIComponent(userId)}; ${base}`,
    `${IDENTITY_TOKEN_COOKIE}=${encodeURIComponent(token)}; ${base}`,
  ];
  const did = sanitizeDeviceId(deviceId);
  if (did) {
    cookies.push(`${DEVICE_ID_COOKIE}=${encodeURIComponent(did)}; ${base}`);
  }
  res.setHeader('Set-Cookie', cookies);
}

function resolveDeviceIdFromRequest(req) {
  const cookies = parseCookieHeader(req.headers?.cookie || '');
  const fromCookie = sanitizeDeviceId(cookies[DEVICE_ID_COOKIE]);
  const fromBody = sanitizeDeviceId(req.body?.deviceId);
  return fromCookie || fromBody || null;
}

function resolveDeviceIdFromCookieHeader(cookieHeader) {
  const cookies = parseCookieHeader(cookieHeader || '');
  return sanitizeDeviceId(cookies[DEVICE_ID_COOKIE]);
}

function resolveIdentityFromCookies(cookieHeader) {
  const cookies = parseCookieHeader(cookieHeader);
  const userId = sanitizeClientId(cookies[IDENTITY_UID_COOKIE]);
  const token = String(cookies[IDENTITY_TOKEN_COOKIE] || '').trim();
  if (userId && verifyClientToken(userId, token)) {
    return { userId, token };
  }
  return null;
}

function resolveIdentityFromRequest(req) {
  return resolveIdentityFromCookies(req.headers?.cookie || '');
}

/** 建立 HttpOnly 会话：身份凭证仅通过 Cookie 传递，不经 WebSocket 明文下发 */
app.post('/api/session/bootstrap', async (req, res) => {
  const hintedDeviceId = resolveDeviceIdFromRequest(req);

  const existing = resolveIdentityFromRequest(req);
  if (existing) {
    const deviceId = hintedDeviceId || createServerClientId();
    await linkDeviceToUser(deviceId, existing.userId);
    setIdentityCookieHeaders(res, existing.userId, signClientId(existing.userId), deviceId);
    return res.json({ clientId: existing.userId });
  }

  // 无身份 Cookie 时，仅允许通过已登记的本机设备 ID 恢复同一 userId（不可指定任意 userId）
  if (hintedDeviceId) {
    const boundUserId = await getUserIdForDevice(hintedDeviceId);
    if (boundUserId) {
      await linkDeviceToUser(hintedDeviceId, boundUserId);
      setIdentityCookieHeaders(res, boundUserId, signClientId(boundUserId), hintedDeviceId);
      return res.json({ clientId: boundUserId });
    }
  }

  const userId = createServerClientId();
  const deviceId = hintedDeviceId || createServerClientId();
  await linkDeviceToUser(deviceId, userId);
  setIdentityCookieHeaders(res, userId, signClientId(userId), deviceId);
  return res.json({ clientId: userId });
});

app.get('/api/rooms', (_req, res) => {
  res.json(listRooms());
});

app.post('/api/rooms', (req, res) => {
  if (!limitRoomCreate(`room:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '创建房间过于频繁，请稍后再试' });
  }

  const name = req.body?.name;
  const password = req.body?.password;
  const identity = resolveIdentityFromRequest(req);
  if (!identity?.userId) {
    return res.status(401).json({ error: '会话未就绪，请刷新页面后重试' });
  }
  const room = createRoom({ name, password, creatorId: identity.userId });
  if (room?.error) return res.status(400).json(room);
  res.json(room);
});

app.get('/api/rooms/:id', (req, res) => {
  const room = getRoomPublic(req.params.id);
  if (!room) return res.status(404).json({ error: '房间不存在' });
  res.json(room);
});

app.get('/api/chat/upload-config', (_req, res) => {
  res.json({ enabled: isQiniuConfigured() });
});

app.get('/api/chat/sticker-search-config', (_req, res) => {
  res.json({ enabled: isApihzStickerConfigured() });
});

app.get('/api/chat/sticker-search', async (req, res) => {
  if (!isApihzStickerConfigured()) {
    return res.status(503).json({ error: '未配置表情包搜索' });
  }

  if (!limitProxyRequest(`sticker-search:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const words = limitText(req.query.words, 32);
  const page = Math.max(1, Math.min(200, Number(req.query.page) || 1));
  const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 15));
  if (!words) {
    return res.status(400).json({ error: '请输入搜索关键词' });
  }

  try {
    const result = await searchApihzStickers(words, page, limit);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || '搜索失败' });
  }
});

app.post('/api/chat/upload-token', (req, res) => {
  if (!isQiniuConfigured()) {
    return res.status(503).json({ error: '图片上传未配置' });
  }

  if (!limitProxyRequest(`chat-upload:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const roomId = limitText(req.body?.roomId, 32);
  const ext = limitText(req.body?.ext, 8).toLowerCase();
  if (!roomId) {
    return res.status(400).json({ error: '房间无效' });
  }

  const identity = resolveIdentityFromRequest(req);
  if (!identity?.userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const room = getRoomInternal(roomId);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }

  if (!room.users.has(identity.userId)) {
    return res.status(403).json({ error: '未加入房间' });
  }
  if (!canUserMutate(roomId, identity.userId)) {
    return res.status(403).json({ error: '只读端无法上传图片' });
  }


  if (room.muteAll || room.mutedUserIds?.has(identity.userId)) {
    return res.status(403).json({ error: room.muteAll ? '当前房间已全体禁言' : '你已被禁言' });
  }

  try {
    const tokenData = createChatImageUploadToken(roomId, ext);
    res.json(tokenData);
  } catch (err) {
    res.status(400).json({ error: err.message || '生成上传凭证失败' });
  }
});

const clientDist = path.join(__dirname, '../client/dist');

function resolveAndroidApkPath() {
  const candidates = [
    path.join(__dirname, 'downloads/openmusic.apk'),
    path.join(clientDist, 'downloads/openmusic.apk'),
    path.join(clientDist, 'downloads/apk'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveIosIpaPath() {
  const candidates = [
    path.join(__dirname, 'downloads/openmusic.ipa'),
    path.join(clientDist, 'downloads/openmusic.ipa'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** 302 兜底前校验 Release 资产直链：仅放行 GitHub 官方域名且非内网/保留地址。 */
async function resolveReleaseAssetRedirect(update, assetKind) {
  const url = update?.assets?.[assetKind]?.url;
  if (!url || !isAllowedReleaseRedirectUrl(url)) return null;
  if (!(await isSafeHttpUrl(url))) return null;
  return url;
}

async function sendAndroidApk(_req, res) {
  const apkPath = resolveAndroidApkPath();
  if (!apkPath) {
    try {
      const update = await updateService.getUpdateInfo();
      const target = await resolveReleaseAssetRedirect(update, 'android');
      if (target) return res.redirect(302, target);
    } catch { /* Keep the local deployment error below when the update source is unavailable. */ }
    return res.status(404).type('text/plain; charset=utf-8').send('APK 尚未部署，请前往 GitHub Release 下载 Android 安装包');
  }
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.download(apkPath, 'openmusic.apk');
}

async function sendIosIpa(_req, res) {
  const ipaPath = resolveIosIpaPath();
  if (!ipaPath) {
    try {
      const update = await updateService.getUpdateInfo();
      const target = await resolveReleaseAssetRedirect(update, 'ios');
      if (target) return res.redirect(302, target);
    } catch { /* Keep the local deployment error below when the update source is unavailable. */ }
    return res.status(404).type('text/plain; charset=utf-8').send('IPA 尚未部署，请前往 GitHub Release 下载 iOS 安装包，并用 Sideloadly / AltStore 安装');
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.download(ipaPath, 'openmusic.ipa');
}

async function sendDesktopPackage(_req, res) {
  try {
    const update = await updateService.getUpdateInfo();
    const target = await resolveReleaseAssetRedirect(update, 'desktop');
    if (target) return res.redirect(302, target);
  } catch { /* The release page remains the fallback when the update source is unavailable. */ }
  return res.status(404).type('text/plain; charset=utf-8').send('电脑版部署包尚未发布，请前往 GitHub Release 页面查看最新版本');
}

app.get('/downloads/openmusic.apk', sendAndroidApk);
app.get('/downloads/openmusic.ipa', sendIosIpa);
app.get('/downloads/jukeboxroom-desktop.exe', sendDesktopPackage);

mountWechatFileHelperProxy(app, fetchWithTimeout);

app.get('/robots.txt', (req, res) => {
  const origin = resolveSiteOrigin(req, ALLOWED_ORIGINS);
  res.type('text/plain').send(buildRobotsTxt(origin));
});

app.get('/sitemap.xml', (req, res) => {
  const origin = resolveSiteOrigin(req, ALLOWED_ORIGINS);
  res.type('application/xml').send(buildSitemapXml(origin));
});

app.use(express.static(clientDist, {
  setHeaders(res, filePath) {
    const rel = path.relative(clientDist, filePath).replace(/\\/g, '/');
    if (rel === 'index.html' || rel === 'sw.js' || rel.startsWith('assets/')) {
      // 稳定文件名 + 禁止长期缓存：发版覆盖源站后，CDN/浏览器会重新拉取
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  },
}));
app.get('/{*splat}', (req, res, next) => {
  if (
    req.path.startsWith('/api')
    || req.path.startsWith('/socket.io')
    || req.path.startsWith('/downloads/')
    || req.path.startsWith('/wx-proxy')
    || req.path.startsWith('/cgi-bin')
  ) {
    return next();
  }
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

const socketToRoom = new Map();
const socketToUserId = new Map();

async function isSafeMediaUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || isPrivateHostname(parsed.hostname)) {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  const cached = mediaHostSafetyCache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.safe;

  const safe = await isSafeHttpUrl(rawUrl, { lookup });
  setBoundedCacheEntry(
    mediaHostSafetyCache,
    host,
    { safe, expiresAt: Date.now() + MEDIA_HOST_CACHE_TTL_MS },
    MAX_MEDIA_HOST_CACHE_ENTRIES,
  );
  return safe;
}

function getSocketUserId(socket) {
  return socketToUserId.get(socket.id) || socket.id;
}

function rejectReadOnly(socket, callback) {
  const roomId = socketToRoom.get(socket.id);
  if (!roomId) {
    callback?.({ success: false, error: '未加入房间' });
    return true;
  }

  if (!canUserMutate(roomId, getSocketUserId(socket))) {
    callback?.({ success: false, error: '只读端无法执行此操作' });
    return true;
  }

  return false;
}

function rejectRateLimited(socket, limiter, kind, callback) {
  if (!limiter(socket, kind)) {
    callback?.({ success: false, error: '操作过于频繁，请稍后再试' });
    return true;
  }
  return false;
}

function getViewerRoomPayload(socket, roomId) {
  return serializeRoomForViewer(roomId, getSocketUserId(socket));
}

function emitSystemChat(roomId, message) {
  if (!roomId || !message) return;
  io.to(roomId).emit('chat_message', message);
}

/** 合并同房短时间内的多次 room_update，减轻人多时 O(N) 风暴 */
const ROOM_BROADCAST_DEBOUNCE_MS = 80;
const ROOM_BROADCAST_MAX_WAIT_MS = 220;
const pendingRoomBroadcasts = new Map();

function clearPendingRoomBroadcast(normalized) {
  const pending = pendingRoomBroadcasts.get(normalized);
  if (!pending) return;
  if (pending.timer) clearTimeout(pending.timer);
  if (pending.maxTimer) clearTimeout(pending.maxTimer);
  pendingRoomBroadcasts.delete(normalized);
}

function flushRoomBroadcast(normalized) {
  clearPendingRoomBroadcast(normalized);
  doBroadcastRoomUpdate(normalized);
}

/**
 * @param {string} roomId
 * @param {{ immediate?: boolean }} [options]
 */
function broadcastRoomUpdate(roomId, options = {}) {
  const normalized = roomId?.toUpperCase();
  if (!normalized) return;

  if (options.immediate) {
    clearPendingRoomBroadcast(normalized);
    doBroadcastRoomUpdate(normalized);
    return;
  }

  let pending = pendingRoomBroadcasts.get(normalized);
  if (!pending) {
    pending = { timer: null, maxTimer: null };
    pendingRoomBroadcasts.set(normalized, pending);
    pending.maxTimer = setTimeout(() => flushRoomBroadcast(normalized), ROOM_BROADCAST_MAX_WAIT_MS);
  }

  if (pending.timer) clearTimeout(pending.timer);
  pending.timer = setTimeout(() => flushRoomBroadcast(normalized), ROOM_BROADCAST_DEBOUNCE_MS);
}

function doBroadcastRoomUpdate(roomId) {
  const normalized = roomId?.toUpperCase();
  if (!normalized) return;
  const sockets = io.sockets.adapter.rooms.get(normalized);
  if (!sockets?.size) return;

  const prepared = prepareRoomBroadcast(normalized);
  if (!prepared) return;

  const muteAll = Boolean(prepared.room.muteAll);
  const basePayload = {
    ...prepared.shared,
    chatMuted: muteAll,
  };

  const personalized = [];
  for (const sid of sockets) {
    const viewerId = socketToUserId.get(sid);
    const payload = roomUpdateForViewer(prepared, viewerId);
    if (!payload) continue;

    const needsPersonal = payload.chatMuted !== muteAll
      || payload.mutedUserIds != null
      || payload.userNicknames != null
      || payload.bannedSongs != null;

    if (needsPersonal) {
      personalized.push({ sid, payload });
    }
  }

  // 绝大多数成员载荷一致：整房一次 emit，仅房主/管理员/被禁言者补一次私信
  if (personalized.length === 0) {
    io.to(normalized).emit('room_update', basePayload);
    return;
  }

  if (personalized.length >= sockets.size) {
    for (const entry of personalized) {
      io.to(entry.sid).emit('room_update', entry.payload);
    }
    return;
  }

  const personalSids = new Set(personalized.map((entry) => entry.sid));
  let target = io.to(normalized);
  for (const sid of personalSids) {
    target = target.except(sid);
  }
  target.emit('room_update', basePayload);

  for (const entry of personalized) {
    io.to(entry.sid).emit('room_update', entry.payload);
  }
}

function broadcastPlaybackState(roomId) {
  const internal = getRoomInternal(roomId);
  if (!internal) return;
  const state = buildPlaybackState(internal);
  if (state) io.to(roomId).emit('playback_state', state);
}

setOnRoomPrefetchReady((roomId) => {
  broadcastRoomUpdate(roomId);
});

setOnRoomStructureChanged((roomId) => {
  broadcastRoomUpdate(roomId, { immediate: true });
  broadcastPlaybackState(roomId);
});

function emitRoomAndPlayback(roomId, room) {
  // 切歌/队列结构变化：立即下发完整 room + playback
  broadcastRoomUpdate(roomId, { immediate: true });
  broadcastPlaybackState(roomId);

  if (room?.randomLoading && !room.current) {
    ensurePlayback(roomId).then((nextRoom) => {
      if (!nextRoom) return;
      if (nextRoom.current) {
        emitRoomAndPlayback(roomId, nextRoom);
        return;
      }
      broadcastRoomUpdate(roomId, { immediate: true });
      broadcastPlaybackState(roomId);
    }).catch((err) => {
      console.error('Ensure playback after loading state failed:', err.message);
    });
  }
}

/** 仅播放时钟变化（暂停/播放/seek）：只推 playback_state，避免全量 users+queue 风暴 */
function emitPlaybackOnly(roomId) {
  broadcastPlaybackState(roomId);
}

async function advanceEndedRoomNow(roomId, expectedQueueId = '') {
  const internal = getRoomInternal(roomId);
  if (!internal?.current || !internal.isPlaying) return null;
  if (expectedQueueId && internal.current.queueId !== expectedQueueId) return null;

  const beforeQueueId = internal.current.queueId;
  const beforePosition = getPlaybackTime(internal);
  const advanced = await advancePlaybackIfEnded(roomId, {
    force: Boolean(expectedQueueId),
    expectedQueueId,
  });
  if (!advanced) return null;
  if (advanced.current?.queueId === beforeQueueId) return null;

  emitRoomAndPlayback(roomId, advanced);
  console.log('playback auto advanced', {
    roomId,
    from: beforeQueueId,
    at: beforePosition.toFixed(2),
    to: advanced.current?.queueId || 'loading',
  });
  return advanced;
}

io.use((socket, next) => {
  // Socket connection rate limit (per IP) and concurrent connection cap.
  const ip = getClientIp(socket) || socket.id;
  const result = slidingCount(`socket-handshake:${ip}`, 60_000, 30, {
    maxBuckets: MAX_RATE_LIMIT_BUCKETS,
  });
  if (!result.allowed) return next(new Error('connection_rate_limited'));
  if (!concurrentSockets(ip)) return next(new Error('connection_limit_reached'));
  socket.__concurrencyKey = ip;
  next();
});

io.on('connection', (socket) => {
  socket.on('join_room', ({ roomId, nickname, password, readOnly }, callback) => {
    const id = roomId?.toUpperCase();
    if (!roomExists(id)) {
      callback?.({ success: false, error: '房间不存在' });
      return;
    }

    const ip = getClientIp(socket);
    if (!limitJoinAttempt(`join:${ip}:${id}`)) {
      callback?.({ success: false, error: '尝试过于频繁，请稍后再试' });
      return;
    }

    const cookieIdentity = resolveIdentityFromCookies(socket.handshake?.headers?.cookie || '');
    const userId = Boolean(readOnly)
      ? createServerClientId()
      : (cookieIdentity?.userId || createServerClientId());

    if (!readOnly && !cookieIdentity) {
      callback?.({ success: false, error: '会话未就绪，请刷新页面后重试', needsSession: true });
      return;
    }

    const auth = verifyRoomPassword(id, password, { clientId: userId });
    if (!auth.ok) {
      callback?.({ success: false, error: auth.error, needsPassword: auth.needsPassword });
      return;
    }

    const deviceId = resolveDeviceIdFromCookieHeader(socket.handshake?.headers?.cookie || '');
    const joinRoomInternal = getRoomInternal(id);
    if (joinRoomInternal && isAccessBanned(joinRoomInternal, userId, deviceId)) {
      callback?.({ success: false, error: '你已被移出该房间，无法再次进入' });
      return;
    }

    if (deviceId && !Boolean(readOnly)) {
      void linkDeviceToUser(deviceId, userId);
    }

    const prevRoomId = socketToRoom.get(socket.id);
    const prevUserId = getSocketUserId(socket);
    if (prevRoomId && prevRoomId !== id) {
      socket.leave(prevRoomId);
      const prevResult = removeUser(prevRoomId, prevUserId, socket.id);
      if (prevResult?.userRemoved && !prevResult.empty) {
        broadcastRoomUpdate(prevRoomId);
      }
    }

    // 同一连接再次加入同一房间，但解析出的用户身份不同（如身份令牌尚未持久化、
    // 快速重连或 StrictMode 重复挂载）：先移除旧的占位用户，避免一个浏览器出现多个用户。
    if (prevRoomId === id && prevUserId && prevUserId !== userId) {
      removeUser(id, prevUserId, socket.id);
    }

    const joinInternalBefore = getRoomInternal(id);
    const priorUser = joinInternalBefore?.users?.get(userId);
    const hadActiveSession = Boolean(
      priorUser && (
        (Array.isArray(priorUser.connectionIds) && priorUser.connectionIds.length > 0)
        || priorUser.connectionId
      ),
    );

    const clientIp = getClientIp(socket);
    const joinedRoom = addUser(id, userId, nickname, {
      readOnly: Boolean(readOnly),
      connectionId: socket.id,
      location: fallbackLocationForIp(clientIp),
      deviceId: deviceId || undefined,
    });
    if (!joinedRoom) {
      callback?.({ success: false, error: '加入房间失败' });
      return;
    }
    if (joinedRoom.error) {
      callback?.({ success: false, error: joinedRoom.error });
      return;
    }

    socketToRoom.set(socket.id, id);
    socketToUserId.set(socket.id, userId);
    socket.join(id);
    attachUserLocation(id, userId, clientIp);

    const welcomeMessage = hadActiveSession ? null : postMemberWelcomeMessage(id, userId);

    // 无当前歌曲且队列为空时，加入后会异步拉取随机歌曲，先告知客户端"加载中"，
    // 避免播放条在随机歌曲到达前直接消失。
    const loadingRoom = markRandomLoading(id);
    const roomPayload = loadingRoom || joinedRoom;
    const chatHistory = getChatHistoryForUser(id, userId, { limit: INITIAL_CHAT_LIMIT });
    const joinInternal = getRoomInternal(id);
    const playbackState = joinInternal ? buildPlaybackState(joinInternal) : null;

    const joinUser = joinInternal?.users.get(userId);
    // 先 ACK 再广播：人数多时 O(N) 序列化/推送不应阻塞进房方超时
    callback?.({
      success: true,
      room: serializeRoomForViewer(id, userId) || roomPayload,
      messages: chatHistory.messages || [],
      chatHasMore: Boolean(chatHistory.hasMore),
      playbackState,
      socketId: userId,
      nickname: joinUser?.nickname
        || roomPayload.users?.find((user) => user.id === userId)?.nickname
        || String(nickname || '').trim(),
      isOwner: roomPayload.creatorId === userId,
      isAdmin: (roomPayload.adminIds || []).includes(userId),
      canControlPlayback: roomPayload.creatorId === userId || (roomPayload.adminIds || []).includes(userId),
      isPlaybackLeader: roomPayload.ownerId === userId,
    });

    setImmediate(() => {
      broadcastRoomUpdate(id);
      if (welcomeMessage) {
        socket.to(id).emit('chat_message', welcomeMessage);
      }
    });

    ensurePlayback(id).then((room) => {
      if (room) emitRoomAndPlayback(id, room);
    }).catch((err) => {
      console.error('Ensure playback after join failed:', err.message);
    });
  });

  socket.on('rename_user', ({ nickname }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'rename', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const userId = getSocketUserId(socket);
    const result = renameUser(roomId, userId, nickname);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('rename_room', ({ name }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'rename_room', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = renameRoom(roomId, getSocketUserId(socket), name, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_room_lock', ({ locked, password }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_lock', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setRoomLock(roomId, getSocketUserId(socket), { locked, password }, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_room_fm_mode', ({ mode }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_fm_mode', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setRoomFmMode(roomId, getSocketUserId(socket), mode, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_room_source_credential', ({ source, credential }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_source_credential', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setRoomSourceCredential(roomId, getSocketUserId(socket), source, credential ?? null, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_room_announcement', ({ enabled, text }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_announcement', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setRoomAnnouncement(roomId, getSocketUserId(socket), { enabled, text }, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_room_song_request', ({ enabled, minStaySec, maxPerUser, cooldownSec, queueMaxLength, memberJumpEnabled, dislikeSkipMode, dislikeSkipThreshold, dislikeSkipPercent, clearSongsOnLeaveEnabled, clearSongsOnLeaveDelaySec }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_song_request', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setSongRequestEnabled(roomId, getSocketUserId(socket), {
      enabled,
      minStaySec,
      maxPerUser,
      cooldownSec,
      queueMaxLength,
      memberJumpEnabled,
      dislikeSkipMode,
      dislikeSkipThreshold,
      dislikeSkipPercent,
      clearSongsOnLeaveEnabled,
      clearSongsOnLeaveDelaySec,
    }, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('ban_room_song', ({ song }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'ban_room_song', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = banRoomSong(roomId, getSocketUserId(socket), song);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('unban_room_song', ({ name }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'unban_room_song', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = unbanRoomSong(roomId, getSocketUserId(socket), name);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_room_audio_quality', ({ netease, tencent }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_audio_quality', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setRoomAudioQuality(roomId, getSocketUserId(socket), { netease, tencent }, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_room_member_tier', ({ userId, tier }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_member_tier', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setRoomMemberTier(roomId, getSocketUserId(socket), userId, tier, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('remove_room_member_tier', ({ userId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'remove_room_member_tier', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = removeRoomMemberTier(roomId, getSocketUserId(socket), userId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_room_member_settings', (settings, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_member_settings', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setRoomMemberSettings(roomId, getSocketUserId(socket), settings, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_chat_mute', ({ muteAll, userId, muted }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_chat_mute', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setChatMute(roomId, getSocketUserId(socket), { muteAll, userId, muted }, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('kick_user', async ({ userId: targetUserId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'kick_user', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const actorId = getSocketUserId(socket);
    const result = await kickUser(roomId, actorId, targetUserId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);

    for (const [sid, rid] of socketToRoom.entries()) {
      if (rid !== roomId || socketToUserId.get(sid) !== targetUserId) continue;
      const kickedSocket = io.sockets.sockets.get(sid);
      socketToRoom.delete(sid);
      socketToUserId.delete(sid);
      kickedSocket?.leave(roomId);
      kickedSocket?.emit('kicked', {
        message: '你已被房主移出房间，无法再次进入',
      });
    }

    callback?.({
      success: true,
      room: getViewerRoomPayload(socket, roomId),
      message: `已移出「${result.kickedNickname}」，该用户将无法再次进入本房间`,
    });
  });

  socket.on('transfer_owner', ({ userId: targetUserId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'transfer_owner', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const actorId = getSocketUserId(socket);
    const result = transferOwner(roomId, actorId, targetUserId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId), message: result.message });
  });

  socket.on('set_room_admin', ({ userId: targetUserId, admin }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_admin', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const actorId = getSocketUserId(socket);
    const result = setRoomAdmin(roomId, actorId, targetUserId, Boolean(admin), socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId), message: result.message });
  });

  socket.on('leave_room', (_payload, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: true });
      return;
    }

    socket.leave(roomId);
    socketToRoom.delete(socket.id);
    const userId = getSocketUserId(socket);
    socketToUserId.delete(socket.id);
    const result = removeUser(roomId, userId, socket.id);
    if (result?.userRemoved && !result.empty) {
      broadcastRoomUpdate(roomId);
    }
    callback?.({ success: true });
  });

  socket.on('add_song', async ({ song }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'add_song', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const clean = sanitizeClientSong(song);
    if (clean.error) {
      callback?.({ success: false, error: clean.error });
      return;
    }

    const room = getRoomInternal(roomId);
    const userId = getSocketUserId(socket);
    const user = room?.users.get(userId);
    const result = await addToQueue(roomId, clean.song, {
      id: userId,
      nickname: user?.nickname || '匿名',
    });
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    emitRoomAndPlayback(roomId, result.room);
    recordSongRequest(clean.song);
    emitSystemChat(roomId, result.systemMessage);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('remove_song', ({ queueId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'remove_song', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = removeFromQueue(roomId, getSocketUserId(socket), queueId);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    emitSystemChat(roomId, result.systemMessage);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('clear_queue', (_payload, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'clear_queue', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = clearQueue(roomId, getSocketUserId(socket));
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('skip_song', async (_payload, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'skip_song', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = await skipSong(roomId, getSocketUserId(socket), socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    emitRoomAndPlayback(roomId, result.room);
    emitSystemChat(roomId, result.systemMessage);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('finish_song', async ({ queueId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const expectedQueueId = String(queueId || '');
    const advanced = await advanceEndedRoomNow(roomId, expectedQueueId);
    if (advanced) {
      emitRoomAndPlayback(roomId, advanced);
      callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
      return;
    }

    const result = await finishCurrentSong(roomId, getSocketUserId(socket), socket.id, expectedQueueId);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    emitRoomAndPlayback(roomId, result.room);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('request_jump', async ({ queueId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'request_jump', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = await requestJump(roomId, getSocketUserId(socket), queueId);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    emitSystemChat(roomId, result.systemMessage);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('toggle_queue_like', ({ queueId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'toggle_queue_like', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = toggleQueueLike(roomId, getSocketUserId(socket), queueId);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    // 点赞会改队列排序：只推 queue/current，不下发整包 users
    io.to(roomId).emit('queue_snapshot', {
      queue: result.queue || [],
      current: result.current || null,
    });
    emitSystemChat(roomId, result.systemMessage);
    callback?.({ success: true, liked: result.liked });
  });

  socket.on('toggle_current_dislike', async (_payload, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'toggle_current_dislike', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = await toggleCurrentDislike(roomId, getSocketUserId(socket));
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    if (result.skipped) {
      emitRoomAndPlayback(roomId, result.room);
    } else {
      io.to(roomId).emit('queue_snapshot', {
        queue: result.room?.queue || [],
        current: result.room?.current || null,
      });
    }
    emitSystemChat(roomId, result.systemMessage);
    callback?.({
      success: true,
      disliked: result.disliked,
      skipped: result.skipped,
      dislikeCount: result.dislikeCount,
      threshold: result.threshold,
      room: getViewerRoomPayload(socket, roomId),
    });
  });

  socket.on('approve_jump', async ({ requestId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'approve_jump', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = await approveJump(roomId, getSocketUserId(socket), requestId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('reject_jump', ({ requestId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'reject_jump', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = rejectJump(roomId, getSocketUserId(socket), requestId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('request_skip', async (_payload, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'request_skip', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = await requestSkip(roomId, getSocketUserId(socket));
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    // 投票过半自动切歌时播放状态已变化，需要广播播放状态
    if (result.autoSkipped) {
      emitRoomAndPlayback(roomId, result.room);
    } else {
      broadcastRoomUpdate(roomId);
    }
    callback?.({ success: true, autoSkipped: Boolean(result.autoSkipped), room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('approve_skip', async ({ requestId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'approve_skip', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = await approveSkip(roomId, getSocketUserId(socket), requestId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    emitRoomAndPlayback(roomId, result.room);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('reject_skip', ({ requestId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'reject_skip', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = rejectSkip(roomId, getSocketUserId(socket), requestId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('send_chat', ({ text, mentions, replyTo, imageUrl, imageKey, asSticker }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketChat, 'send_chat', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = addChatMessage(roomId, getSocketUserId(socket), text, {
      mentions,
      replyTo,
      imageUrl,
      imageKey,
      asSticker,
    });
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    // 先 ACK 再广播，避免大图表情包推给全员时发送方超时
    callback?.({ success: true, message: result.message });

    const rawUrl = String(result.message?.imageUrl || '');
    const hugeDataUrl = rawUrl.startsWith('data:') && rawUrl.length > 12 * 1024;
    if (hugeDataUrl) {
      // 超大 data URL：其他人只收占位，发送者收完整图（socket.to 不含自己）
      socket.to(roomId).emit('chat_message', { ...result.message, imageUrl: null });
      socket.emit('chat_message', result.message);
    } else {
      io.to(roomId).emit('chat_message', result.message);
    }
  });

  socket.on('toggle_chat_reaction', ({ messageId, emoji }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketChat, 'chat_reaction', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = toggleChatReaction(roomId, getSocketUserId(socket), messageId, emoji);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    io.to(roomId).emit('chat_reaction_update', {
      messageId: result.messageId,
      reactions: result.reactions,
    });
    callback?.({ success: true, messageId: result.messageId, reactions: result.reactions });
  });

  socket.on('load_chat_history', ({ before, beforeId, limit }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = getChatHistoryForUser(roomId, getSocketUserId(socket), { before, beforeId, limit });
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    callback?.({
      success: true,
      messages: result.messages,
      hasMore: Boolean(result.hasMore),
    });
  });

  socket.on('load_song_history', ({ limit }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = getSongHistory(roomId, { limit });
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    callback?.({ success: true, songs: result.songs });
  });

  socket.on('report_track_duration', ({ queueId, durationMs }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = reportTrackDuration(
      roomId,
      getSocketUserId(socket),
      queueId,
      durationMs,
      socket.id,
    );
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }
    callback?.({ success: true, skipped: Boolean(result.skipped) });
  });


  socket.on('list_favorites', async (_payload, callback) => {
    const identity = resolveIdentityFromCookies(socket.handshake?.headers?.cookie || '');
    if (!identity?.userId) {
      callback?.({ success: false, error: '会话未就绪，请刷新页面后重试' });
      return;
    }
    const favorites = await listFavoriteSongs(identity.userId);
    callback?.({ success: true, favorites });
  });

  socket.on('set_favorite', async ({ song, favorite }, callback) => {
    if (rejectRateLimited(socket, limitSocketAction, 'set_favorite', callback)) return;

    const identity = resolveIdentityFromCookies(socket.handshake?.headers?.cookie || '');
    if (!identity?.userId) {
      callback?.({ success: false, error: '会话未就绪，请刷新页面后重试' });
      return;
    }

    const clean = sanitizeClientSong(song);
    if (clean.error) {
      callback?.({ success: false, error: clean.error });
      return;
    }

    const result = await setFavoriteSong(identity.userId, clean.song, Boolean(favorite));
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }
    callback?.({ success: true, favorites: result.favorites, favorite: result.favorite });
  });

  socket.on('import_favorites', async ({ songs }, callback) => {
    if (rejectRateLimited(socket, limitSocketAction, 'import_favorites', callback)) return;

    const identity = resolveIdentityFromCookies(socket.handshake?.headers?.cookie || '');
    if (!identity?.userId) {
      callback?.({ success: false, error: '会话未就绪，请刷新页面后重试' });
      return;
    }

    if (!Array.isArray(songs) || songs.length === 0 || songs.length > 1000) {
      callback?.({ success: false, error: '收藏数据格式无效' });
      return;
    }

    const cleanSongs = [];
    for (const song of songs) {
      const clean = sanitizeClientSong(song);
      if (!clean.error) cleanSongs.push(clean.song);
    }

    const result = await importFavoriteSongs(identity.userId, cleanSongs);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }
    callback?.({ success: true, favorites: result.favorites, imported: result.imported, dropped: result.dropped, maxFavorites: result.maxFavorites });
  });
  socket.on('toggle_play', ({ isPlaying }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'toggle_play', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const updated = setPlaying(roomId, getSocketUserId(socket), isPlaying, socket.id);
    if (!updated) {
      callback?.({ success: false, error: '仅房主可暂停/播放' });
      return;
    }
    emitPlaybackOnly(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('seek', ({ time }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'seek', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const updated = seekTo(roomId, getSocketUserId(socket), time, socket.id);
    if (!updated) {
      callback?.({ success: false, error: '仅房主可调节进度' });
      return;
    }
    emitPlaybackOnly(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('disconnect', () => {
    if (socket.__concurrencyKey) {
      concurrentSockets.release(socket.__concurrencyKey);
      socket.__concurrencyKey = null;
    }
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;

    const userId = getSocketUserId(socket);
    socketToRoom.delete(socket.id);
    socketToUserId.delete(socket.id);

    setTimeout(() => {
      const result = removeUser(roomId, userId, socket.id);
      // 多端同用户仍在线、或房间已空：不必全房推送
      if (!result?.userRemoved || result.empty) return;
      broadcastRoomUpdate(roomId);
    }, DISCONNECT_GRACE_MS);
  });
});

let autoAdvanceRunning = false;

async function checkAutoAdvance() {
  if (autoAdvanceRunning) return;
  autoAdvanceRunning = true;

  try {
    for (const roomId of listRoomIds()) {
      const internal = getRoomInternal(roomId);
      if (!internal || internal.users.size === 0) continue;

      if (internal.randomLoading && !internal.current) {
        const retried = await retryStuckRandomLoading(roomId);
        if (retried) {
          emitRoomAndPlayback(roomId, retried);
        }
        continue;
      }

      if (!internal.isPlaying || !internal.current) continue;

      const advanced = await advancePlaybackIfEnded(roomId);
      if (advanced) {
        emitRoomAndPlayback(roomId, advanced);
      }
    }
  } finally {
    autoAdvanceRunning = false;
  }
}

const autoAdvanceTimer = DESKTOP_MODE ? null : setInterval(() => {
  void checkAutoAdvance();
}, AUTO_ADVANCE_INTERVAL_MS);
autoAdvanceTimer?.unref?.();

if (!DESKTOP_MODE) await initRooms();
if (!DESKTOP_MODE) {
  const initialAdmin = await ensureInitialAdmin();
  if (initialAdmin.created) {
    console.info(`[auth] 已创建初始超级管理员：${initialAdmin.username}`);
  } else if (initialAdmin.error) {
    console.warn(`[auth] 初始管理员未创建：${initialAdmin.error}`);
  }
}
runtime.setReady(true);
if (!DESKTOP_MODE) ensureSeedRoom(); // 测试房仅在非生产环境创建

// 每日自动检查更新：发现新版本且部署环境支持时自动完成拉取/构建/重启（AUTO_UPDATE=0 关闭）
const AUTO_UPDATE_ENABLED = !DESKTOP_MODE && process.env.AUTO_UPDATE !== '0';
const AUTO_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
if (AUTO_UPDATE_ENABLED) {
  const autoUpdateTick = async () => {
    try {
      const info = await updateService.getUpdateInfo();
      if (info?.updateAvailable) {
        console.info(`[auto-update] 发现新版本 v${info.latestVersion}，开始自动更新…`);
        applySelfUpdate();
      }
    } catch (error) {
      console.warn('[auto-update] 检查失败:', error.message);
    }
  };
  setTimeout(() => void autoUpdateTick(), 2 * 60 * 1000);
  setInterval(() => void autoUpdateTick(), AUTO_UPDATE_INTERVAL_MS);
}

if (process.env.LIBRARY_WATCH_ENABLED === '1') {
  const libraryPaths = (process.env.MUSIC_LIBRARY_PATHS || '').split(';').map((item) => item.trim()).filter(Boolean);
  if (libraryPaths.length > 0) {
    startLibraryWatcher(libraryPaths, {
      onScan: (result) => console.log(`[library] 增量扫描完成：${result.total} 首，新增 ${result.added}，更新 ${result.updated}，移除 ${result.removed}`),
    });
    console.log(`[library] 已启用目录监听：${libraryPaths.length} 个目录`);
  }
}

let shutdownPromise = null;
async function shutdown(signal) {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    runtime.setReady(false);
    if (autoAdvanceTimer) clearInterval(autoAdvanceTimer);
    stopLibraryWatcher();
    stopTaskScheduler();
    console.log(`收到 ${signal}，开始优雅停机`);

    const timeout = setTimeout(() => {
      console.error('优雅停机超时，强制退出');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timeout.unref?.();

    try {
      await new Promise((resolve) => {
        io.close(() => {
          httpServer.close(() => resolve());
        });
      });
      closeRoomManager();
      await closeRoomStorage();
      await closeRedis();
      clearTimeout(timeout);
      process.exitCode = 0;
    } catch (err) {
      clearTimeout(timeout);
      console.error('优雅停机失败:', err.message);
      process.exitCode = 1;
    }
  })();

  return shutdownPromise;
}

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });

if (!DESKTOP_MODE) await initRedisAdapter(io);

const onServerListening = () => {
  if (!DESKTOP_MODE) startTaskScheduler();
  console.log(`${DESKTOP_MODE ? '🎵 JukeboxRoom 桌面音乐 API' : '🎵 OpenMusic 服务'}运行在 http://localhost:${PORT}`);
  console.log(`📡 Meting API: ${METING_API_URL || '(未配置)'}`);
  console.log(`🔍 Meting 搜索备源: ${METING_SEARCH_API_URL || '(未配置，仅网易官方直连搜索)'}`);
  console.log(`🎤 Cyapi (QQ音乐/酷狗音乐): ${isCyapiConfigured() ? '已配置' : '未配置'}`);
  console.log(`💾 房间存储: ${isRedisEnabled() ? 'Redis' : '内存'}`);
};

if (DESKTOP_MODE) httpServer.listen(PORT, '127.0.0.1', onServerListening);
else httpServer.listen(PORT, onServerListening);
