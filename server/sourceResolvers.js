/**
 * 房主音源解析：QQ 音乐 / 酷狗 / 自定义音源（汽水等）。
 *
 * 架构：房主扫码登录（或粘贴自定义源地址）→ 凭据仅存服务端房间快照
 * （roomManager.sourceCredentials）→ 全房间成员点歌时经本模块代为解析
 * 播放地址。解析出的 CDN 直链自带签名，拉流无需再带凭据。
 *
 * 出站请求使用平台公开网页接口；音频直链返回给客户端按需走 media-proxy。
 * 各上游调用接入 mediaHealth 熔断（provider: tencent / kugou / qishui）。
 */

import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createQishuiApi, createQishuiDeviceId, isQishuiDeviceId } from 'qishui-music-api';
import { getRoomSourceCredential, getRoomInternal, setRoomSourceCredential } from './roomManager.js';
import { canRequestProvider, recordProviderFailure, recordProviderSuccess } from './mediaHealth.js';
import { isSafeHttpUrl } from './outboundUrl.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/* ------------------------------------------------------------------ */
/*  通用                                                                */
/* ------------------------------------------------------------------ */

async function fetchJson(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`上游返回 HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function md5(text) {
  return createHash('md5').update(text).digest('hex');
}

/** 酷狗 calculateMid：md5 十六进制转十进制大整数字符串 */
function kugouMid(seed) {
  return BigInt('0x' + md5(seed)).toString();
}

function withHealth(provider, fn) {
  return async (...args) => {
    if (!canRequestProvider(provider)) {
      throw new Error(`音源 ${provider} 暂时不可用，请稍后重试`);
    }
    try {
      const result = await fn(...args);
      recordProviderSuccess(provider);
      return result;
    } catch (error) {
      recordProviderFailure(provider);
      throw error;
    }
  };
}

/* ------------------------------------------------------------------ */
/*  QQ 音乐（tencent）                                                  */
/* ------------------------------------------------------------------ */

const QQ_REFERER = 'https://y.qq.com/';
const QQ_AID = '100497308';

/** QQ 音乐 vkey 音质前缀：M500=128k mp3, M800=320k mp3, F000=flac */
const TENCENT_QUALITY_PREFIX = { standard: 'M500', exhigh: 'M800', lossless: 'F000', hires: 'F000' };

function qualityPrefix(quality) {
  return TENCENT_QUALITY_PREFIX[quality] || 'M500';
}

export async function searchTencent(keyword, page = 1, limit = 30) {
  const body = {
    req_1: {
      method: 'DoSearchForQQMusicDesktop',
      module: 'music.search.SearchCgiService',
      param: { search_type: 0, query: keyword, page_num: page, num_per_page: limit },
    },
  };
  const data = await fetchJson('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: QQ_REFERER, 'User-Agent': UA },
    body: JSON.stringify(body),
  });
  const songs = data?.req_1?.data?.body?.song?.list;
  if (!Array.isArray(songs)) throw new Error('QQ 音乐搜索返回异常');
  return songs.map((s) => {
    const singerMid = s.singer?.[0]?.singerMid;
    return {
      id: s.mid,
      name: s.name || '未知歌曲',
      artist: (s.singer || []).map((x) => x?.name).filter(Boolean).join(' / ') || '未知歌手',
      album: s.album?.name || '',
      duration: Number(s.interval) > 0 ? Number(s.interval) * 1000 : undefined,
      vip: Boolean(s.pay?.pay_play),
      pic: s.album?.mid
        ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.album.mid}.jpg`
        : singerMid
          ? `https://y.gtimg.cn/music/photo_new/T001R300x300M000${singerMid}.jpg`
          : undefined,
      source: 'tencent',
    };
  }).filter((s) => s.id);
}

/**
 * 解析 QQ 音乐播放地址。roomCookie 为房主登录后的完整 Cookie 串
 * （含 uin / qm_keyst 等）；无凭据时尝试匿名请求（仅免费歌可用）。
 * 返回 CDN 直链（如 ws.stream.qqmusic.qq.com/...mp3），或 null 表示不可播。
 */
async function resolveTencentPlayUrlImpl(songMid, quality, roomCookie = '') {
  const guid = String(Math.floor(Math.random() * 9e9) + 1e9);
  const filename = `${qualityPrefix(quality)}${songMid}.mp3`;
  const body = {
    req_1: {
      module: 'vkey.GetVkeyServerBase',
      method: 'CgiGetVkey',
      param: {
        guid,
        songmid: [songMid],
        songtype: [0],
        uin: extractCookieValue(roomCookie, 'uin') || '',
        loginflag: 1,
        platform: '20',
        filename: [filename],
      },
    },
  };
  const headers = {
    'Content-Type': 'application/json',
    Referer: 'https://y.qq.com/n/ryqq/player',
    'User-Agent': UA,
  };
  if (roomCookie) headers.Cookie = roomCookie;

  const data = await fetchJson('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const info = data?.req_1?.data;
  const purl = info?.midurlinfo?.[0]?.purl || '';
  if (!purl) return null;
  const sip = (info?.sip || []).find((host) => host && host !== 'http://ws.stream.qqmusic.qq.com/');
  const base = info?.sip?.[0] || 'http://ws.stream.qqmusic.qq.com/';
  return `${base}${purl}`;
}

export const resolveTencentPlayUrl = withHealth('tencent', resolveTencentPlayUrlImpl);

/* ---------- QQ 扫码登录（ptlogin2 标准二维码流程） ---------- */

const qqLoginSessions = new Map(); // sessionKey -> { qrsig, createdAt }
const QQ_SESSION_TTL_MS = 3 * 60 * 1000;

function hash33(text) {
  let hash = 0;
  for (let i = 0; i < text.length; ++i) {
    hash += (hash << 5) + text.charCodeAt(i);
    hash &= 0x7fffffff;
  }
  return hash;
}

/** 极简 Cookie 罐：收集所有响应的 Set-Cookie */
function createCookieJar(initialCookie = '') {
  const map = new Map();
  for (const pair of initialCookie.split(';')) {
    const eq = pair.indexOf('=');
    if (eq > 0) map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return {
    absorb(res) {
      const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
      for (const line of list) {
        const [pair] = line.split(';');
        const eq = pair.indexOf('=');
        if (eq > 0) map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    },
    toString() {
      return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    },
  };
}

export function extractCookieValue(cookieStr, name) {
  const match = String(cookieStr || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

/** 发起 QQ 扫码登录：返回 { sessionKey, qrImage }（png 的 data URL） */
export async function startTencentQrLogin() {
  const res = await fetch(
    `https://ssl.ptlogin2.qq.com/ptqrshow?appid=${QQ_AID}&e=0&l=L&s=8&d=72&v=4&t=${Math.random()}&daid=1&pt_type=1`,
    { headers: { 'User-Agent': UA }, redirect: 'manual' },
  );
  if (res.status === 403) {
    throw new Error('腾讯风控拦截了本服务器的扫码请求（403），请按提示用 Cookie 方式登录：浏览器登录 y.qq.com 后复制 Cookie');
  }
  if (!res.ok) throw new Error('获取登录二维码失败');
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const qrsig = (setCookies.find((c) => c.startsWith('qrsig=')) || '').split(';')[0]?.slice(6) || '';
  if (!qrsig) throw new Error('二维码会话异常，请重试');

  const buf = Buffer.from(await res.arrayBuffer());
  const sessionKey = randomBytes(12).toString('hex');
  qqLoginSessions.set(sessionKey, { qrsig, createdAt: Date.now() });
  for (const [key, value] of qqLoginSessions) {
    if (Date.now() - value.createdAt > QQ_SESSION_TTL_MS) qqLoginSessions.delete(key);
  }
  return { sessionKey, qrImage: `data:image/png;base64,${buf.toString('base64')}` };
}

const QQ_LOGIN_STATUS_TEXT = {
  0: 'confirmed',
  65: 'waiting',
  66: 'scanned',
  67: 'expired',
};

/**
 * 轮询 QQ 扫码状态。confirmed 时完成 cookie 交换并返回房间凭据。
 * 返回 { status: waiting|scanned|expired|confirmed, cookie? }
 */
export async function pollTencentQrLogin(sessionKey) {
  const session = qqLoginSessions.get(sessionKey);
  if (!session) return { status: 'expired' };

  const ptqrtoken = hash33(session.qrsig);
  const loginUrl =
    `https://ssl.ptlogin2.qq.com/ptqrlogin?u1=${encodeURIComponent('https://y.qq.com/')}` +
    `&ptqrtoken=${ptqrtoken}&ptredirect=0&h=1&t=1&g=1&from_ui=1&ptlang=2052` +
    `&action=0-0-${Date.now()}&js_ver=20122815&js_type=1&login_sig=&pt_uistyle=40` +
    `&aid=${QQ_AID}&daid=1&`;

  const jar = createCookieJar();
  const first = await fetch(loginUrl, { headers: { 'User-Agent': UA }, redirect: 'manual' });
  jar.absorb(first);
  const text = await first.text();
  const match = text.match(/ptuiCB\('(\d+)'[^']*'([^']*)'/);
  if (!match) return { status: 'waiting' };

  const status = QQ_LOGIN_STATUS_TEXT[match[1]];
  if (!status || status === 'waiting' || status === 'scanned') return { status: status || 'waiting' };
  if (status === 'expired') {
    qqLoginSessions.delete(sessionKey);
    return { status: 'expired' };
  }

  // 登录成功：跟随 check_url 重定向链，收集全部 Set-Cookie
  let checkUrl = match[2];
  for (let hop = 0; hop < 5 && checkUrl; hop += 1) {
    const res = await fetch(checkUrl, {
      headers: { 'User-Agent': UA, Cookie: jar.toString() },
      redirect: 'manual',
    });
    jar.absorb(res);
    const location = res.headers.get('location');
    if (!location || res.status < 300 || res.status >= 400) break;
    checkUrl = new URL(location, checkUrl).toString();
  }

  // 访问一次 y.qq.com 接口补齐 qm_keyst 等业务 Cookie
  try {
    const warm = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: QQ_REFERER, 'User-Agent': UA, Cookie: jar.toString() },
      body: JSON.stringify({ req_1: { module: 'music.musicsearch.HistoryKeyService', method: 'get', param: {} } }),
    });
    jar.absorb(warm);
  } catch {
    // 补齐失败不阻塞登录
  }

  qqLoginSessions.delete(sessionKey);
  const cookie = jar.toString();
  if (!extractCookieValue(cookie, 'uin')) return { status: 'expired' };
  return { status: 'confirmed', cookie };
}

/* ------------------------------------------------------------------ */
/*  网易云音乐（netease）：扫码登录 + VIP 直链解析                         */
/* ------------------------------------------------------------------ */

const NETEASE_PRESET_KEY = '0CoJUm6Qyw8W8jud';
const NETEASE_IV = '0102030405060708';
const NETEASE_RSA_MODULUS = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';

const neteaseBase62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function neteaseRandom16() {
  return Array.from({ length: 16 }, () => neteaseBase62[Math.floor(Math.random() * neteaseBase62.length)]).join('');
}

function neteaseAes(text, key) {
  const cipher = createCipheriv('aes-128-cbc', key, NETEASE_IV);
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('base64');
}

/** 网易云 web 端公开的 weapi 请求加密（params + encSecKey） */
function neteaseWeapi(obj) {
  const secret = neteaseRandom16();
  const params = neteaseAes(neteaseAes(JSON.stringify(obj), NETEASE_PRESET_KEY), secret);
  const n = BigInt('0x' + NETEASE_RSA_MODULUS);
  const m = Buffer.from(secret.split('').reverse().join(''), 'binary');
  let c = 0n;
  for (const b of m) c = (c << 8n) | BigInt(b);
  let r = 1n;
  let base = c % n;
  let exp = 0x10001n;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % n;
    base = (base * base) % n;
    exp >>= 1n;
  }
  return { params, encSecKey: r.toString(16).padStart(256, '0') };
}

async function neteaseWeapiPost(path, obj) {
  const { params, encSecKey } = neteaseWeapi(obj);
  const res = await fetch(`https://music.163.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Referer: 'https://music.163.com/' },
    body: `params=${encodeURIComponent(params)}&encSecKey=${encodeURIComponent(encSecKey)}`,
  });
  if (!res.ok) throw new Error(`网易接口返回 HTTP ${res.status}`);
  return { json: await res.json(), res };
}

const neteaseLoginSessions = new Map(); // sessionKey -> { unikey, createdAt }
const NETEASE_SESSION_TTL_MS = 5 * 60 * 1000;

/** 发起网易云扫码登录：本地生成二维码（内容为官方登录确认页地址） */
export async function startNeteaseLogin() {
  const { json } = await neteaseWeapiPost('/weapi/login/qrcode/unikey', { type: 1 });
  const unikey = json?.unikey;
  if (json?.code !== 200 || !unikey) throw new Error('获取网易云登录二维码失败');

  const sessionKey = randomBytes(12).toString('hex');
  neteaseLoginSessions.set(sessionKey, { unikey, createdAt: Date.now() });
  for (const [key, value] of neteaseLoginSessions) {
    if (Date.now() - value.createdAt > NETEASE_SESSION_TTL_MS) neteaseLoginSessions.delete(key);
  }

  const { default: QRCode } = await import('qrcode');
  const qrImage = await QRCode.toDataURL(`https://music.163.com/login?codekey=${unikey}`, { margin: 1, width: 400 });
  return { sessionKey, qrImage };
}

/**
 * 轮询网易云扫码状态。
 * 上游状态码：800 过期 / 801 等待 / 802 已扫 / 803 授权成功（Set-Cookie 返回 MUSIC_U）。
 */
export async function pollNeteaseLogin(sessionKey) {
  const session = neteaseLoginSessions.get(sessionKey);
  if (!session) return { status: 'expired' };

  const { json, res } = await neteaseWeapiPost('/weapi/login/qrcode/client/login', { key: session.unikey, type: 1 });
  const code = Number(json?.code);
  if (code === 803) {
    neteaseLoginSessions.delete(sessionKey);
    const jar = [];
    for (const line of (typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [])) {
      const [pair] = line.split(';');
      if (pair.includes('=')) jar.push(pair.trim());
    }
    const cookie = jar.join('; ');
    if (!extractCookieValue(cookie, 'MUSIC_U')) return { status: 'expired' };
    return { status: 'confirmed', cookie };
  }
  if (code === 800) {
    neteaseLoginSessions.delete(sessionKey);
    return { status: 'expired' };
  }
  if (code === 802) return { status: 'scanned' };
  return { status: 'waiting' };
}

/**
 * 解析网易云播放地址：房间凭据（房主扫码后的 Cookie，含 MUSIC_U）→
 * 官方 player/url 接口（VIP/无损按账号权限）；无凭据返回 null（调用方回退免费链路）。
 */
export async function resolveNeteasePlayUrlWithCookie(songId, quality, roomCookie) {
  if (!roomCookie) return null;
  const br = quality === 'lossless' || quality === 'hires' ? 999000 : quality === 'exhigh' ? 320000 : 128000;
  const url = `https://music.163.com/api/song/enhance/player/url?ids=[${encodeURIComponent(songId)}]&br=${br}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://music.163.com/', Cookie: roomCookie },
  });
  if (!res.ok) throw new Error(`网易解析返回 HTTP ${res.status}`);
  const data = await res.json();
  const info = Array.isArray(data?.data) ? data.data[0] : null;
  return info?.url || null;
}

export const resolveNeteasePlayUrl = withHealth('netease', resolveNeteasePlayUrlWithCookie);

/* ------------------------------------------------------------------ */
/*  酷狗音乐（kugou）                                                    */
/* ------------------------------------------------------------------ */

const KUGOU_SALT_WEB = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt';
const KUGOU_KEY_SALT = '57ae12eb6890223e355ccfcb74edf70d';

/** 酷狗 web 版签名：盐 + 按 k=v 排序拼接 + 盐，取 MD5 */
function kugouWebSignature(params, data = '') {
  const str = Object.keys(params)
    .map((key) => `${key}=${params[key]}`)
    .sort()
    .join('');
  return md5(`${KUGOU_SALT_WEB}${str}${data}${KUGOU_SALT_WEB}`);
}

function kugouSignKey(hash, mid, userid, appid) {
  return md5(`${hash}${KUGOU_KEY_SALT}${appid || 1005}${mid}${userid || 0}`);
}

export async function searchKugou(keyword, page = 1, limit = 30) {
  const url =
    `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}` +
    `&page=${page}&pagesize=${limit}`;
  const data = await fetchJson(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' },
  });
  const lists = data?.data?.lists;
  if (!Array.isArray(lists)) throw new Error('酷狗搜索返回异常');
  return lists.map((s) => ({
    id: s.FileHash,
    albumAudioId: s.MixSongID ?? s.AlbumID ?? 0,
    name: String(s.SongName || '未知歌曲').replace(/<em>|<\/em>/g, ''),
    artist: String(s.SingerName || '未知歌手').replace(/<em>|<\/em>/g, ''),
    album: s.AlbumName || '',
    duration: Number(s.Duration) > 0 ? Number(s.Duration) * 1000 : undefined,
    vip: undefined,
    pic: s.Image || undefined,
    source: 'kugou',
  })).filter((s) => s.id);
}

/**
 * 解析酷狗播放地址。
 * - 有房主凭据（扫码登录后的 Cookie 串，含 token/userid/kg_mid/dfid）：走 /v5/url
 *   （trackercdn 网关，signKey 鉴权），可返回 VIP/无损；
 * - 无凭据：走移动端 getSongInfo 免费接口。
 */
async function resolveKugouPlayUrlImpl(hash, quality, roomCookie = '') {
  const wantsLossless = quality === 'lossless' || quality === 'hires' || quality === 'flac';

  if (roomCookie) {
    try {
      const url = await resolveKugouV5Url(hash, quality, roomCookie);
      if (url) return url;
    } catch {
      // 高音质失败时回落免费链路
    }
  }

  // 免费链路：移动端接口（免费歌可用，固定 128k）
  const data = await fetchJson(
    `https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${encodeURIComponent(hash)}`,
    { headers: { 'User-Agent': UA } },
  );
  if (wantsLossless && data?.status !== 1) return null;
  return data?.url || null;
}

export const resolveKugouPlayUrl = withHealth('kugou', resolveKugouPlayUrlImpl);

/** 已登录：酷狗 /v5/url（x-router: trackercdn.kugou.com） */
async function resolveKugouV5Url(hash, quality, cookieStr) {
  const mid = extractCookieValue(cookieStr, 'kg_mid') || kugouMid(String(Date.now()));
  const token = extractCookieValue(cookieStr, 'token') || '';
  const userid = extractCookieValue(cookieStr, 'userid') || '0';
  const dfid = extractCookieValue(cookieStr, 'dfid') || '-';
  const qualityValue = quality === 'lossless' || quality === 'hires' || quality === 'flac'
    ? 'flac'
    : quality === 'exhigh' ? '320' : '128';

  const params = {
    dfid,
    mid,
    uuid: '-',
    appid: '1005',
    clientver: '11430',
    clienttime: String(Math.floor(Date.now() / 1000)),
    token,
    userid,
    album_id: '0',
    album_audio_id: '0',
    area_code: '1',
    hash: hash.toLowerCase(),
    ssa_flag: 'is_fromtrack',
    version: '11430',
    page_id: '151369488',
    quality: qualityValue,
    behavior: 'play',
    pid: '2',
    cmd: '26',
    pidversion: '3001',
    IsFreePart: '0',
    ppage_id: '463467626,350369493,788954147',
    cdnBackup: '1',
    module: '',
    key: kugouSignKey(hash.toLowerCase(), mid, userid, '1005'),
  };

  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const res = await fetch(`https://gateway.kugou.com/v5/url?${qs}`, {
    headers: {
      'User-Agent': UA,
      'x-router': 'trackercdn.kugou.com',
      dfid,
      mid,
      clienttime: params.clienttime,
      Cookie: cookieStr,
    },
  });
  if (!res.ok) throw new Error(`酷狗解析返回 HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : [];
  const first = list.find((item) => item?.url) || list[0];
  return first?.url || null;
}

/* ---------- 酷狗扫码登录 ---------- */

const kugouLoginSessions = new Map(); // sessionKey -> { mid, key, createdAt }
const KUGOU_SESSION_TTL_MS = 3 * 60 * 1000;

/** 酷狗 web 请求：注入 dfid/mid/uuid/appid/clientver/clienttime 并附 web 签名 */
function kugouWebRequest(baseParams, { cookieStr = '', data } = {}) {
  const mid = extractCookieValue(cookieStr, 'kg_mid') || kugouMid(String(randomBytes(16).toString('hex')));
  const token = extractCookieValue(cookieStr, 'token');
  const userid = extractCookieValue(cookieStr, 'userid');
  const dfid = extractCookieValue(cookieStr, 'dfid') || '-';
  const params = {
    dfid,
    mid,
    uuid: '-',
    appid: '1014',
    clientver: '20489',
    clienttime: String(Math.floor(Date.now() / 1000)),
    ...baseParams,
  };
  if (token) params.token = token;
  if (userid && userid !== '0') params.userid = userid;
  params.signature = kugouWebSignature(params, data || '');
  return { params, mid, dfid };
}

/** 发起酷狗扫码登录：返回 { sessionKey, qrImage }（png 的 data URL） */
export async function startKugouQrLogin() {
  const seed = randomBytes(16).toString('hex');
  const { params, mid } = kugouWebRequest({
    type: '1',
    plat: '4',
    qrcode_txt: 'https://h5.kugou.com/apps/loginQRCode/html/index.html?appid=1005&',
    srcappid: '2919',
  });

  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const data = await fetchJson(`https://login-user.kugou.com/v2/qrcode?${qs}`, {
    headers: {
      'User-Agent': UA,
      dfid: params.dfid,
      mid: params.mid,
      clienttime: params.clienttime,
    },
  });
  if (data?.status !== 1 || !data?.data?.qrcode) throw new Error('获取酷狗登录二维码失败');

  const sessionKey = randomBytes(12).toString('hex');
  kugouLoginSessions.set(sessionKey, { mid, key: data.data.qrcode, createdAt: Date.now() });
  for (const [key, value] of kugouLoginSessions) {
    if (Date.now() - value.createdAt > KUGOU_SESSION_TTL_MS) kugouLoginSessions.delete(key);
  }

  // 直接使用酷狗官方生成的二维码（保证 App 可扫）；接口未返回时才本地按 h5 登录页地址生成
  let qrImage = data.data.qrcode_img || '';
  if (!qrImage.startsWith('data:image')) {
    const { default: QRCode } = await import('qrcode');
    const qrUrl = `https://h5.kugou.com/apps/loginQRCode/html/index.html?appid=1005&qrcode=${data.data.qrcode}`;
    qrImage = await QRCode.toDataURL(qrUrl, { margin: 1, width: 240 });
  }
  return { sessionKey, qrImage, mid };
}

/**
 * 轮询酷狗扫码状态。
 * 上游状态：0 过期 / 1 等待 / 2 已扫待确认 / 4 登录成功（返回 token）。
 */
export async function pollKugouQrLogin(sessionKey) {
  const session = kugouLoginSessions.get(sessionKey);
  if (!session) return { status: 'expired' };

  const { params } = kugouWebRequest({
    plat: '4',
    appid: '1005',
    srcappid: '2919',
    qrcode: session.key,
  });
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const data = await fetchJson(`https://login-user.kugou.com/v2/get_userinfo_qrcode?${qs}`, {
    headers: {
      'User-Agent': UA,
      dfid: params.dfid,
      mid: session.mid,
      clienttime: params.clienttime,
    },
  });

  const status = Number(data?.data?.status);
  if (status === 4) {
    kugouLoginSessions.delete(sessionKey);
    const token = data?.data?.token || '';
    const userid = data?.data?.userid || '';
    if (!token) return { status: 'expired' };
    const cookie = [
      `kg_mid=${session.mid}`,
      `dfid=${params.dfid}`,
      `token=${token}`,
      `userid=${userid}`,
    ].join('; ');
    return { status: 'confirmed', cookie };
  }
  if (status === 0) {
    kugouLoginSessions.delete(sessionKey);
    return { status: 'expired' };
  }
  if (status === 2) return { status: 'scanned' };
  return { status: 'waiting' };
}

/* ------------------------------------------------------------------ */
/*  汽水音乐（qishui，车机协议，qishui-music-api）                        */
/*  抖音/汽水 App 扫码授权；标准音质免登录可播，登录后解锁更高音质         */
/* ------------------------------------------------------------------ */

const DEVICE_FILE = new URL('./.qishui-device', import.meta.url);
let globalDeviceId = null;

function getGlobalDeviceId() {
  if (globalDeviceId) return globalDeviceId;
  try {
    const saved = readFileSync(DEVICE_FILE, 'utf8').trim();
    if (isQishuiDeviceId(saved)) {
      globalDeviceId = saved;
      return saved;
    }
  } catch {
    // 首次运行无文件
  }
  globalDeviceId = createQishuiDeviceId();
  try {
    writeFileSync(DEVICE_FILE, globalDeviceId, 'utf8');
  } catch {
    // 写入失败仅影响重启后会话恢复，不阻塞
  }
  return globalDeviceId;
}

const qishuiRooms = new Map(); // roomId -> { api, pendingKey }

function mapQishuiTrack(t) {
  const artists = t?.base_info?.song_maker_team?.composers?.map((o) => o?.name).filter(Boolean) || [];
  // cover_url 可能是 { uri, urls: [...] } 对象，取字符串直链
  const cover = t?.display_info?.cover_url;
  let pic;
  if (typeof cover === 'string') pic = cover;
  else if (Array.isArray(cover?.urls) && cover.urls.length) pic = String(cover.urls[cover.urls.length - 1]);
  else if (cover?.uri) pic = String(cover.uri);
  return {
    id: String(t?.id || ''),
    name: String(t?.base_info?.name || '未知歌曲'),
    artist: artists.join(' / ') || '未知歌手',
    album: String(t?.related_info?.album_link?.name || ''),
    duration: Number(t?.base_info?.duration_ms) > 0 ? Number(t.base_info.duration_ms) : undefined,
    vip: undefined,
    pic,
    source: 'qishui',
  };
}

/**
 * 每房间一个 API 实例。会话存取直连房间凭据（每次读取都取最新值，
 * 避免闭包捕获旧请求的凭据）；令牌刷新/登录确认随包回调自动落库。
 */
function getQishuiContext(roomId) {
  let ctx = qishuiRooms.get(roomId);
  if (!ctx) {
    const key = roomId?.toUpperCase?.() || String(roomId || '').toUpperCase();
    let current = getRoomSourceCredential(key, 'qishui')?.session || null;
    let revision = 0;
    const sessions = {
      deviceId: getGlobalDeviceId(),
      get revision() { return revision; },
      get: () => current || getRoomSourceCredential(key, 'qishui')?.session || null,
      set(value) { current = value; revision += 1; persistQishuiSession(key, value); },
      clear() { current = null; revision += 1; persistQishuiSession(key, null); },
    };
    const api = createQishuiApi({ deviceId: getGlobalDeviceId(), sessions, fetch: globalThis.fetch });
    ctx = { api };
    qishuiRooms.set(roomId, ctx);
  }
  return ctx;
}

/** 以房主身份落库汽水会话（包内令牌刷新/扫码确认都会走到这里） */
function persistQishuiSession(roomId, session) {
  const room = getRoomInternal(roomId);
  const actor = room?.creatorId;
  if (!actor) return;
  setRoomSourceCredential(roomId, actor, 'qishui', session ? { session } : null);
}

/** 发起汽水扫码授权：返回官方二维码（抖音 / 汽水音乐 App 扫码） */
export async function startQishuiLogin(roomId) {
  const ctx = getQishuiContext(roomId);
  const key = (await ctx.api.request('login_qr_key', {})).data?.key;
  if (!key) throw new Error('获取汽水登录二维码失败');
  const created = (await ctx.api.request('login_qr_create', { key })).data;
  return { sessionKey: key, qrImage: created?.imageUrl || '' };
}

/**
 * 轮询汽水扫码状态。
 * confirmed 时包内部已完成 code → ticket 交换并通过 saveSession 落库。
 */
export async function pollQishuiLogin(roomId, sessionKey) {
  const ctx = getQishuiContext(roomId);
  const r = await ctx.api.request('login_qr_check', { key: sessionKey });
  const state = r?.data?.state;
  if (state === 'confirmed') return { status: 'confirmed' };
  if (state === 'expired') return { status: 'expired' };
  if (state === 'error') return { status: 'error', message: '手机端拒绝了授权' };
  if (state === 'scanned') return { status: 'scanned' };
  return { status: 'waiting' };
}

export async function searchQishui(roomId, keyword, limit = 30) {
  const ctx = getQishuiContext(roomId);
  const r = await ctx.api.request('search', { query: keyword, limit, offset: 0 });
  const items = Array.isArray(r?.data?.items) ? r.data.items : [];
  return items.map(mapQishuiTrack).filter((s) => s.id);
}

const QISHUI_QUALITY_MAP = { standard: 'standard', exhigh: 'high', lossless: 'lossless', hires: 'hires' };

export async function resolveQishuiPlayUrl(roomId, songId, quality = 'standard') {
  const ctx = getQishuiContext(roomId);
  const q = QISHUI_QUALITY_MAP[quality] || 'standard';
  const r = await ctx.api.request('audio', { id: songId, quality: q });
  return r?.data?.url || null;
}

export const searchQishuiWithHealth = withHealth('qishui', searchQishui);
export const resolveQishuiPlayUrlWithHealth = withHealth('qishui', resolveQishuiPlayUrl);
