import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, fetchWithTimeout, fetchJson, readJsonResponse } from './http';

vi.mock('../lib/mobileApi', () => ({
  isAndroidRuntime: () => false,
  resolveMobileApiUrl: (value: string) => value,
}));

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

describe('ApiError', () => {
  it('区分可重试与不可重试', () => {
    expect(new ApiError('x', { kind: 'timeout' }).retryable).toBe(true);
    expect(new ApiError('x', { kind: 'network' }).retryable).toBe(true);
    expect(new ApiError('x', { kind: 'http', status: 500 }).retryable).toBe(true);
    expect(new ApiError('x', { kind: 'http', status: 429 }).retryable).toBe(true);
    expect(new ApiError('x', { kind: 'http', status: 400 }).retryable).toBe(false);
    expect(new ApiError('x', { kind: 'aborted' }).retryable).toBe(true);
  });

  it('把状态码映射为可展示的中文提示', () => {
    expect(new ApiError('x', { kind: 'timeout' }).userMessage).toContain('超时');
    expect(new ApiError('x', { kind: 'network' }).userMessage).toContain('网络');
    expect(new ApiError('x', { kind: 'http', status: 401 }).userMessage).toContain('登录');
    expect(new ApiError('x', { kind: 'http', status: 429 }).userMessage).toContain('频繁');
    expect(new ApiError('x', { kind: 'http', status: 503 }).userMessage).toContain('服务器');
  });
});

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('超时后抛出 timeout 类型的 ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn((_input: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));

    const promise = fetchWithTimeout('/api/slow', {}, 50);
    const assertion = expect(promise).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });

  it('网络错误包装为 network 类型', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchWithTimeout('/api/x')).rejects.toMatchObject({ kind: 'network' });
  });

  it('外部 signal 取消时不误报为超时', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_input: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));

    const promise = fetchWithTimeout('/api/x', { signal: controller.signal });
    const assertion = expect(promise).rejects.toMatchObject({ kind: 'aborted' });
    controller.abort();
    await assertion;
  });
});

describe('readJsonResponse', () => {
  it('非 2xx 使用服务端 message，并保留 requestId', async () => {
    const response = jsonResponse(
      { ok: false, error: 'request_error', message: '房间不存在', requestId: 'req-9' },
      { status: 404 },
    );
    await expect(readJsonResponse(response)).rejects.toMatchObject({
      status: 404,
      message: '房间不存在',
      requestId: 'req-9',
    });
  });

  it('没有可展示 message 时退回 fallback，并识别 retry-after', async () => {
    const response = jsonResponse(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': '7' } },
    );
    await expect(readJsonResponse(response, '搜索失败')).rejects.toMatchObject({
      status: 429,
      message: '搜索失败',
      retryAfterSec: 7,
      code: 'rate_limited',
    });
  });

  it('HTML 错误页不会被当成 JSON 解析崩溃', async () => {
    const response = new Response('<html>502 Bad Gateway</html>', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    });
    await expect(readJsonResponse(response, '服务暂不可用')).rejects.toMatchObject({
      status: 502,
      message: '服务暂不可用',
      kind: 'http',
    });
  });

  it('2xx 但响应体不是 JSON 时抛出 invalid_response', async () => {
    const response = new Response('not-json', { status: 200, headers: { 'content-type': 'text/plain' } });
    await expect(readJsonResponse(response)).rejects.toMatchObject({ kind: 'invalid_response' });
  });
});

describe('fetchJson', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('成功时返回解析后的 JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: true, rooms: [] })));
    await expect(fetchJson<{ ok: boolean }>('/api/rooms')).resolves.toMatchObject({ ok: true });
  });
});
