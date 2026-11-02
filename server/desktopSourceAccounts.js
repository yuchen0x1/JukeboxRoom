import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { findOne, findAndUpdate, insertUnique, remove } from './db/store.js';

const COLLECTION = 'desktop_source_accounts';
const SOURCES = new Set(['netease', 'tencent', 'kugou', 'qishui']);
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
    if (credential?.version !== 1 && credential?.version !== 2) throw new Error('Unsupported credential version');
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
  const logins = { netease: false, tencent: false, kugou: false, qishui: false };
  for (const source of SOURCES) {
    logins[source] = Boolean(findOne(COLLECTION, (record) => record.source === source
      && (record.credential?.version === 1 || record.credential?.version === 2)));
  }
  return logins;
}

export function getDesktopSourceCookie(source) {
  assertSource(source);
  if (source === 'qishui') throw new Error('汽水账号使用独立会话存储');
  const record = findOne(COLLECTION, (entry) => entry.source === source);
  return record?.credential?.version === 1 ? decryptPayload(record.credential) : '';
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

export function saveDesktopSourceSession(session) {
  validateQishuiSession(session);
  return saveEncryptedCredential('qishui', encryptPayload(session, 2));
}

function saveEncryptedCredential(source, credential) {
  const matchesSource = (record) => record.source === source;
  const update = findAndUpdate(COLLECTION, matchesSource, { credential });
  if (update.matched) return true;
  const inserted = insertUnique(COLLECTION, { source, credential }, matchesSource);
  if (inserted.inserted) return true;
  return findAndUpdate(COLLECTION, matchesSource, { credential }).matched > 0;
}

export function removeDesktopSourceAccount(source) {
  assertSource(source);
  return remove(COLLECTION, (record) => record.source === source) > 0;
}

export function isTrustedDesktopRequest(req, port) {
  const expectedHost = `127.0.0.1:${port}`;
  if (String(req.headers?.host || '').toLowerCase() !== expectedHost) return false;
  const remoteAddress = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  if (remoteAddress !== '127.0.0.1' && remoteAddress !== '::1') return false;
  const expectedOrigin = `http://${expectedHost}`;
  if (req.headers?.origin && req.headers.origin !== expectedOrigin) return false;
  const fetchSite = req.headers?.['sec-fetch-site'];
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  return true;
}
