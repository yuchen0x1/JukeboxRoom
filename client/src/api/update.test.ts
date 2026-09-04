import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUpdateInfo } from './update';

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
