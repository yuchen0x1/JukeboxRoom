/**
 * 本机音乐账号凭据（网易云 / QQ 音乐 / 酷狗 / 汽水音乐）。
 *
 * 与「房间凭据」的区别：这里存的是**本机长期账号**，不随房间销毁、服务端重启而丢失。
 * 登录一次后，刷新页面 / 重启服务 / 新建房间都能继续使用，无需重新扫码。
 *
 * 安全：AES-256-GCM 加密后落盘 server/data/music_source_accounts.json，
 * 密钥由本机持久化的安全密钥派生（不可跨机器解密）。
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { all, findOne, findAndUpdate, insertUnique, remove } from './db/store.js';
import { resolveSecrets } from './security/secrets.js';

const COLLECTION = 'music_source_accounts';
const SOURCES = new Set(['netease', 'tencent', 'kugou', 'qishui']);
const MAX_COOKIE_LENGTH = 16_384;
const MAX_SESSION_LENGTH = 65_536;

let cachedKey = null;
/** 进程内缓存：房间广播每帧都会问“登录了吗”，不能每次都读盘 */
let loginCache = null;
const credentialCache = new Map();

function assertSource(source) {
  if (!SOURCES.has(source)) throw new Error('不支持的音乐平台');
}

function resolveBaseSecret() {
  const configured = String(process.env.SOURCE_CREDENTIAL_SECRET || process.env.DESKTOP_CREDENTIAL_SECRET || '').trim();
  if (configured.length >= 32) return configured;
  // 回退到本机持久化的会话密钥：开发环境由 security/secrets.js 生成并落盘，重启后不变
  try {
    return String(resolveSecrets()?.CLIENT_ID_SECRET || '');
  } catch {
    return '';
  }
}

function getEncryptionKey() {
  if (cachedKey) return cachedKey;
  const secret = resolveBaseSecret();
  if (secret.length < 32) throw new Error('音乐账号加密密钥未初始化，请重启应用后重试');
  cachedKey = createHash('sha256').update('jukeboxroom-source-account-v1:').update(secret).digest();
  return cachedKey;
}

function cookieValue(cookie, name) {
  const prefix = `${name}=`;
  return String(cookie)
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) || '';
}

function validateCookie(source, cookie) {
  if (source === 'qishui' || typeof cookie !== 'string' || !cookie.trim()
    || cookie.length > MAX_COOKIE_LENGTH || /[\r\n\u0000]/.test(cookie)) {
    throw new Error('账号凭据无效，请重新扫码登录');
  }
  const requiredCookie = source === 'netease' ? 'MUSIC_U'
    : source === 'tencent' ? 'uin'
      : 'token';
  if (!cookieValue(cookie, requiredCookie)) throw new Error('没有取得有效的账号会话，请重新登录');
}

function validateSession(session) {
  if (!session || typeof session !== 'object' || Array.isArray(session)
    || typeof session.ticket !== 'string' || !session.ticket) {
    throw new Error('汽水账号会话无效，请重新扫码登录');
  }
  if (Buffer.byteLength(JSON.stringify(session), 'utf8') > MAX_SESSION_LENGTH) {
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
  if (credential?.version !== 1 && credential?.version !== 2) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(credential.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(credential.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(credential.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return credential.version === 1 ? plaintext : JSON.parse(plaintext);
  } catch {
    // 密钥变更 / 数据损坏：视为未登录，让用户重新扫码而不是直接抛错中断启动
    return null;
  }
}

function saveEncryptedCredential(source, credential, boundBy = '') {
  const matchesSource = (record) => record.source === source;
  const payload = { credential, boundBy: String(boundBy || '') };
  const update = findAndUpdate(COLLECTION, matchesSource, payload);
  if (!update.matched) {
    const inserted = insertUnique(COLLECTION, { source, ...payload }, matchesSource);
    if (!inserted.inserted) findAndUpdate(COLLECTION, matchesSource, payload);
  }
  loginCache = null;
  credentialCache.delete(source);
  return true;
}

function loadLogins() {
  if (loginCache) return loginCache;
  const logins = { netease: false, tencent: false, kugou: false, qishui: false };
  try {
    for (const record of all(COLLECTION)) {
      if (!SOURCES.has(record?.source) || !record.credential?.version) continue;
      // 与 getSourceAccountCredential 对齐：解密失败（密钥变更/数据损坏）视为未登录，
      // 否则会显示"已登录"但解析时拿不到 Cookie
      const value = decryptPayload(record.credential);
      const ok = record.source === 'qishui'
        ? Boolean(value && typeof value === 'object' && value.ticket)
        : Boolean(typeof value === 'string' && value.trim());
      if (ok) logins[record.source] = true;
    }
  } catch {
    // 存储损坏时按未登录处理，不阻断房间广播
  }
  loginCache = logins;
  return logins;
}

/** 各平台是否已有本机长期账号 */
export function getSourceAccountLogins() {
  return { ...loadLogins() };
}

export function hasSourceAccount(source) {
  assertSource(source);
  return Boolean(loadLogins()[source]);
}

/** 读取本机账号凭据；与房间凭据同构：{ cookie } 或 { session } */
export function getSourceAccountCredential(source) {
  const key = String(source || '').trim().toLowerCase();
  if (!SOURCES.has(key)) return null;
  if (credentialCache.has(key)) return credentialCache.get(key);
  const record = findOne(COLLECTION, (entry) => entry.source === key);
  const credential = record?.credential?.version ? record.credential : null;
  let value = null;
  if (credential) {
    const decrypted = decryptPayload(credential);
    if (key === 'qishui') {
      value = decrypted && typeof decrypted === 'object' ? { session: decrypted } : null;
    } else {
      const cookie = typeof decrypted === 'string' ? decrypted.trim() : '';
      value = cookie ? { cookie } : null;
    }
  }
  credentialCache.set(key, value);
  return value;
}

export function saveSourceAccountCookie(source, cookie, boundBy = '') {
  assertSource(source);
  if (source === 'qishui') throw new Error('汽水账号使用独立会话存储');
  validateCookie(source, cookie);
  return saveEncryptedCredential(source, encryptPayload(cookie.trim(), 1), boundBy);
}

export function saveSourceAccountSession(session, boundBy = '') {
  validateSession(session);
  return saveEncryptedCredential('qishui', encryptPayload(session, 2), boundBy);
}

/** 保存任意平台凭据（内部统一入口：cookie 走 v1，汽水 session 走 v2） */
export function saveSourceAccountCredential(source, credential, boundBy = '') {
  const key = String(source || '').trim().toLowerCase();
  assertSource(key);
  if (key === 'qishui') {
    const session = credential?.session;
    if (!session) throw new Error('汽水账号会话无效，请重新扫码登录');
    return saveSourceAccountSession(session, boundBy);
  }
  return saveSourceAccountCookie(key, credential?.cookie, boundBy);
}

/**
 * 移除本机账号。绑定者校验：只有登录该账号的用户（或尚未记录绑定者的历史数据）能删除，
 * 避免任意房间房主清掉共享的本机账号。返回 false 表示绑定者不匹配、未删除。
 */
export function removeSourceAccount(source, actorId = '') {
  const key = String(source || '').trim().toLowerCase();
  if (!SOURCES.has(key)) return false;
  const record = findOne(COLLECTION, (entry) => entry.source === key);
  if (record && record.boundBy && actorId && record.boundBy !== actorId) return false;
  const removed = remove(COLLECTION, (entry) => entry.source === key) > 0;
  loginCache = null;
  credentialCache.delete(key);
  return removed;
}

/** 仅测试使用：清空缓存，便于切换环境变量 / 重载存储后重新读取 */
export function resetSourceAccountKeyCache() {
  cachedKey = null;
  loginCache = null;
  credentialCache.clear();
}
