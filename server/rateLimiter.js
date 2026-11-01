/**
 * Bounded in-memory sliding-window rate limiter.
 * This is process-local; use Redis for multi-instance deployments.
 */
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 60;
const DEFAULT_MAX_BUCKETS = 10_000;
const DEFAULT_CLEANUP_BATCH = 128;
const buckets = new Map();
const bucketOrder = new Map();

function assertPositiveNumber(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be a positive number`);
  return value;
}

function normalizeMaxBuckets(value) {
  const maxBuckets = Number(value);
  if (!Number.isInteger(maxBuckets) || maxBuckets < 1) throw new TypeError('maxBuckets must be a positive integer');
  return maxBuckets;
}

function evictExpiredBuckets(now, maxBuckets, batch) {
  let removed = 0;
  const limit = Math.max(1, Math.min(Number(batch) || DEFAULT_CLEANUP_BATCH, maxBuckets));
  const entries = bucketOrder.entries();
  while (removed < limit) {
    const next = entries.next();
    if (next.done) break;
    const [key, bucket] = next.value;
    if (bucket.expiresAt > now && buckets.size < maxBuckets) break;
    bucketOrder.delete(key);
    buckets.delete(key);
    removed += 1;
  }
  while (buckets.size > maxBuckets) {
    const oldest = bucketOrder.keys().next();
    if (oldest.done) break;
    bucketOrder.delete(oldest.value);
    buckets.delete(oldest.value);
    removed += 1;
  }
  return removed;
}

function touchBucket(key, bucket) {
  bucketOrder.delete(key);
  bucketOrder.set(key, bucket);
}

function compactTimestamps(bucket, cutoff) {
  while (bucket.cursor < bucket.timestamps.length && bucket.timestamps[bucket.cursor] <= cutoff) bucket.cursor += 1;
  if (bucket.cursor > 64 && bucket.cursor * 2 >= bucket.timestamps.length) {
    bucket.timestamps = bucket.timestamps.slice(bucket.cursor);
    bucket.cursor = 0;
  }
}

function slidingCount(key, windowMs = DEFAULT_WINDOW_MS, max = DEFAULT_MAX_REQUESTS, options = {}) {
  const safeWindowMs = assertPositiveNumber(Number(windowMs), 'windowMs');
  const safeMax = Number(max);
  if (!Number.isInteger(safeMax) || safeMax < 1) throw new TypeError('max must be a positive integer');
  const maxBuckets = normalizeMaxBuckets(options.maxBuckets ?? DEFAULT_MAX_BUCKETS);
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const bucketKey = String(key);
  let bucket = buckets.get(bucketKey);
  evictExpiredBuckets(now, maxBuckets, options.cleanupBatch);
  if (!bucket || bucket.expiresAt <= now) {
    bucket = { timestamps: [], cursor: 0, expiresAt: now + safeWindowMs };
    buckets.set(bucketKey, bucket);
  }
  compactTimestamps(bucket, now - safeWindowMs);
  const count = bucket.timestamps.length - bucket.cursor;
  if (count >= safeMax) {
    touchBucket(bucketKey, bucket);
    bucket.expiresAt = (bucket.timestamps[bucket.cursor] || now) + safeWindowMs;
    return { allowed: false, remaining: 0, reset: bucket.expiresAt };
  }
  bucket.timestamps.push(now);
  bucket.expiresAt = now + safeWindowMs;
  touchBucket(bucketKey, bucket);
  evictExpiredBuckets(now, maxBuckets, options.cleanupBatch);
  return {
    allowed: true,
    remaining: Math.max(0, safeMax - count - 1),
    reset: (bucket.timestamps[bucket.cursor] || now) + safeWindowMs,
  };
}

function clearRateLimiter() {
  buckets.clear();
  bucketOrder.clear();
}

function getRateLimiterStats() {
  return { buckets: buckets.size };
}

function rateLimiter(options = {}) {
  const {
    windowMs = DEFAULT_WINDOW_MS,
    max = DEFAULT_MAX_REQUESTS,
    keyFn = (req) => req.ip,
    name = 'default',
    maxBuckets = DEFAULT_MAX_BUCKETS,
  } = options;
  return function rateLimitMiddleware(req, res, next) {
    const result = slidingCount(`${name}:${keyFn(req)}`, windowMs, max, { maxBuckets });
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.reset / 1000)));
    if (!result.allowed) {
      return res.status(429).json({
        error: 'rate_limited',
        message: '请求过于频繁，请稍后再试',
        retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
      });
    }
    next();
  };
}

function createSocketRateLimiter(options = {}) {
  const {
    windowMs = DEFAULT_WINDOW_MS,
    max = DEFAULT_MAX_REQUESTS,
    keyFn = (socket, event) => `${socket.request?.socket?.remoteAddress || socket.handshake?.address || socket.id}:${event}`,
    maxBuckets = DEFAULT_MAX_BUCKETS,
  } = options;
  return function socketRateLimit(socket, event) {
    return slidingCount(`socket:${keyFn(socket, event)}`, windowMs, max, { maxBuckets }).allowed;
  };
}

/** Bounded per-key concurrent count. Call limiter.release(key) on disconnect. */
function createConcurrencyLimiter({ max = 100, keyFn = (key) => key, maxKeys = DEFAULT_MAX_BUCKETS } = {}) {
  const limit = Number(max);
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError('max must be a positive integer');
  const capacity = normalizeMaxBuckets(maxKeys);
  const counts = new Map();
  const order = new Map();
  function tryAcquire(rawKey) {
    const key = String(keyFn(rawKey));
    const count = counts.get(key) || 0;
    if (count >= limit) return false;
    if (!counts.has(key) && counts.size >= capacity) {
      const oldest = order.keys().next();
      if (!oldest.done) {
        order.delete(oldest.value);
        counts.delete(oldest.value);
      }
    }
    counts.set(key, count + 1);
    order.delete(key);
    order.set(key, true);
    return true;
  }
  tryAcquire.release = (rawKey) => {
    const key = String(keyFn(rawKey));
    const count = counts.get(key) || 0;
    if (count <= 1) {
      counts.delete(key);
      order.delete(key);
    } else counts.set(key, count - 1);
    return Math.max(0, count - 1);
  };
  tryAcquire.active = (rawKey) => counts.get(String(keyFn(rawKey))) || 0;
  tryAcquire.size = () => counts.size;
  tryAcquire.clear = () => { counts.clear(); order.clear(); };
  tryAcquire.limit = limit;
  return tryAcquire;
}

export {
  rateLimiter,
  createSocketRateLimiter,
  createConcurrencyLimiter,
  slidingCount,
  clearRateLimiter,
  getRateLimiterStats,
};
