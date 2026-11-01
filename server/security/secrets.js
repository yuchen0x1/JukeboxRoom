import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', 'data');
const SECRETS_FILE = '.secrets.json';
const MIN_SECRET_LENGTH = 32;
const SECRET_NAMES = ['CLIENT_ID_SECRET', 'AUTH_JWT_SECRET'];

const PLACEHOLDER_PATTERNS = [
  /(?:^|[-_ .])(?:placeholder|example|sample|dummy|default)(?:$|[-_ .])/i,
  /^(?:change[-_ ]?(?:me|this)|replace[-_ ]?(?:with|this)|your[-_ ]|please[-_ ]|enter[-_ ])/i,
];

function isObviouslyPlaceholder(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return true;
  if (/^(.)\1+$/.test(normalized)) return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function validateSecret(name, value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return { valid: false, reason: 'missing' };
  if (normalized.length < MIN_SECRET_LENGTH) return { valid: false, reason: 'too_short' };
  if (isObviouslyPlaceholder(normalized)) return { valid: false, reason: 'placeholder' };
  return { valid: true, value: normalized, name };
}

function secretsPath(dataDir) {
  return path.join(path.resolve(dataDir || DEFAULT_DATA_DIR), SECRETS_FILE);
}

function readPersistedSecrets(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    return {};
  }
}

function persistSecrets(filePath, secrets) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(secrets, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    try {
      fs.renameSync(tempPath, filePath);
    } catch (error) {
      if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error.code)) throw error;
      fs.rmSync(filePath, { force: true });
      fs.renameSync(tempPath, filePath);
    }
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // Windows does not expose Unix file modes; the file is still user-local there.
    }
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

/**
 * Resolve the secrets used by browser session IDs and auth JWTs.
 *
 * Production must provide both values explicitly. Other environments get a
 * stable random fallback persisted in the ignored data directory so restarts
 * do not invalidate local sessions or accounts.
 */
function resolveSecrets({ env = process.env, dataDir = env.OPENMUSIC_DATA_DIR, logger = null } = {}) {
  const isProduction = env.NODE_ENV === 'production';
  const filePath = secretsPath(dataDir);
  const persisted = isProduction ? {} : readPersistedSecrets(filePath);
  const resolved = {};
  const generated = { ...persisted };
  const invalid = [];

  for (const name of SECRET_NAMES) {
    const rawConfigured = typeof env[name] === 'string' ? env[name].trim() : '';
    const configured = validateSecret(name, rawConfigured);
    if (configured.valid) {
      resolved[name] = configured.value;
      continue;
    }

    // A deliberately supplied value must never be silently downgraded to a
    // fallback, even outside production. Blank values are the documented way
    // to request the persisted non-production fallback.
    if (rawConfigured || isProduction) {
      invalid.push(`${name} (${configured.reason})`);
      continue;
    }

    const stored = validateSecret(name, persisted[name]);
    if (stored.valid) {
      resolved[name] = stored.value;
      continue;
    }

    resolved[name] = randomBytes(32).toString('hex');
    generated[name] = resolved[name];
    logger?.warn?.(`[security] ${name} 未配置，已在 ${filePath} 持久化开发环境随机密钥`);
  }

  if (invalid.length > 0) {
    throw new Error(`生产环境必须配置有效的安全密钥：${invalid.join('、')}；每个值至少 ${MIN_SECRET_LENGTH} 个字符且不能使用占位符`);
  }

  const generatedNames = SECRET_NAMES.filter((name) => generated[name] !== persisted[name]);
  if (!isProduction && generatedNames.length > 0) {
    persistSecrets(filePath, generated);
  }

  return resolved;
}

export {
  DEFAULT_DATA_DIR,
  MIN_SECRET_LENGTH,
  SECRETS_FILE,
  isObviouslyPlaceholder,
  secretsPath,
  validateSecret,
  resolveSecrets,
};
