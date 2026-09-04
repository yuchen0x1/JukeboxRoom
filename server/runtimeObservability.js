import { randomBytes } from 'crypto';
import { rootLogger, createLogger } from './logger.js';

export function createRuntimeObservability() {
  const startedAt = Date.now();
  let ready = false;
  let requestCount = 0;

  function requestContext(req, res, next) {
    const incoming = String(req.headers['x-request-id'] || '').trim();
    const requestId = /^[A-Za-z0-9_-]{8,128}$/.test(incoming)
      ? incoming
      : randomBytes(12).toString('base64url');
    req.requestId = requestId;
    req.log = createLogger(requestId);
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => { requestCount += 1; });
    next();
  }

  function securityHeaders(_req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
    next();
  }

  function metrics() {
    return [
      '# TYPE openmusic_process_uptime_seconds gauge',
      'openmusic_process_uptime_seconds ' + ((Date.now() - startedAt) / 1000).toFixed(3),
      '# TYPE openmusic_runtime_ready gauge',
      'openmusic_runtime_ready ' + (ready ? 1 : 0),
      '# TYPE openmusic_http_requests_total counter',
      'openmusic_http_requests_total ' + requestCount,
      '',
    ].join('\n');
  }

  return {
    metrics,
    requestContext,
    securityHeaders,
    logger: rootLogger,
    setReady(value) { ready = Boolean(value); },
    get ready() { return ready; },
  };
}
