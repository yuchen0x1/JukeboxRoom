import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUpdateInfo, fetchSelfUpdateState, startServerUpdate } from './update';

afterEach(() => vi.unstubAllGlobals());
const mock = (status: number, body: unknown) => {
  vi.stubGlobal('localStorage', { getItem: () => 'synthetic-token' });
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
};
it('sends the administrator session and starts only an acknowledged update', async () => {
  const fetcher = mock(200, { ok: true, started: true });
  await startServerUpdate();
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer synthetic-token' } });
});
it('treats a permission rejection as a failure instead of starting polling', async () => {
  mock(403, { ok: false, error: '权限不足' });
  await expect(startServerUpdate()).rejects.toMatchObject({ status: 403 });
});
it('rejects success-shaped responses that did not start the updater', async () => {
  mock(200, { ok: true, started: false });
  await expect(startServerUpdate()).rejects.toThrow('未启动');
});
it('reads supported deployment status and manual-restart requirements', async () => {
  mock(200, { ok: true, supported: true, phase: 'restart-required' });
  expect(await fetchSelfUpdateState()).toMatchObject({ supported: true, phase: 'restart-required' });
});

describe('fetchUpdateInfo', () => {
  afterEach(() => vi.restoreAllMocks());

  it('requests an uncached same-origin endpoint and returns valid update data', async () => {
    const payload = {
      ok: true,
      currentVersion: '2.0.1',
      latestVersion: '2.0.2',
      updateAvailable: true,
      assets: { desktop: null, android: null, ios: null },
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));

    const result = await fetchUpdateInfo();

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/update\?ts=\d+$/), { cache: 'no-store', signal: undefined });
  });

  it('silently ignores failed or malformed update responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 503 }));
    await expect(fetchUpdateInfo()).resolves.toBeNull();

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true, updateAvailable: 'yes', assets: {} }), { status: 200 }));
    await expect(fetchUpdateInfo()).resolves.toBeNull();
  });
});
