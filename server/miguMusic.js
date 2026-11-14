import crypto from 'node:crypto';
import {
  getUrlV1,
  getUrlV2,
  searchSong,
} from 'migu-api-enhanced';

const MIGU_IMAGE_BASE = 'https://d.musicapp.migu.cn';
const MAX_SESSION_TOKEN_LENGTH = 16_384;

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('/')) return `${MIGU_IMAGE_BASE}${raw}`;
  return raw;
}

function normalizeSong(item) {
  const song = asRecord(item?.song) || asRecord(item);
  if (!song) return null;
  const contentId = String(song.contentId || '').trim();
  const copyrightId = String(song.copyrightId || '').trim();
  const name = String(song.songName || '').trim();
  if (!contentId || !copyrightId || !name) return null;
  const singers = Array.isArray(song.singerList) ? song.singerList : [];
  return {
    id: encodeMiguSongId(contentId, copyrightId),
    source: 'migu',
    name,
    artist: singers.map((singer) => String(singer?.name || '').trim()).filter(Boolean).join(' / ') || '未知歌手',
    album: String(song.album || '').trim() || undefined,
    pic: normalizeUrl(song.img1 || song.img2 || song.img3),
    duration: Number(song.duration) > 0 ? Number(song.duration) * 1000 : undefined,
    lrc: normalizeUrl(song.lrcUrl),
    vip: Boolean(song.restrictType) || Array.isArray(song.showTags) && song.showTags.some((tag) => /vip|pay/i.test(String(tag))),
  };
}

export function encodeMiguSongId(contentId, copyrightId) {
  const content = String(contentId || '').trim();
  const copyright = String(copyrightId || '').trim();
  if (!/^[\w-]{1,128}$/.test(content) || !/^[\w-]{1,128}$/.test(copyright)) {
    throw new Error('咪咕歌曲标识无效');
  }
  return `${content}|${copyright}`;
}

export function decodeMiguSongId(value) {
  const parts = String(value || '').trim().split('|');
  if (parts.length !== 2 || !/^[\w-]{1,128}$/.test(parts[0]) || !/^[\w-]{1,128}$/.test(parts[1])) {
    throw new Error('咪咕歌曲标识无效');
  }
  return { contentId: parts[0], copyrightId: parts[1] };
}

export async function searchMiguSongs(keyword, page = 1) {
  const result = await searchSong(String(keyword || '').trim(), Math.max(1, Math.min(10, Number(page) || 1)));
  const items = Array.isArray(result?.data?.items) ? result.data.items : [];
  return items.map(normalizeSong).filter(Boolean).slice(0, 30);
}

function toneForQuality(quality) {
  const value = String(quality || '').toLowerCase();
  if (value.includes('lossless') || value.includes('flac') || value.includes('sq')) return 'SQ';
  if (value.includes('high') || value.includes('exhigh') || value.includes('hq') || value === '320') return 'HQ';
  return 'PQ';
}

function extractUrl(result) {
  const data = asRecord(result?.data) || asRecord(result);
  const url = String(data?.url || '').trim();
  return url.startsWith('http') ? url : '';
}

function upstreamMessage(result) {
  const data = asRecord(result?.data) || asRecord(result);
  const dialog = asRecord(data?.dialogInfo);
  return String(dialog?.text || result?.info || '').trim();
}

export async function resolveMiguPlayUrl(id, quality = 'standard', session = null) {
  const { contentId, copyrightId } = decodeMiguSongId(id);
  const toneFlag = toneForQuality(quality);
  const pacmToken = String(session?.pacmToken || '').trim();
  const result = pacmToken
    ? await getUrlV2(contentId, copyrightId, toneFlag, pacmToken)
    : await getUrlV1(contentId, copyrightId, toneFlag);
  const url = extractUrl(result);
  if (url) return url;
  const message = upstreamMessage(result);
  if (/会员|白金|版权|付费/.test(message)) throw new Error(`咪咕音乐：${message}`);
  return null;
}

// ------------------------------------------------------------------
// 咪咕通行证登录（自实现，替代 migu-api-enhanced/login）。
//
// 实测结论（2026-11-14，真实接口验证）：
// 1. 短信验证码与「发码时的会话」绑定：发码与提交必须复用同一批 Cookie 和
//    同一个 fingerPrint，否则即使验证码正确也返回 4005「短信验证码错误或已失效」。
//    SDK 的 loginPhone 两次请求各自为政（无 Cookie、随机指纹），登录必败。
// 2. 登录成功返回 { status: 2000, result: { token } }，token（STnid…）是一次性的，
//    token-validate 只能调用一次，重复调用返回「系统繁忙」。
// 3. pacmtoken 由 token-validate 以响应头 pacmtoken 和 Set-Cookie 双通道下发；
//    SDK 的 ckfetch 只扫描请求自带 Cookie 的同名 key，永远取不到新下发的
//    pacmtoken，因此 getPacmToken 对全新登录必然返回空。
// 故此处用 node:crypto + fetch 自实现整个流程，并保留会话状态。
// ------------------------------------------------------------------

const PASSPORT_BASE = 'https://passport.migu.cn';
const PASSPORT_REFERER = `${PASSPORT_BASE}/login`;
const PASSPORT_SOURCE_ID = '220029';
const PASSPORT_SECURITY_CODE = '7619';
const PASSPORT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const PASSPORT_TIMEOUT_MS = 10_000;
// 短信会话（Cookie + 指纹）在「发送验证码」与「提交登录」之间保持的最长时间。
const SMS_SESSION_TTL_MS = 10 * 60_000;
const SMS_SESSION_MAX_ENTRIES = 100;
// 咪咕通行证统一响应格式：{ status, message, header: { resultcode }, result }
const PASSPORT_SUCCESS_STATUS = 2000;

export function passportFailed(result) {
  const record = asRecord(result);
  if (!record) return true;
  if (record.error) return true;
  const status = Number(record.status);
  if (Number.isFinite(status)) return status !== PASSPORT_SUCCESS_STATUS;
  const resultcode = String(record.header?.resultcode || '').trim();
  return resultcode !== '' && resultcode !== '104000';
}

function passportMessage(result) {
  return String(asRecord(result)?.message || '').trim();
}

// 兜底扫描：防止上游把令牌挪到其他 *token* 字段
function collectTokenCandidates(value, depth = 0, found = []) {
  if (depth > 3) return found;
  const record = asRecord(value);
  if (!record) return found;
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === 'string' && /token/i.test(key)) found.push(item);
    else collectTokenCandidates(item, depth + 1, found);
  }
  return found;
}

export function extractToken(result) {
  const record = asRecord(result);
  const candidates = [
    record?.result?.token,
    record?.token,
    record?.data?.token,
    record?.body?.token,
    record?.data?.data?.token,
    ...collectTokenCandidates(record),
  ];
  return candidates
    .map((value) => String(value || '').trim())
    .find((value) => value && value.length <= MAX_SESSION_TOKEN_LENGTH) || '';
}

function randomFingerprint() {
  return crypto.randomBytes(16).toString('hex');
}

/** 与 migu-api-enhanced 的 rsalib 一致：JWK 公钥 + PKCS#1 v1.5，输出 hex。 */
function rsaEncryptHex(modulusHex, exponentHex, text) {
  const key = crypto.createPublicKey({
    key: {
      kty: 'RSA',
      n: Buffer.from(modulusHex, 'hex').toString('base64url'),
      e: Buffer.from(exponentHex, 'hex').toString('base64url'),
    },
    format: 'jwk',
  });
  return crypto
    .publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(text, 'utf8'))
    .toString('hex');
}

class MiguPassportSession {
  #cookies = new Map();
  fingerprint = randomFingerprint();

  absorb(response) {
    for (const raw of response.headers.getSetCookie?.() || []) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.#cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  cookieHeader() {
    return [...this.#cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
  }

  /** 发起通行证请求并吸收 Set-Cookie；返回原始 Response 供调用方解析。 */
  async request(path, { method = 'GET', form, query } = {}) {
    const url = query ? `${PASSPORT_BASE}${path}?${query}` : `${PASSPORT_BASE}${path}`;
    const headers = {
      'User-Agent': PASSPORT_UA,
      Referer: PASSPORT_REFERER,
      Origin: PASSPORT_BASE,
      ...(this.#cookies.size ? { Cookie: this.cookieHeader() } : {}),
    };
    if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const response = await fetch(url, {
      method,
      headers,
      ...(form ? { body: form } : {}),
      signal: AbortSignal.timeout(PASSPORT_TIMEOUT_MS),
    });
    this.absorb(response);
    return response;
  }

  async requestJson(path, options = {}) {
    const response = await this.request(path, options);
    if (!response.ok) throw new Error(`咪咕通行证返回 HTTP ${response.status}`);
    // 通行证信封（status/message）由调用方按接口语义解释，这里只负责传输层。
    return response.json();
  }
}

const smsSessions = new Map(); // phone → { session, createdAt }

function rememberSmsSession(phone, session) {
  const now = Date.now();
  for (const [key, entry] of smsSessions) {
    if (now - entry.createdAt > SMS_SESSION_TTL_MS) smsSessions.delete(key);
  }
  while (smsSessions.size >= SMS_SESSION_MAX_ENTRIES) {
    smsSessions.delete(smsSessions.keys().next().value);
  }
  smsSessions.set(phone, { session, createdAt: now });
}

function peekSmsSession(phone) {
  const entry = smsSessions.get(phone);
  if (entry && Date.now() - entry.createdAt <= SMS_SESSION_TTL_MS) return entry.session;
  smsSessions.delete(phone);
  return null;
}

async function fetchPassportPublicKeys(session) {
  const data = await session.requestJson('/password/publickey', { method: 'POST' });
  const publicExponent = String(data?.result?.publicExponent || '').trim();
  const modulus = String(data?.result?.modulus || '').trim();
  if (!publicExponent || !modulus) throw new Error('咪咕通行证公钥获取失败');
  return { publicExponent, modulus };
}

export async function requestMiguSmsCode(phone) {
  const session = new MiguPassportSession();
  let result;
  try {
    // 预热登录页建立会话 Cookie；验证码校验依赖这批 Cookie 与指纹的绑定关系。
    await session.request('/login');
    const { publicExponent, modulus } = await fetchPassportPublicKeys(session);
    const query = new URLSearchParams({
      isAsync: 'true',
      msisdn: rsaEncryptHex(modulus, publicExponent, phone),
      captcha: '',
      sourceID: PASSPORT_SOURCE_ID,
      imgcodeType: '2',
      fingerPrint: session.fingerprint,
      fingerPrintDetail: session.fingerprint,
      _: Date.now().toString(),
    }).toString();
    result = await session.requestJson('/login/dynamicpassword', { query });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('咪咕')) throw err;
    throw new Error('咪咕验证码发送失败，请稍后重试');
  }
  if (passportFailed(result)) {
    throw new Error(`咪咕验证码发送失败：${passportMessage(result) || '请稍后重试'}`);
  }
  rememberSmsSession(phone, session);
  return { success: true };
}

/** 从 token-validate 响应提取 pacmtoken（响应头优先，Set-Cookie 兜底）。 */
export function extractPacmToken(response) {
  const header = String(response.headers.get('pacmtoken') || '').trim();
  if (header) return header;
  for (const raw of response.headers.getSetCookie?.() || []) {
    const [pair] = raw.split(';');
    if (/^pacmtoken\s*=/i.test(pair.trim())) {
      const value = pair.slice(pair.indexOf('=') + 1).trim().replace(/^"|"$/g, '');
      if (value) return value;
    }
  }
  return '';
}

async function exchangePacmToken(token) {
  const query = new URLSearchParams({
    token,
    type: '2',
    sourceId: PASSPORT_SOURCE_ID,
    activityId: 'MUSIC-WWW',
  }).toString();
  let response;
  try {
    response = await fetch(`https://c.musicapp.migu.cn/user/h5/token-validate/v3.0?${query}`, {
      headers: {
        'User-Agent': PASSPORT_UA,
        Origin: 'https://music.migu.cn',
        Pragma: 'no-cache',
        Referer: 'https://music.migu.cn/',
        Cookie: 'idmpauth=true@passport.migu.cn',
      },
      signal: AbortSignal.timeout(PASSPORT_TIMEOUT_MS),
    });
  } catch {
    throw new Error('咪咕登录会话获取失败，请稍后重试');
  }
  const pacmToken = extractPacmToken(response);
  if (!pacmToken || pacmToken.length > MAX_SESSION_TOKEN_LENGTH) {
    throw new Error('咪咕登录会话获取失败，请稍后重试');
  }
  return pacmToken;
}

export async function loginMiguByPhone(phone, smsCode) {
  // 复用发码时的会话（Cookie + 指纹）；验证码校验与该会话绑定。
  // 登录失败时保留会话，允许用户用同一验证码重试。
  const session = peekSmsSession(phone) || new MiguPassportSession();
  let result;
  try {
    const { publicExponent, modulus } = await fetchPassportPublicKeys(session);
    const form = new URLSearchParams({
      isAsync: 'true',
      msisdn: rsaEncryptHex(modulus, publicExponent, phone),
      dynamicPassword: rsaEncryptHex(modulus, publicExponent, smsCode),
      captcha: '',
      appType: '',
      securityCode: PASSPORT_SECURITY_CODE,
      sourceID: PASSPORT_SOURCE_ID,
      imgcodeType: '2',
      fingerPrint: session.fingerprint,
      fingerPrintDetail: session.fingerprint,
    }).toString();
    result = await session.requestJson('/authn/dynamicpassword', { method: 'POST', form });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('咪咕')) throw err;
    throw new Error('咪咕登录失败，无法连接咪咕服务，请稍后重试');
  }
  if (passportFailed(result)) {
    throw new Error(`咪咕登录失败：${passportMessage(result) || '请检查验证码是否正确或已过期'}`);
  }
  const token = extractToken(result);
  if (!token || token.length > MAX_SESSION_TOKEN_LENGTH) {
    throw new Error('咪咕登录未返回有效会话，请稍后重试');
  }
  // ST 令牌一次性，token-validate 只能调用一次；失败同样清除会话（旧验证码大概率已消费）。
  smsSessions.delete(phone);
  const pacmToken = await exchangePacmToken(token);
  return { token, pacmToken };
}
