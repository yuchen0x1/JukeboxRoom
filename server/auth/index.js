
/**
 * Auth module — initial version.
 *
 * Features (Phase 1):
 * - Register user (username + password, bcrypt-hashed)
 * - Login (verify password, issue JWT)
 * - Session validation via JWT middleware
 * - Platform roles: admin / moderator / user
 * - Guest (anonymous) identity remains as fallback
 *
 * No database dependency: uses server/db/store.js (JSON files).
 * Upgrade path: replace store.js with PostgreSQL in Phase 2.
 */

import { randomBytes, scrypt, timingSafeEqual, createHmac } from 'crypto';
import { promisify } from 'util';
import { insert, find, findOne, update } from '../db/store.js';
import { recordAudit } from '../audit/index.js';

/* ------------------------------------------------------------------ */
/*  Bcrypt-like password hashing (Node 24 native)                     */
/*  Uses scrypt via crypto module — no extra dependency required      */
/* ------------------------------------------------------------------ */
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };
const scryptAsync = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const key = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `${salt}:${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
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
/*  JWT-like token (HMAC-SHA256 signed, no extra dependency)          */
/* ------------------------------------------------------------------ */
const JWT_SECRET = process.env.AUTH_JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : randomBytes(32).toString('hex'));
if (!JWT_SECRET) throw new Error('AUTH_JWT_SECRET is required in production');
if (process.env.NODE_ENV !== 'production' && !process.env.AUTH_JWT_SECRET) {
  console.warn('[auth] AUTH_JWT_SECRET 未配置，开发环境使用随机密钥；生产环境必须显式配置');
}
const configuredAccessTtl = Number.parseInt(process.env.AUTH_ACCESS_TTL || '86400000', 10);
const ACCESS_TTL_MS = Number.isFinite(configuredAccessTtl) && configuredAccessTtl > 0
  ? configuredAccessTtl
  : 86400000;

function signToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signature] = parts;
    const expected = createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
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
  if (typeof password !== 'string' || password.length < 6) {
    return { error: '密码至少需要 6 个字符' };
  }
  if (!VALID_ROLES.includes(role)) {
    return { error: '无效的角色' };
  }

  const existing = findOne('users', u => u.username === normalizedUsername);
  if (existing) {
    return { error: '用户名已存在' };
  }

  const passwordHash = await hashPassword(password);
  const user = insert('users', {
    username: normalizedUsername,
    passwordHash,
    role,
    status: 'active', // active | banned | disabled
    bannedAt: null,
  });
  return { id: user.id, username: user.username, role: user.role };
}

async function loginUser(username, password) {
  const normalizedUsername = String(username || '').trim();
  const user = findOne('users', u => u.username === normalizedUsername && u.status === 'active');
  if (!user) {
    return { error: '用户名或密码错误' };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: '用户名或密码错误' };
  }
  const accessToken = signToken({
    sub: user.id,
    username: user.username,
    role: user.role,
    exp: Date.now() + ACCESS_TTL_MS,
  });
  return { accessToken, user: { id: user.id, username: user.username, role: user.role } };
}

/** Express middleware: extract and validate JWT, attach req.user */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Allow anonymous
    req.user = null;
    return next();
  }
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'invalid_token', message: '令牌无效或已过期' });
  }
  const storedUser = payload.sub ? findOne('users', (user) => user.id === payload.sub) : null;
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

import { Router } from 'express';

const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  // Public registration must never accept a caller-supplied privilege role.
  const result = await registerUser(username, password, 'user');
  if (result.error) {
    return res.status(400).json(result);
  }
  recordAuditSafe({ actor: result.username, action: 'auth.register', resource: 'user', result: 'success', ip: req.ip });
  res.json({ user: result });
});

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const result = await loginUser(username, password);
  if (result.error) {
    recordAuditSafe({ actor: username, action: 'auth.login', resource: 'user', result: 'failure', ip: req.ip });
    return res.status(401).json(result);
  }
  recordAuditSafe({ actor: result.user.username, action: 'auth.login', resource: 'user', result: 'success', ip: req.ip });
  res.json(result);
});

authRouter.get('/me', authMiddleware, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'unauthorized', message: '未登录' });
  }
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

export { registerUser, loginUser, authMiddleware, requireRole, verifyToken, signToken, authRouter };
