import test from 'node:test';
import assert from 'node:assert/strict';
import { canRequestProvider, getProviderHealth, recordProviderFailure, recordProviderSuccess, resetProviderHealth } from './mediaHealth.js';

test('音源连续失败后熔断，冷却探测成功后恢复', async () => {
  const oldThreshold = process.env.MEDIA_HEALTH_FAILURE_THRESHOLD;
  const oldCooldown = process.env.MEDIA_HEALTH_COOLDOWN_MS;
  process.env.MEDIA_HEALTH_FAILURE_THRESHOLD = '2';
  process.env.MEDIA_HEALTH_COOLDOWN_MS = '10';
  resetProviderHealth();
  try {
    recordProviderFailure('netease', 503);
    assert.equal(canRequestProvider('netease'), true);
    recordProviderFailure('netease', 503);
    assert.equal(canRequestProvider('netease'), false);
    assert.equal(getProviderHealth()[0].status, 'open');

    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(canRequestProvider('netease'), true);
    recordProviderSuccess('netease', 200);
    assert.equal(getProviderHealth()[0].status, 'healthy');
    assert.equal(getProviderHealth()[0].failures, 0);
  } finally {
    resetProviderHealth();
    if (oldThreshold === undefined) delete process.env.MEDIA_HEALTH_FAILURE_THRESHOLD;
    else process.env.MEDIA_HEALTH_FAILURE_THRESHOLD = oldThreshold;
    if (oldCooldown === undefined) delete process.env.MEDIA_HEALTH_COOLDOWN_MS;
    else process.env.MEDIA_HEALTH_COOLDOWN_MS = oldCooldown;
  }
});
