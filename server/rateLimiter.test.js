import assert from 'node:assert/strict';
import test from 'node:test';
import { clearRateLimiter, createConcurrencyLimiter, getRateLimiterStats, slidingCount } from './rateLimiter.js';

test.beforeEach(() => clearRateLimiter());

test('sliding window remains bounded', () => {
  for (let index = 0; index < 40; index += 1) slidingCount(`client-${index}`, 100, 2, { maxBuckets: 5, now: 0 });
  assert.ok(getRateLimiterStats().buckets <= 5);
  slidingCount('fresh', 100, 2, { maxBuckets: 5, now: 500 });
  assert.ok(getRateLimiterStats().buckets <= 5);
});

test('sliding window enforces max and reset', () => {
  assert.equal(slidingCount('same', 1_000, 2, { now: 100 }).allowed, true);
  assert.equal(slidingCount('same', 1_000, 2, { now: 200 }).allowed, true);
  const blocked = slidingCount('same', 1_000, 2, { now: 300 });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.reset, 1_100);
});

test('concurrency limiter releases slots and bounds keys', () => {
  const limiter = createConcurrencyLimiter({ max: 2, maxKeys: 2 });
  assert.equal(limiter('a'), true);
  assert.equal(limiter('a'), true);
  assert.equal(limiter('a'), false);
  limiter.release('a');
  assert.equal(limiter('a'), true);
  limiter('b');
  limiter('c');
  assert.ok(limiter.size() <= 2);
  limiter.clear();
  assert.equal(limiter.size(), 0);
});
