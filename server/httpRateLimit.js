/**
 * HTTP API 限流装配。
 *
 * 边界约定（不要退回"全站一个桶"的写法）：
 * - 只对 /api/* 计数；静态资源（/assets、/qface、/icons、/、HTML）不参与。
 *   一次进入房间就要拉 20+ 个静态 chunk，若与 API 共用一个桶，正常用户会在
 *   几分钟内被整站 429；反向代理后未开 TRUST_PROXY 时所有人共用一个 IP 桶，
 *   影响会被放大成整站不可用。
 * - 健康检查豁免：负载均衡/监控探针被限流会被误判为实例故障。
 * - Socket.IO 握手在 io.use 中单独限流，不经过这里。
 */

import { rateLimiter } from './rateLimiter.js';

export const DEFAULT_API_RATE_LIMIT_PER_MIN = 240;

/** /api 前缀下允许跳过限流的探针路径（挂载在 /api 之后，req.path 已去掉前缀） */
export const HEALTH_PROBE_PATHS = new Set(['/health', '/health/live', '/health/ready']);

/**
 * @param {{ max?: number, windowMs?: number }} [options]
 * @returns {import('express').RequestHandler}
 */
export function createHttpApiRateLimit(options = {}) {
  const max = Number.isInteger(options.max) && options.max > 0
    ? options.max
    : DEFAULT_API_RATE_LIMIT_PER_MIN;
  const windowMs = Number.isInteger(options.windowMs) && options.windowMs > 0
    ? options.windowMs
    : 60_000;

  const limit = rateLimiter({ name: 'http-api', max, windowMs });

  const middleware = (req, res, next) => {
    if (HEALTH_PROBE_PATHS.has(req.path)) {
      next();
      return;
    }
    limit(req, res, next);
  };

  return middleware;
}

/** 解析 HTTP_API_RATE_LIMIT_PER_MIN；非法或缺失时回退默认值 */
export function resolveApiRateLimitPerMin(rawValue, fallback = DEFAULT_API_RATE_LIMIT_PER_MIN) {
  const parsed = Number.parseInt(String(rawValue ?? '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
