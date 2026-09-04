/**
 * AutoDJ engine tests (node --test)
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseActiveHourWindow,
  isActiveNow,
  setPoolProvider,
  weightedPick,
  generateQueue,
  advanceQueue,
  resetAutodj,
  autodjStatus,
} from './index.js';
import { remove, all } from '../db/store.js';

const QUEUE = 'autodj_queue';
const STATE = 'autodj_state';

function purge() {
  remove(QUEUE, () => true);
  remove(STATE, () => true);
}

function makePool(n, artists = ['甲'], weights) {
  return Array.from({ length: n }, (_, i) => ({
    id: `song-${i + 1}`,
    title: `歌曲 ${i + 1}`,
    artist: artists[i % artists.length],
    weight: weights ? weights[i] ?? 1 : 1,
    source: 'test',
  }));
}

const savedEnv = {};

function setEnv(obj) {
  for (const [k, v] of Object.entries(obj)) {
    savedEnv[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = String(v);
  }
}

function restoreEnv() {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  purge();
  setEnv({
    AUTODJ_AVOID_SAME_SONG: '2',
    AUTODJ_AVOID_SAME_ARTIST: '1',
    AUTODJ_ACTIVE_HOURS: '0-24',
    AUTODJ_ENABLED: '1',
  });
});

afterEach(() => {
  purge();
  setPoolProvider(null);
  restoreEnv();
});

test('parseActiveHourWindow handles valid, invalid and inverted windows', () => {
  assert.deepEqual(parseActiveHourWindow('9-23'), { start: 9, end: 23 });
  assert.deepEqual(parseActiveHourWindow('0-24'), { start: 0, end: 24 });
  assert.deepEqual(parseActiveHourWindow('abc'), { start: 0, end: 24 });
  assert.deepEqual(parseActiveHourWindow('23-9'), { start: 0, end: 24 });
  assert.deepEqual(parseActiveHourWindow(''), { start: 0, end: 24 });
});

test('isActiveNow respects hour window boundaries', () => {
  const hours = { start: 9, end: 23 };
  assert.equal(isActiveNow(hours, new Date(2026, 0, 1, 12)), true);
  assert.equal(isActiveNow(hours, new Date(2026, 0, 1, 9)), true);
  assert.equal(isActiveNow(hours, new Date(2026, 0, 1, 8)), false);
  assert.equal(isActiveNow(hours, new Date(2026, 0, 1, 23)), false);
});

test('weightedPick deterministically favors heavier song for small random draw', () => {
  const candidates = [
    { id: 'heavy', weight: 10 },
    { id: 'light1', weight: 1 },
    { id: 'light2', weight: 1 },
  ];
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.05; // r = 0.05 * 12 = 0.6 -> heavy wins
    assert.equal(weightedPick(candidates).id, 'heavy');
    Math.random = () => 0.99; // r = 11.88 -> falls past heavy into light zone
    const pick = weightedPick(candidates);
    assert.ok(pick.id.startsWith('light'));
  } finally {
    Math.random = originalRandom;
  }
});

test('generateQueue fills queue with unique songs and persists state', async () => {
  setPoolProvider(() => Promise.resolve(makePool(5)));
  const result = await generateQueue(5);
  assert.equal(result.generated, 5);
  assert.equal(result.reason, 'ok');
  const queue = all(QUEUE).filter(e => e.status === 'queued');
  assert.equal(queue.length, 5);
  const ids = queue.map(e => e.songId);
  assert.equal(new Set(ids).size, 5, '队列内不应有重复歌曲');
  const status = autodjStatus();
  assert.equal(status.recentSongIds.length, 2, '近史只保留避重窗口长度');
  assert.equal(status.stats.generated, 5);
});

test('avoidance: no adjacent repeat song across generate/advance cycles', async () => {
  setPoolProvider(() => Promise.resolve(makePool(3)));
  const picks = [];
  for (let round = 0; round < 8; round++) {
    await generateQueue(3);
    const next = await advanceQueue();
    assert.equal(next.status, 'played');
    picks.push(next.entry.songId);
  }
  for (let i = 1; i < picks.length; i++) {
    assert.notEqual(picks[i], picks[i - 1], `相邻两次不应重复: ${picks[i - 1]} -> ${picks[i]}`);
  }
});

test('artist avoidance: same artist not repeated consecutively', async () => {
  setPoolProvider(() => Promise.resolve(makePool(2, ['艺人A', '艺人B'])));
  const picks = [];
  for (let round = 0; round < 8; round++) {
    await generateQueue(2);
    const next = await advanceQueue();
    assert.equal(next.status, 'played');
    picks.push(next.entry.artist);
  }
  for (let i = 1; i < picks.length; i++) {
    assert.notEqual(picks[i], picks[i - 1], `同一艺人不应连续: ${picks[i - 1]} -> ${picks[i]}`);
  }
});

test('disabled engine refuses to generate', async () => {
  setEnv({ AUTODJ_ENABLED: '0' });
  setPoolProvider(() => Promise.resolve(makePool(3)));
  const result = await generateQueue(3);
  assert.equal(result.generated, 0);
  assert.equal(result.reason, 'disabled');
});

test('advanceQueue marks next as played and top-ups when empty', async () => {
  setPoolProvider(() => Promise.resolve(makePool(4)));
  await generateQueue(3);
  const first = await advanceQueue();
  assert.equal(first.status, 'played');
  assert.ok(first.entry.playedAt);
  assert.equal(all(QUEUE).filter(e => e.status === 'queued').length, 2);
  assert.equal(autodjStatus().stats.played, 1);

  await advanceQueue();
  await advanceQueue();
  const drained = await advanceQueue(); // empty -> top-up -> plays one
  assert.equal(drained.status, 'played');
  assert.ok(all(QUEUE).filter(e => e.status === 'queued').length >= 1);
});

test('reset clears queue and recent history', async () => {
  setPoolProvider(() => Promise.resolve(makePool(4)));
  await generateQueue(4);
  assert.ok(all(QUEUE).length >= 4);
  const res = resetAutodj();
  assert.equal(res.cleared, true);
  assert.equal(all(QUEUE).length, 0);
  assert.equal(autodjStatus().recentSongIds.length, 0);
});


test('default pool wiring works without an injected provider (library + hot-rank fallback)', async () => {
  setPoolProvider(null);
  const result = await generateQueue(1);
  assert.equal(typeof result.activeNow, 'boolean');
  assert.ok('generated' in result);
  assert.ok(result.generated >= 0);
});
