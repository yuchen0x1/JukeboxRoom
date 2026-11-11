/**
 * HTTP 错误边界。
 *
 * 之前 /api 下未匹配的路径和路由抛出的异常都会落到 Express 默认处理器，
 * 返回 HTML 错误页。客户端统一用 `res.json()` 解析，因此只能得到一个
 * 泛化的 "Unexpected token '<'"；日志里也没有 request id 可用于关联。
 *
 * 这里统一为：
 * - /api 下未匹配路径 → JSON 404
 * - 任意路由异常 → JSON（/api）或纯文本（其他），并带 X-Request-Id
 * - 5xx 记录完整堆栈，4xx 只记录简要信息，避免把用户输入刷进日志
 */

const API_PREFIX = '/api';

function isApiRequest(req) {
  return String(req.originalUrl || req.url || '').startsWith(API_PREFIX);
}

/** 所有 /api 响应默认禁止缓存；具体路由可覆盖（如更新日志的 public max-age）。 */
export function apiNoStore(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

/** 挂在所有路由之后：/api 未匹配路径返回 JSON 404，而不是 SPA HTML。 */
export function apiNotFoundHandler(req, res, next) {
  if (!isApiRequest(req)) {
    next();
    return;
  }
  res.status(404).json({
    ok: false,
    error: 'not_found',
    message: `接口不存在: ${req.method} ${req.path}`,
    requestId: req.requestId || null,
  });
}

function resolveStatus(error) {
  const raw = Number(error?.status || error?.statusCode);
  if (Number.isInteger(raw) && raw >= 400 && raw <= 599) return raw;
  // body-parser 的请求体过大/格式错误属于客户端错误
  if (error?.type === 'entity.too.large') return 413;
  if (error?.type === 'entity.parse.failed') return 400;
  return 500;
}

function publicMessage(status) {
  if (status === 400) return '请求格式无效';
  if (status === 401) return '未授权';
  if (status === 403) return '没有权限执行此操作';
  if (status === 404) return '资源不存在';
  if (status === 413) return '请求体过大';
  if (status === 429) return '请求过于频繁，请稍后再试';
  if (status >= 500) return '服务器内部错误';
  return '请求失败';
}

/**
 * @param {{ logger?: { error: Function, warn: Function } }} [options]
 */
export function createErrorHandler(options = {}) {
  const logger = options.logger || console;

  return function errorHandler(error, req, res, next) {
    if (res.headersSent) {
      next(error);
      return;
    }

    const status = resolveStatus(error);
    // 只在服务端错误时记录堆栈；4xx 通常是客户端输入问题。
    const detail = {
      context: 'http-error',
      method: req.method,
      path: req.originalUrl || req.url,
      status,
      requestId: req.requestId || null,
    };
    if (status >= 500) {
      (logger.error || console.error).call(logger, error?.stack || error?.message || String(error), detail);
    } else {
      (logger.warn || console.warn).call(logger, 'request rejected', { ...detail, reason: error?.message });
    }

    if (isApiRequest(req)) {
      res.status(status).json({
        ok: false,
        error: status >= 500 ? 'internal_error' : 'request_error',
        message: status >= 500 ? publicMessage(status) : (error?.expose && error.message ? error.message : publicMessage(status)),
        requestId: req.requestId || null,
      });
      return;
    }

    res.status(status).type('text').send(publicMessage(status));
  };
}
