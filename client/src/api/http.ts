import { isAndroidRuntime, resolveMobileApiUrl } from '../lib/mobileApi';

const DEFAULT_TIMEOUT_MS = 10000;

/** 请求失败的分类，便于 UI 区分「网络断了」「超时」「服务端拒绝」。 */
export type ApiErrorKind = 'http' | 'timeout' | 'network' | 'invalid_response' | 'aborted';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;
  readonly retryAfterSec: number | null;

  constructor(message: string, options: {
    kind?: ApiErrorKind;
    status?: number;
    code?: string | null;
    requestId?: string | null;
    retryAfterSec?: number | null;
    cause?: unknown;
  } = {}) {
    super(message);
    // ES2020 target 不包含 Error.cause 构造参数；手动挂载以保留原始错误。
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
    this.name = 'ApiError';
    this.kind = options.kind || 'http';
    this.status = options.status ?? 0;
    this.code = options.code ?? null;
    this.requestId = options.requestId ?? null;
    this.retryAfterSec = options.retryAfterSec ?? null;
  }

  /** 4xx 属于请求本身的问题，重试没有意义；5xx/超时/网络错误可以重试。 */
  get retryable(): boolean {
    return this.kind !== 'http' || this.status === 0 || this.status >= 500 || this.status === 429;
  }

  /** 可直接展示给用户的中文提示。 */
  get userMessage(): string {
    if (this.kind === 'timeout') return '请求超时，请检查网络后重试';
    if (this.kind === 'network') return '网络连接失败，请检查网络后重试';
    if (this.kind === 'invalid_response') return '服务器返回了无法识别的响应';
    if (this.status === 429) return '操作过于频繁，请稍后再试';
    if (this.status === 401) return '登录状态已失效，请重新登录';
    if (this.status === 403) return '没有权限执行此操作';
    if (this.status >= 500) return '服务器暂时不可用，请稍后重试';
    return this.message || '请求失败';
  }
}

/**
 * 带超时的 fetch。
 *
 * - 兼容调用方传入的 AbortSignal：两者任一触发都会取消请求。
 * - 超时抛出 `ApiError(kind: 'timeout')`；网络失败包装为 `kind: 'network'`，
 *   避免调用方只能看到笼统的 "Failed to fetch"。
 * - 使用 `globalThis.setTimeout`，便于在非浏览器环境（测试/SSR）复用。
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;
  let timedOut = false;

  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }

  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const requestInput = isAndroidRuntime() && typeof input === 'string'
      ? resolveMobileApiUrl(input)
      : input;
    return await fetch(requestInput, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new ApiError('请求超时', { kind: 'timeout', cause: error });
    }
    if (externalSignal?.aborted) {
      throw new ApiError('请求已取消', { kind: 'aborted', cause: error });
    }
    throw new ApiError('网络连接失败', { kind: 'network', cause: error });
  } finally {
    globalThis.clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

interface ErrorBody {
  error?: unknown;
  message?: unknown;
  requestId?: unknown;
  retryAfter?: unknown;
}

async function readErrorBody(response: Response): Promise<ErrorBody | null> {
  try {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    return await response.json() as ErrorBody;
  } catch {
    return null;
  }
}

/**
 * 解析 JSON 响应，并把非 2xx 统一转换成 `ApiError`。
 *
 * 服务端 `/api` 现在保证错误响应是 JSON；这个函数仍对 HTML/空响应做兜底，
 * 避免 `res.json()` 抛出的 SyntaxError 直接冒泡到 UI（提示会变成
 * "Unexpected token '<'"）。
 */
export async function readJsonResponse<T>(response: Response, fallbackMessage = '请求失败'): Promise<T> {
  if (!response.ok) {
    const body = await readErrorBody(response);
    // 只展示服务端的人类可读 message；error 字段是机器码（rate_limited 等），
    // 直接展示给用户会变成一串英文标识符。
    const message = typeof body?.message === 'string' && body.message.trim()
      ? body.message
      : fallbackMessage;
    const retryAfterRaw = body?.retryAfter ?? response.headers.get('retry-after');
    const retryAfterSec = Number(retryAfterRaw);
    throw new ApiError(message, {
      kind: 'http',
      status: response.status,
      code: typeof body?.error === 'string' ? body.error : null,
      requestId: typeof body?.requestId === 'string' ? body.requestId : response.headers.get('x-request-id'),
      retryAfterSec: Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec : null,
    });
  }

  try {
    return await response.json() as T;
  } catch (error) {
    throw new ApiError('服务器返回了无法识别的响应', { kind: 'invalid_response', status: response.status, cause: error });
  }
}

/** fetch + JSON 解析的便捷组合。 */
export async function fetchJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: { timeoutMs?: number; fallbackMessage?: string } = {},
): Promise<T> {
  const response = await fetchWithTimeout(input, init, options.timeoutMs);
  return readJsonResponse<T>(response, options.fallbackMessage);
}
