/**
 * Task center engine tests (node --test)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerTask,
  runTask,
  cancelTask,
  isRunning,
  listTaskDefinitions,
  latestRun,
  taskCleanup,
  taskHotRankAggregate,
  taskMediaSourceProbe,
} from './index.js';
import { insert, find, findOne, remove, all } from '../db/store.js';

const RUNS = 'task_runs';
const SNAPSHOTS = 'task_snapshots';
const AUDIT = 'audit_log';

/** Remove only test-created records (actor/name marker 'test') */
function purgeTestData() {
  remove(RUNS, r => String(r.actor || r.name || '').includes('test'));
  remove(SNAPSHOTS, s => s.kind === 'hot_rank' && s.takenAt && s.takenAt.startsWith('2026'));
  remove(AUDIT, a => String(a.actor || '').includes('test'));
}

test('registry + successful run persists progress and result', async () => {
  purgeTestData();
  registerTask({
    name: 'test-ok',
    title: '测试任务',
    run: async (ctx) => {
      ctx.progress(10, '开始');
      ctx.progress(50, '进行中');
      ctx.progress(100, '完成');
      return { items: 3 };
    },
  });
  const result = await runTask('test-ok', { actor: 'test-user' });
  assert.equal(result.status, 'success');
  assert.ok(result.runId);
  const run = findOne(RUNS, r => r.id === result.runId);
  assert.ok(run);
  assert.equal(run.status, 'success');
  assert.equal(run.progress, 100);
  assert.equal(run.actor, 'test-user');
  assert.equal(run.result.items, 3);
  assert.ok(run.startedAt && run.finishedAt);
  purgeTestData();
});

test('failure records error and returns failed status', async () => {
  purgeTestData();
  registerTask({
    name: 'test-fail',
    run: async () => { throw new Error('boom'); },
  });
  const result = await runTask('test-fail', { actor: 'test-user' });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /boom/);
  const run = findOne(RUNS, r => r.id === result.runId);
  assert.equal(run.status, 'failed');
  assert.match(run.error, /boom/);
  purgeTestData();
});

test('unknown task is rejected', async () => {
  await assert.rejects(() => runTask('test-nope'), /未知任务/);
});

test('concurrency guard blocks parallel runs', async () => {
  purgeTestData();
  let release;
  const gate = new Promise(res => { release = res; });
  registerTask({
    name: 'test-slow',
    run: async () => { await gate; return { done: true }; },
  });
  const p1 = runTask('test-slow', { actor: 'test-user' });
  await new Promise(r => setTimeout(r, 50));
  assert.equal(isRunning('test-slow'), true);
  const second = await runTask('test-slow', { actor: 'test-user' });
  assert.equal(second.status, 'already_running');
  release();
  const first = await p1;
  assert.equal(first.status, 'success');
  assert.equal(isRunning('test-slow'), false);
  purgeTestData();
});

test('cancel stops a cooperative task', async () => {
  purgeTestData();
  registerTask({
    name: 'test-cancel',
    run: async (ctx) => {
      let i = 0;
      while (i < 1000) {
        if (ctx.isCancelled()) {
          ctx.progress(ctx.progressValue ?? 0, '取消中');
          return { cancelledAt: i };
        }
        await new Promise(r => setTimeout(r, 5));
        i++;
      }
      return { looped: true };
    },
  });
  const p = runTask('test-cancel', { actor: 'test-user' });
  await new Promise(r => setTimeout(r, 60));
  assert.equal(cancelTask('test-cancel'), true);
  const result = await p;
  assert.equal(result.status, 'cancelled');
  const run = findOne(RUNS, r => r.id === result.runId);
  assert.equal(run.status, 'cancelled');
  purgeTestData();
});

test('cleanup job removes expired audit logs and prunes runs', async () => {
  purgeTestData();
  // seed an old audit record (1 year old)
  insert(AUDIT, { actor: 'test-old', timestamp: new Date(Date.now() - 365 * 86400 * 1000).toISOString() });
  // seed a recent one that must survive
  insert(AUDIT, { actor: 'test-new', timestamp: new Date().toISOString() });
  const result = await runTask('cleanup', { actor: 'test-user' });
  assert.equal(result.status, 'success');
  assert.ok(result.result.auditRemoved >= 1);
  const oldLeft = find(AUDIT, a => a.actor === 'test-old');
  assert.equal(oldLeft.length, 0);
  const newLeft = find(AUDIT, a => a.actor === 'test-new');
  assert.equal(newLeft.length, 1);
  purgeTestData();
});

test('hot rank aggregate persists a snapshot', async () => {
  purgeTestData();
  const result = await runTask('hot-rank-aggregate', { actor: 'test-user' });
  assert.equal(result.status, 'success');
  assert.ok(Number.isInteger(result.result.count));
  const snaps = find(SNAPSHOTS, s => s.kind === 'hot_rank');
  assert.ok(snaps.length >= 1);
  purgeTestData();
});

test('media-source-probe rejects unsafe Meting upstreams', async () => {
  const previous = process.env.METING_API_URL;
  process.env.METING_API_URL = 'http://127.0.0.1:3300';
  const progress = [];
  try {
    const result = await taskMediaSourceProbe({ progress: (...args) => progress.push(args) });
    const meting = result.results.find(r => r.source === 'meting');
    assert.equal(meting.ok, false);
    assert.match(meting.error, /拒绝访问不安全的外部 URL/);
    assert.deepEqual(progress.at(-1), [100, '探测完成: 1/3 可用']);
  } finally {
    if (previous === undefined) delete process.env.METING_API_URL;
    else process.env.METING_API_URL = previous;
  }
});

test('definitions include the four built-in tasks', () => {
  const names = listTaskDefinitions().map(d => d.name);
  for (const n of ['media-source-probe', 'library-scan', 'cleanup', 'hot-rank-aggregate']) {
    assert.ok(names.includes(n), `missing ${n}`);
  }
});
