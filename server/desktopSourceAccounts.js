import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { findOne, findAndUpdate, insertUnique, remove } from './db/store.js';

const COLLECTION = 'desktop_source_accounts';
const SOURCES = new Set(['netease', 'tencent', 'kugou', 'qishui', 'migu']);
const MAX_COOKIE_LENGTH = 16_384;
const MAX_SESSION_LENGTH = 65_536;

function assertSource(source) {
  if (!SOURCES.has(source)) throw new Error('不支持的音乐平台');
}

function getEncryptionKey() {
  const secret = String(process.env.DESKTOP_CREDENTIAL_SECRET || '').trim();
  if (secret.length < 32) throw new Error('桌面账号加密密钥未配置，请重启应用后重试');
  return createHash('sha256').update('jukeboxroom-desktop-account-v1:').update(secret).digest();
}

function cookieValue(cookie, name) {
  const prefix = `${name}=`;
  return String(cookie).split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length) || '';
}

function validateCookie(source, cookie) {
  if (source === 'qishui' || typeof cookie !== 'string' || !cookie.trim() || cookie.length > MAX_COOKIE_LENGTH || /[\r\n\u0000]/.test(cookie)) {
    throw new Error('账号凭据无效，请重新扫码登录');
  }
  const requiredCookie = source === 'netease' ? 'MUSIC_U'
    : source === 'tencent' ? 'uin'
      : 'token';
  if (!cookieValue(cookie, requiredCookie)) throw new Error('没有取得有效的账号会话，请重新登录');
}

function validateQishuiSession(session) {
  if (!session || typeof session !== 'object' || Array.isArray(session) || typeof session.ticket !== 'string' || !session.ticket) {
    throw new Error('汽水账号会话无效，请重新扫码登录');
  }
  const serialized = JSON.stringify(session);
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > MAX_SESSION_LENGTH) {
    throw new Error('汽水账号会话数据无效');
  }
}

function encryptPayload(value, version) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const plaintext = version === 1 ? String(value) : JSON.stringify(value);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    version,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

function decryptPayload(credential) {
  try {
    if (credential?.version !== 1 && credential?.version !== 2 && credential?.version !== 3) throw new Error('Unsupported credential version');
    const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(credential.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(credential.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(credential.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return credential.version === 1 ? plaintext : JSON.parse(plaintext);
  } catch {
    throw new Error('本机账号凭据无法解密，请重新登录');
  }
}

export function getDesktopSourceLogins() {
  const logins = { netease: false, tencent: false, kugou: false, qishui: false, migu: false };
  for (const source of SOURCES) {
    const record = findOne(COLLECTION, (entry) => entry.source === source);
    if (record?.credential?.version !== 1 && record?.credential?.version !== 2 && record?.credential?.version !== 3) continue;
    // 与解密语义对齐：密钥变更/密文损坏时视为未登录，避免"显示已登录但解析必失败"
    try {
      const value = decryptPayload(record.credential);
      logins[source] = source === 'qishui'
        ? Boolean(value && typeof value === 'object' && value.ticket)
        : source === 'migu'
          ? Boolean(value && typeof value === 'object' && value.pacmToken)
          : Boolean(typeof value === 'string' && value.trim());
    } catch {
      logins[source] = false;
    }
  }
  return logins;
}

export function getDesktopSourceCookie(source) {
  assertSource(source);
  if (source === 'qishui' || source === 'migu') throw new Error(`${source === 'migu' ? '咪咕' : '汽水'}账号使用独立会话存储`);
  const record = findOne(COLLECTION, (entry) => entry.source === source);
  return record?.credential?.version === 1 ? decryptPayload(record.credential) : '';
}

/**
 * 获取桌面播放链路使用的 Cookie。
 * 汽水音乐不使用 Cookie，而是由 sourceResolvers 读取独立 session；
 * 返回空字符串让调用方继续进入汽水专用解析分支。
 */
export function getDesktopSourceCookieForPlayback(source) {
  assertSource(source);
  return source === 'qishui' || source === 'migu' ? '' : getDesktopSourceCookie(source);
}

export function saveDesktopSourceCookie(source, cookie) {
  assertSource(source);
  validateCookie(source, cookie);
  return saveEncryptedCredential(source, encryptPayload(cookie.trim(), 1));
}

export function getDesktopSourceSession() {
  const record = findOne(COLLECTION, (entry) => entry.source === 'qishui');
  if (!record) return null;
  if (record.credential?.version !== 2) throw new Error('汽水账号会话无效，请重新扫码登录');
  return decryptPayload(record.credential);
}

export function getDesktopMiguSession() {
  const record = findOne(COLLECTION, (entry) => entry.source === 'migu');
  if (!record) return null;
  if (record.credential?.version !== 3) throw new Error('咪咕账号会话无效，请重新登录');
  const session = decryptPayload(record.credential);
  if (!session || typeof session !== 'object' || typeof session.pacmToken !== 'string' || !session.pacmToken) {
    throw new Error('咪咕账号会话无效，请重新登录');
  }
  return session;
}

export function saveDesktopMiguSession(session) {
  if (!session || typeof session !== 'object' || Array.isArray(session)
    || typeof session.token !== 'string' || !session.token
    || typeof session.pacmToken !== 'string' || !session.pacmToken) {
    throw new Error('咪咕账号会话无效，请重新登录');
  }
  const serialized = JSON.stringify(session);
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > MAX_SESSION_LENGTH) {
    throw new Error('咪咕账号会话数据无效');
  }
  return saveEncryptedCredential('migu', encryptPayload(session, 3));
}

export function saveDesktopSourceSession(session) {
  validateQishuiSession(session);
  return saveEncryptedCredential('qishui', encryptPayload(session, 2));
}

function saveEncryptedCredential(source, credential) {
  validityCache.delete(source);
  const matchesSource = (record) => record.source === source;
  const update = findAndUpdate(COLLECTION, matchesSource, { credential });
  if (update.matched) return true;
  const inserted = insertUnique(COLLECTION, { source, credential }, matchesSource);
  if (inserted.inserted) return true;
  return findAndUpdate(COLLECTION, matchesSource, { credential }).matched > 0;
}

export function removeDesktopSourceAccount(source) {
  assertSource(source);
  validityCache.delete(source);
  return remove(COLLECTION, (record) => record.source === source) > 0;
}

// ── 登录有效期探测（网易云）───────────────────────────────
// 目标：cookie 真正过期后状态显示"未登录"，用户重新扫码绑定即可。
// 只有能给出确定性结论时才翻转状态：网络异常/接口异常一律维持"已登录"，
// 避免网络抖动把用户误报成未登录。其余平台暂无可靠的轻量校验接口，
// 维持"凭据存在即已登录"，后续可按同样模式逐个接入。
const SOURCE_VALIDITY_TTL_MS = 10 * 60 * 1000;
const SOURCE_VALIDITY_RETRY_MS = 60 * 1000;
const validityCache = new Map();

async function probeNeteaseCookieValid(cookie) {
  try {
    const res = await fetch('https://music.163.com/api/nuser/account/get', {
      headers: {
        Cookie: cookie,
        Referer: 'https://music.163.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) JukeboxRoom Desktop',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') return null;
    if (data.code === 200 && data.profile) return true;
    if (data.code === 301) return false;
    return null;
  } catch {
    return null;
  }
}

export async function getDesktopSourceLoginsWithValidity() {
  const logins = getDesktopSourceLogins();
  for (const source of Object.keys(logins)) {
    if (!logins[source] || source !== 'netease') continue;
    const cached = validityCache.get(source);
    if (cached && cached.expiresAt > Date.now()) {
      logins[source] = cached.valid;
      continue;
    }
    const verdict = await probeNeteaseCookieValid(getDesktopSourceCookie(source));
    if (verdict === null) {
      // 判定不了：短暂缓存"已登录"并尽快重试，而不是永久相信
      validityCache.set(source, { valid: true, expiresAt: Date.now() + SOURCE_VALIDITY_RETRY_MS });
      continue;
    }
    validityCache.set(source, { valid: verdict, expiresAt: Date.now() + SOURCE_VALIDITY_TTL_MS });
    logins[source] = verdict;
  }
  return logins;
}

export function isTrustedDesktopRequest(req, port) {
  const expectedHost = `127.0.0.1:${port}`;
  if (String(req.headers?.host || '').toLowerCase() !== expectedHost) return false;
  const remoteAddress = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  if (remoteAddress !== '127.0.0.1' && remoteAddress !== '::1') return false;
  const expectedOrigin = `http://${expectedHost}`;
  if (req.headers?.origin && req.headers.origin !== expectedOrigin) return false;
  // 现代浏览器跨站请求必带 sec-fetch-site；缺失本身就是异常（旧浏览器 <Chrome 76
  // 或 <img>/<form> 级简单请求）。缺失即拒绝，避免跨站 GET 触发桌面账号接口
  const fetchSite = req.headers?.['sec-fetch-site'];
  if (!fetchSite) return false;
  return fetchSite === 'same-origin' || fetchSite === 'none';
}
