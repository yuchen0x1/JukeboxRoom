/**
 * Auth module — JSON-backed account and token authentication.
 *
 * Access tokens are HMAC-SHA256 JWTs. Refresh tokens are opaque, one-time
 * credentials whose SHA-256 hashes are persisted in the JSON store. The
 * refresh-session state is never returned to clients or logged.
 */

import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { resolveSecrets } from '../security/secrets.js';
import { insertUnique, findOne, findAndUpdate } from '../db/store.js';
import { recordAudit } from '../audit/index.js';
import { rateLimiter } from '../rateLimiter.js';
import { Router } from 'express';

/* ------------------------------------------------------------------ */
/*  Password hashing                                                   */
/* ------------------------------------------------------------------ */
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
const scryptAsync = promisify(scrypt);

function validatePassword(password, { required = true } = {}) {
  if (typeof password !== 'string') return required ? '密码必须是字符串' : null;
  if (!password && !required) return null;
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `密码长度需在 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 个字符之间`;
  }
  return null;
}

async function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const key = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `${salt}:${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex || !/^[a-f0-9]+$/i.test(keyHex)) return false;

  try {
    const key = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
    const storedKey = Buffer.from(keyHex, 'hex');
    return storedKey.length === key.length && timingSafeEqual(key, storedKey);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Access JWTs                                                        */
/* ------------------------------------------------------------------ */
const { AUTH_JWT_SECRET: JWT_SECRET } = resolveSecrets({ logger: console });
const configuredAccessTtl = Number.parseInt(process.env.AUTH_ACCESS_TTL || '86400000', 10);
const ACCESS_TTL_MS = Number.isFinite(configuredAccessTtl) && configuredAccessTtl > 0
  ? configuredAccessTtl
  : 86400000;
const configuredRefreshTtl = Number.parseInt(process.env.AUTH_REFRESH_TTL || `${30 * 24 * 60 * 60 * 1000}`, 10);
export const REFRESH_TTL_MS = Number.isFinite(configuredRefreshTtl) && configuredRefreshTtl > 0
  ? configuredRefreshTtl
  : 30 * 24 * 60 * 60 * 1000;

function safeEqualText(actual, expected) {
  const actualBuffer = Buffer.from(String(actual));
  const expectedBuffer = Buffer.from(String(expected));
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function signToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

function decodeJsonPart(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function verifyToken(token) {
  try {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) return null;
    const [headerB64, payloadB64, signature] = parts;
    const header = decodeJsonPart(headerB64);
    if (!header || typeof header !== 'object' || Array.isArray(header)
      || header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const expected = createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    if (!safeEqualText(signature, expected)) return null;
    const payload = decodeJsonPart(payloadB64);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    // Existing tokens use milliseconds (not JWT's conventional seconds).
    if (!Number.isFinite(payload.exp) || payload.exp <= 0 || Date.now() >= payload.exp) return null;
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}

function accessTokenForUser(user) {
  return signToken({
    sub: user.id,
    username: user.username,
    role: user.role,
    exp: Date.now() + ACCESS_TTL_MS,
  });
}

/* ------------------------------------------------------------------ */
/*  Hashed, rotating refresh sessions                                 */
/* ------------------------------------------------------------------ */
const REFRESH_COLLECTION = 'auth_refresh_sessions';

function hashRefreshToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function createRefreshSession(userId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomBytes(48).toString('base64url');
    const result = insertUnique(
      REFRESH_COLLECTION,
      {
        userId,
        tokenHash: hashRefreshToken(token),
        expiresAt: Date.now() + REFRESH_TTL_MS,
        revokedAt: null,
      },
      (session) => session.tokenHash === hashRefreshToken(token),
    );
    if (result.inserted) return { token, expiresAt: result.record.expiresAt };
  }
  throw new Error('无法创建刷新会话');
}

function rotateRefreshSession(refreshToken) {
  if (typeof refreshToken !== 'string' || refreshToken.length < 32 || refreshToken.length > 256) return null;
  const tokenHash = hashRefreshToken(refreshToken);
  const now = Date.now();
  const result = findAndUpdate(
    REFRESH_COLLECTION,
    (session) => session.tokenHash === tokenHash
      && !session.revokedAt
      && Number.isFinite(Number(session.expiresAt))
      && Number(session.expiresAt) > now,
    { revokedAt: now },
  );
  const session = result.records[0];
  if (!session) return null;
  const user = findOne('users', (entry) => entry.id === session.userId && entry.status === 'active');
  if (!user) return null;
  return { user, ...createRefreshSession(user.id) };
}

function revokeRefreshSession(refreshToken) {
  if (typeof refreshToken !== 'string' || refreshToken.length < 32 || refreshToken.length > 256) return false;
  const tokenHash = hashRefreshToken(refreshToken);
  const result = findAndUpdate(
    REFRESH_COLLECTION,
    (session) => session.tokenHash === tokenHash && !session.revokedAt,
    { revokedAt: Date.now() },
  );
  return result.updated > 0;
}

function revokeRefreshSessionsForUser(userId) {
  if (!userId) return 0;
  return findAndUpdate(
    REFRESH_COLLECTION,
    (session) => session.userId === userId && !session.revokedAt,
    { revokedAt: Date.now() },
    { multi: true },
  ).updated;
}

/* ------------------------------------------------------------------ */
/*  User management                                                    */
/* ------------------------------------------------------------------ */
const VALID_ROLES = ['super_admin', 'admin', 'moderator', 'user'];

async function registerUser(username, password, role = 'user') {
  const normalizedUsername = String(username || '').trim();
  if (normalizedUsername.length < 2 || normalizedUsername.length > 32) {
    return { error: '用户名长度需在 2-32 个字符之间' };
  }
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  if (!VALID_ROLES.includes(role)) {
    return { error: '无效的角色' };
  }

  const passwordHash = await hashPassword(password);
  const result = insertUnique(
    'users',
    { username: normalizedUsername, passwordHash, role, status: 'active', bannedAt: null },
    (user) => user.username === normalizedUsername,
  );
  if (!result.inserted) return { error: '用户名已存在' };
  const user = result.record;
  return { id: user.id, username: user.username, role: user.role };
}

async function loginUser(username, password) {
  const normalizedUsername = String(username || '').trim();
  const user = findOne('users', (u) => u.username === normalizedUsername && u.status === 'active');
  // Existing accounts may have been created under the former six-character policy;
  // keep login compatible while rejecting malformed or unbounded input.
  if (!user || typeof password !== 'string' || password.length > PASSWORD_MAX_LENGTH) {
    return { error: '用户名或密码错误' };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { error: '用户名或密码错误' };
  const refresh = createRefreshSession(user.id);
  return {
    accessToken: accessTokenForUser(user),
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
    user: { id: user.id, username: user.username, role: user.role },
  };
}

/** Express middleware: extract and validate JWT, attach req.user */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    req.user = null;
    return next();
  }
  if (typeof authHeader !== 'string' || !/^Bearer\s+\S+$/.test(authHeader)) {
    return res.status(401).json({ error: 'invalid_token', message: '令牌无效或已过期' });
  }
  const payload = verifyToken(authHeader.slice(7).trim());
  if (!payload) {
    return res.status(401).json({ error: 'invalid_token', message: '令牌无效或已过期' });
  }
  const storedUser = findOne('users', (user) => user.id === payload.sub);
  if (!storedUser || storedUser.status !== 'active') {
    return res.status(401).json({ error: 'invalid_token', message: '令牌无效或账号已停用' });
  }
  req.user = { id: storedUser.id, username: storedUser.username, role: storedUser.role };
  next();
}

/** Middleware: require specific role(s) */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', message: '权限不足' });
    }
    next();
  };
}

/* ------------------------------------------------------------------ */
/*  HTTP routes (mounted under /api/auth)                             */
/* ------------------------------------------------------------------ */
const authRouter = Router();
const authAttemptLimiter = rateLimiter({
  name: 'auth',
  windowMs: 60_000,
  max: 20,
  keyFn: (req) => `${req.ip}:${String(req.body?.username || '').trim().toLowerCase().slice(0, 64)}`,
});

authRouter.post('/register', authAttemptLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const result = await registerUser(username, password, 'user');
  if (result.error) return res.status(400).json(result);
  recordAuditSafe({ actor: result.username, action: 'auth.register', resource: 'user', result: 'success', ip: req.ip });
  res.json({ user: result });
});

authRouter.post('/login', authAttemptLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const result = await loginUser(username, password);
  if (result.error) {
    recordAuditSafe({ actor: username, action: 'auth.login', resource: 'user', result: 'failure', ip: req.ip });
    return res.status(401).json(result);
  }
  recordAuditSafe({ actor: result.user.username, action: 'auth.login', resource: 'user', result: 'success', ip: req.ip });
  res.json(result);
});

authRouter.post('/refresh', (req, res) => {
  const refreshToken = req.body?.refreshToken;
  const rotated = rotateRefreshSession(refreshToken);
  if (!rotated) return res.status(401).json({ error: 'invalid_refresh_token', message: '刷新令牌无效或已过期' });
  res.json({
    accessToken: accessTokenForUser(rotated.user),
    refreshToken: rotated.token,
    refreshExpiresAt: rotated.expiresAt,
    user: { id: rotated.user.id, username: rotated.user.username, role: rotated.user.role },
  });
});

authRouter.post('/logout', (req, res) => {
  revokeRefreshSession(req.body?.refreshToken);
  res.json({ success: true });
});

authRouter.get('/me', authMiddleware, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized', message: '未登录' });
  res.json({ user: req.user });
});

/** 审计失败不能阻断注册/登录主流程 */
function recordAuditSafe(payload) {
  try {
    recordAudit(payload);
  } catch {
    // ignore audit write errors
  }
}

export {
  registerUser,
  loginUser,
  authMiddleware,
  requireRole,
  verifyToken,
  signToken,
  rotateRefreshSession,
  revokeRefreshSession,
  revokeRefreshSessionsForUser,
  authRouter,
};
