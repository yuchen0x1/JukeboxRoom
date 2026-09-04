import { resolveValidatedHttpUrl, safeFetch, shouldAllowPrivateConfiguredUpstream } from './outboundUrl.js';
import { canRequestProvider, recordProviderFailure, recordProviderSuccess } from './mediaHealth.js';

const METING_API_URL = (process.env.METING_API_URL || '').replace(/\/$/, '');
const ALLOW_PRIVATE_METING = shouldAllowPrivateConfiguredUpstream();

let metingHost = '';
try {
  metingHost = METING_API_URL ? new URL(METING_API_URL).hostname : '';
} catch {
  metingHost = '';
}

function isMetingUrl(url) {
  if (!metingHost) return false;
  try {
    return new URL(url).hostname === metingHost;
  } catch {
    return false;
  }
}

function providerFromUrl(url) {
  try {
    const parsed = new URL(url);
    const source = parsed.searchParams.get('server');
    if (source === 'netease' || source === 'tencent' || source === 'kugou') return source;
    if (parsed.hostname === 'cyapi.top' || parsed.hostname.endsWith('.cyapi.top')) return 'kugou';
  } catch {
    // URL validation below reports malformed targets.
  }
  return null;
}

function createFetchMeting({ requestFactory, allowPrivateForTest = false } = {}) {
  async function validateTarget(url) {
    const allowPrivate = (ALLOW_PRIVATE_METING && isMetingUrl(url)) || allowPrivateForTest;
    const validated = await resolveValidatedHttpUrl(url, { allowPrivate });
    if (!validated) throw new Error('拒绝访问不安全的外部 URL');
    return allowPrivate;
  }

  async function requestOnce(url, options = {}, timeoutMs = 10000, allowPrivate = false) {
    return safeFetch(url, { ...options, allowPrivate, requestFactory }, timeoutMs);
  }

  return async function fetchMetingImpl(url, options = {}, timeoutMs = 10000) {
    const method = String(options?.method || 'GET').toUpperCase();
    const allowPrivate = await validateTarget(url);
    const key = cacheKey(url, options);
    const provider = providerFromUrl(url);

    if (method === 'GET') {
      const hit = readCache(key);
      if (hit) return cachedResponse(hit);
    }

    if (!canRequestProvider(provider)) throw new Error(`音乐源 ${provider} 暂时不可用，请稍后重试`);

    let response;
    try {
      response = await requestOnce(url, options, timeoutMs, allowPrivate);
      if (provider) {
        if (response.status >= 400) recordProviderFailure(provider, response.status);
        else recordProviderSuccess(provider, response.status);
      }
    } catch (error) {
      recordProviderFailure(provider);
      throw error;
    }

    if (method === 'GET' && response.ok && options?.cache !== false) {
      try {
        const body = Buffer.from(await response.arrayBuffer());
        const raw = response.rawHeaders || {};
        const headers = {};
        for (const [name, value] of Object.entries(raw)) {
          if (typeof value === 'string') headers[name] = value;
        }
        writeCache(key, response.status, headers, body);
      } catch {
        // 缓存失败不影响主流程
      }
    }

    return response;
  };
}

/**
 * 本地缓存层：对 Meting-API 的成功 GET 响应做短 TTL 内存缓存，
 * 避免歌单导入/搜索重复命中上游，降低自托管实例压力。
 */
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 200;
const metingCache = new Map(); // key -> { expiresAt, status, headers, body }

function cacheKey(url, options) {
  const method = String(options?.method || 'GET').toUpperCase();
  const cacheMode = options?.cache === false ? 'no-cache' : String(options?.cache || 'auto');
  return `${method} ${url} [${cacheMode}]`;
}

function readCache(key) {
  const entry = metingCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    metingCache.delete(key);
    return null;
  }
  return entry;
}

function writeCache(key, status, headers, body) {
  if (metingCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = metingCache.keys().next().value;
    metingCache.delete(oldestKey);
  }
  metingCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, status, headers, body });
}

function cachedResponse(entry) {
  return {
    ok: entry.status >= 200 && entry.status < 300,
    status: entry.status,
    headers: {
      get: (name) => entry.headers[String(name).toLowerCase()] ?? null,
    },
    text: async () => Buffer.from(entry.body).toString('utf8'),
    json: async () => JSON.parse(Buffer.from(entry.body).toString('utf8')),
    arrayBuffer: async () => {
      const buf = Buffer.from(entry.body);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
  };
}

export const fetchMeting = createFetchMeting();

export function createFetchMetingForTest(options = {}) {
  return createFetchMeting(options);
}

export function formatMetingFetchError(err) {
  const cause = err?.cause;
  if (cause?.code) return `${err?.message || 'fetch failed'} (${cause.code})`;
  if (cause?.message) return `${err?.message || 'fetch failed'} (${cause.message})`;
  return err?.message || 'fetch failed';
}
