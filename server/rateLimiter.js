import crypto from 'crypto';

/**
 * Token bucket rate limiter (in-memory fallback, Redis upgrade ready).
 *
 * Ported from runtimeObservability's requestContext but as reusable middleware.
 * Tracks sliding-window request counts per client key.
 */

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 60;

const buckets = new Map();

/** Simple LRU-evicting sliding window count in a Map */
function slidingCount(key, windowMs, max) {
  const now = Date.now();
  if (!buckets.has(key)) {
    buckets.set(key, []);
  }
  const timestamps = buckets.get(key);
  // Evict old entries
  while (timestamps.length > 0 && timestamps[0] < now - windowMs) {
    timestamps.shift();
  }
  if (timestamps.length >= max) {
    return { allowed: false, remaining: 0, reset: timestamps[0] + windowMs };
  }
  timestamps.push(now);
  // Trim memory: keep map bounded
  if (buckets.size > 10000) {
    const entries = [...buckets.entries()];
    for (let i = 0; i < 2000; i++) {
      buckets.delete(entries[i][0]);
    }
  }
  return { allowed: true, remaining: max - timestamps.length, reset: (timestamps[0] || now) + windowMs };
}

/**
 * Create Express middleware that rate-limits by a derived key.
 */
function rateLimiter(options = {}) {
  const {
    windowMs = DEFAULT_WINDOW_MS,
    max = DEFAULT_MAX_REQUESTS,
    keyFn = (req) => req.ip,
    name = 'default',
  } = options;

  return function rateLimitMiddleware(req, res, next) {
    const key = `${name}:${keyFn(req)}`;
    const result = slidingCount(key, windowMs, max);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.reset / 1000)));
    if (!result.allowed) {
      return res.status(429).json({
        error: 'rate_limited',
        message: '请求过于频繁，请稍后再试',
        retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
      });
    }
    next();
  };
}

/**
 * Create middleware for Socket.IO events (attach to server side).
 * Returns a function: (eventName, handler) => handler or rejected
 */
function createSocketRateLimiter(options = {}) {
  const {
    windowMs = DEFAULT_WINDOW_MS,
    max = DEFAULT_MAX_REQUESTS,
    keyFn = (socket, event) => `${socket.request?.socket?.remoteAddress || socket.handshake?.address || socket.id}:${event}`,
  } = options;

  return function socketRateLimit(socket, event) {
    const key = `socket:${keyFn(socket, event)}`;
    const result = slidingCount(key, windowMs, max);
    return result.allowed;
  };
}

export { rateLimiter, createSocketRateLimiter, slidingCount };
