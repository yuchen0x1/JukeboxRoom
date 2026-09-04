import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMp3DurationMs } from './cyapi.js';

test('cyapi does not probe private third-party media URLs', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('unexpected network request');
  };
  try {
    assert.equal(await resolveMp3DurationMs('http://127.0.0.1:4000/private.mp3'), undefined);
    assert.equal(await resolveMp3DurationMs('http://[::1]/private.mp3'), undefined);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
