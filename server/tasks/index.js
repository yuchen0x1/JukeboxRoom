/**
 * Task center (P0-4) — 任务中心
 *
 * - 任务引擎：注册、执行、进度上报、失败记录、并发互斥、取消、持久化历史
 * - 内置任务：
 *   - media-source-probe  媒体源探测（meting / cyapi-kugou / netease）
 *   - library-scan        本地曲库扫描（接管 library runScan）
 *   - cleanup             审计日志与任务历史清理
 *   - hot-rank-aggregate  热榜快照聚合（内存/Redis -> 持久化快照）
 * - 定时调度：startTaskScheduler() / stopTaskScheduler()
 * - HTTP API（挂载于 /api/admin/tasks，需 admin+ 鉴权）：
 *   GET  /                      任务定义 + 运行状态
 *   GET  /runs                  运行历史（持久化）
 *   GET  /:name                 任务定义 + 最近一次运行
 *   POST /:name/run             手动触发
 *   POST /:name/cancel          取消正在运行的任务（协作式）
 */

import { Router } from 'express';
import { insert, find, findOne, update, all, remove } from '../db/store.js';
import { recordAudit, cleanupAuditLogs } from '../audit/index.js';
import { runScanAsync } from '../library/index.js';
import { getHotSongs } from '../songHotRank.js';
import { isCyapiConfigured } from '../cyapi.js';
import { fetchMeting } from '../metingFetch.js';

const RUNS_COLLECTION = 'task_runs';
const SNAPSHOT_COLLECTION = 'task_snapshots';

/** @type {Map<string, {name:string,title:string,description:string,defaultIntervalMs:number,run:(ctx:object)=>Promise<any>}>} */
const registry = new Map();
/** @type {Map<string, {runId:string,cancelRequested:boolean}>} */
const running = new Map();
/** @type {Map<string, NodeJS.Timeout>} */
const timers = new Map();

/* ------------------------------------------------------------------ */
/*  Registry & runner                                                  */
/* ------------------------------------------------------------------ */

function registerTask(def) {
  if (!def || typeof def.name !== 'string' || typeof def.run !== 'function') {
    throw new Error(`任务定义无效: ${def?.name ?? 'anonymous'}`);
  }
  registry.set(def.name, {
    title: def.name,
    description: '',
    defaultIntervalMs: 0,
    ...def,
  });
}

function listTaskDefinitions() {
  return [...registry.values()].map(d => ({
    name: d.name,
    title: d.title,
    description: d.description,
    defaultIntervalMs: d.defaultIntervalMs,
  }));
}

function latestRun(name, limit = 20) {
  const runs = find(RUNS_COLLECTION, r => r.name === name)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return limit === 1 ? runs[0] || null : runs.slice(0, limit);
}

function isRunning(name) {
  return running.has(name);
}

/** 创建一条运行记录并返回 { runId, progress 更新器, isCancelled } */
async function runTask(name, { trigger = 'manual', actor = 'system' } = {}) {
  const def = registry.get(name);
  if (!def) {
    throw new Error(`未知任务: ${name}`);
  }
  if (running.has(name)) {
    return { status: 'already_running', runId: running.get(name).runId, message: '任务正在运行中' };
  }

  const record = insert(RUNS_COLLECTION, {
    name,
    status: 'pending',
    progress: 0,
    message: '排队中',
    trigger,
    actor,
    attempts: 0,
    error: null,
    result: null,
    startedAt: null,
    finishedAt: null,
  });

  const state = { runId: record.id, cancelRequested: false };
  running.set(name, state);

  const ctx = {
    task: def,
    runId: record.id,
    /** 上报进度（0-100）与可选消息 */
    progress(value, message) {
      const progress = Math.min(100, Math.max(0, Number(value) || 0));
      update(RUNS_COLLECTION, r => r.id === record.id, {
        status: 'running',
        progress,
        message: message ?? state.lastMessage ?? '',
        startedAt: record.startedAt ?? new Date().toISOString(),
      });
      state.lastMessage = message;
    },
    isCancelled: () => state.cancelRequested,
  };

  try {
    update(RUNS_COLLECTION, r => r.id === record.id, {
      status: 'running',
      attempts: 1,
      startedAt: new Date().toISOString(),
      message: '执行中',
    });
    const result = await def.run(ctx);
    const finishedAt = new Date().toISOString();
    const cancelled = state.cancelRequested;
    update(RUNS_COLLECTION, r => r.id === record.id, {
      status: cancelled ? 'cancelled' : 'success',
      progress: cancelled ? ctx.progressValue ?? 0 : 100,
      message: cancelled ? '已取消' : '完成',
      result: result ?? null,
      finishedAt,
    });
    recordAudit({
      actor,
      action: 'task.run',
      resource: `task:${name}`,
      result: cancelled ? 'cancelled' : 'success',
      after: { runId: record.id },
    });
    return { status: cancelled ? 'cancelled' : 'success', runId: record.id, result };
  } catch (err) {
    const message = String(err?.message || err);
    update(RUNS_COLLECTION, r => r.id === record.id, {
      status: 'failed',
      error: message,
      message: `失败: ${message}`,
      finishedAt: new Date().toISOString(),
    });
    recordAudit({
      actor,
      action: 'task.run',
      resource: `task:${name}`,
      result: 'failure',
      after: { runId: record.id, error: message },
    });
    return { status: 'failed', runId: record.id, error: message };
  } finally {
    running.delete(name);
  }
}

/** 请求取消（协作式：任务需通过 ctx.isCancelled() 主动退出） */
function cancelTask(name) {
  const state = running.get(name);
  if (!state) return false;
  state.cancelRequested = true;
  return true;
}

/* ------------------------------------------------------------------ */
/*  内置任务                                                           */
/* ------------------------------------------------------------------ */

/** 媒体源探测：meting / cyapi(kugou) / netease 内部源 */
async function taskMediaSourceProbe(ctx) {
  const results = [];
  const metingUrl = (process.env.METING_API_URL || '').replace(/\/+$/, '');
  if (metingUrl) {
    try {
      const t0 = Date.now();
      const res = await fetchMeting(`${metingUrl}/api/meting`, {}, 5000);
      results.push({
        source: 'meting',
        ok: res.ok,
        status: res.status,
        latencyMs: Date.now() - t0,
      });
    } catch (err) {
      results.push({ source: 'meting', ok: false, error: String(err?.message || err) });
    }
  } else {
    results.push({ source: 'meting', ok: false, error: 'METING_API_URL 未配置' });
  }

  results.push({
    source: 'kugou-cyapi',
    ok: isCyapiConfigured(),
    note: isCyapiConfigured() ? '已配置' : '未配置（绿点/蓝点）',
  });

  results.push({ source: 'netease-toplist', ok: true, note: '内部实现' });

  const okCount = results.filter(r => r.ok).length;
  ctx.progress(100, `探测完成: ${okCount}/${results.length} 可用`);
  return { probedAt: new Date().toISOString(), results };
}

/** 本地曲库扫描（接管 library runScan，独立于同步 HTTP 路由） */
async function taskLibraryScan(ctx) {
  const paths = (process.env.MUSIC_LIBRARY_PATHS || '').split(';').map(s => s.trim()).filter(Boolean);
  if (paths.length === 0) {
    ctx.progress(0, '未配置 MUSIC_LIBRARY_PATHS');
    return { scanned: 0, total: 0, added: 0, updated: 0, error: '未配置 MUSIC_LIBRARY_PATHS', hint: '设置环境变量指向本地音乐目录，多个用;分隔' };
  }
  ctx.progress(5, '开始扫描目录...');
  const result = await runScanAsync(paths);
  ctx.progress(100, `扫描完成: 共 ${result.total} 首（新增 ${result.added} / 更新 ${result.updated}）`);
  return { ...result, scannedAt: new Date().toISOString() };
}

/** 清理：审计日志保留期 + 任务历史保留上限 */
async function taskCleanup(ctx) {
  const retentionDays = parseInt(process.env.TASK_AUDIT_RETENTION_DAYS || '90', 10);
  const keepRuns = parseInt(process.env.TASK_RUNS_KEEP || '500', 10);

  ctx.progress(10, '清理审计日志...');
  const auditRemoved = cleanupAuditLogs(retentionDays);

  ctx.progress(60, '清理任务历史...');
  const runs = all(RUNS_COLLECTION)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const toRemove = runs.slice(keepRuns).map(r => r.id);
  for (const id of toRemove) {
    remove(RUNS_COLLECTION, r => r.id === id);
  }

  ctx.progress(100, `清理完成: 审计 ${auditRemoved} 条, 任务记录 ${toRemove.length} 条`);
  return { auditRemoved, taskRunsRemoved: toRemove.length, retentionDays, keepRuns };
}

/** 热榜聚合：内存/Redis 热榜 -> 持久化快照（供分析看板使用） */
async function taskHotRankAggregate(ctx) {
  ctx.progress(20, '读取热榜...');
  const songs = await getHotSongs(50);
  ctx.progress(70, '写入快照...');
  const snapshot = insert(SNAPSHOT_COLLECTION, {
    kind: 'hot_rank',
    songs,
    takenAt: new Date().toISOString(),
  });
  const snaps = all(SNAPSHOT_COLLECTION)
    .filter(s => s.kind === 'hot_rank')
    .sort((a, b) => (b.takenAt || '').localeCompare(a.takenAt || ''));
  for (const s of snaps.slice(100)) {
    remove(SNAPSHOT_COLLECTION, x => x.id === s.id);
  }
  ctx.progress(100, `热榜快照完成: ${songs.length} 首`);
  return { count: songs.length, snapshotId: snapshot.id, takenAt: snapshot.takenAt };
}

registerTask({
  name: 'media-source-probe',
  title: '媒体源探测',
  description: '探测 meting / cyapi(Kugou) / netease 各媒体源可用性',
  defaultIntervalMs: 10 * 60 * 1000,
  run: taskMediaSourceProbe,
});
registerTask({
  name: 'library-scan',
  title: '本地曲库扫描',
  description: '扫描 MUSIC_LIBRARY_PATHS 配置的目录并入库',
  defaultIntervalMs: 12 * 60 * 60 * 1000,
  run: taskLibraryScan,
});
registerTask({
  name: 'cleanup',
  title: '系统清理',
  description: '按保留期清理审计日志与任务历史',
  defaultIntervalMs: 6 * 60 * 60 * 1000,
  run: taskCleanup,
});
registerTask({
  name: 'hot-rank-aggregate',
  title: '热榜聚合',
  description: '将内存/Redis 热榜固化为持久化快照',
  defaultIntervalMs: 15 * 60 * 1000,
  run: taskHotRankAggregate,
});

/* ------------------------------------------------------------------ */
/*  定时调度                                                           */
/* ------------------------------------------------------------------ */

/** 启动定时调度（幂等）。仅对 defaultIntervalMs > 0 的任务生效。 */
function startTaskScheduler() {
  for (const def of registry.values()) {
    if (def.defaultIntervalMs > 0 && !timers.has(def.name)) {
      const timer = setInterval(() => {
        void runTask(def.name, { trigger: 'schedule', actor: 'system' });
      }, def.defaultIntervalMs);
      timer.unref?.();
      timers.set(def.name, timer);
    }
  }
}

/** 停止全部定时调度 */
function stopTaskScheduler() {
  for (const [name, timer] of timers) {
    clearInterval(timer);
    timers.delete(name);
  }
}

/* ------------------------------------------------------------------ */
/*  HTTP API（挂载方负责 authMiddleware + requireRole）               */
/* ------------------------------------------------------------------ */

const taskRouter = Router();

taskRouter.get('/', (_req, res) => {
  const defs = listTaskDefinitions();
  const payload = defs.map(d => ({
    ...d,
    running: isRunning(d.name),
    latestRun: latestRun(d.name, 1),
  }));
  res.json({ tasks: payload, total: payload.length });
});

taskRouter.get('/runs', (req, res) => {
  const { name, status, limit } = req.query;
  const max = Math.min(Math.max(1, parseInt(limit) || 50), 500);
  let runs = find(RUNS_COLLECTION, r => {
    if (name && r.name !== name) return false;
    if (status && r.status !== status) return false;
    return true;
  }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  runs = runs.slice(0, max);
  res.json({ runs, total: runs.length });
});

taskRouter.get('/:name', (req, res) => {
  const { name } = req.params;
  const def = registry.get(name);
  if (!def) return res.status(404).json({ error: 'task_not_found', message: `未知任务: ${name}` });
  res.json({
    definition: { name: def.name, title: def.title, description: def.description, defaultIntervalMs: def.defaultIntervalMs },
    running: isRunning(name),
    latestRun: latestRun(name, 1),
  });
});

taskRouter.post('/:name/run', async (req, res) => {
  const { name } = req.params;
  if (!registry.has(name)) return res.status(404).json({ error: 'task_not_found', message: `未知任务: ${name}` });
  const actor = req.user?.username || 'admin';
  const result = await runTask(name, { trigger: 'manual', actor });
  if (result.status === 'already_running') {
    return res.status(409).json(result);
  }
  res.json(result);
});

taskRouter.post('/:name/cancel', (req, res) => {
  const { name } = req.params;
  const cancelled = cancelTask(name);
  res.json({ name, cancelled });
});

export {
  taskRouter,
  registerTask,
  runTask,
  cancelTask,
  isRunning,
  listTaskDefinitions,
  latestRun,
  startTaskScheduler,
  stopTaskScheduler,
  taskMediaSourceProbe,
  taskLibraryScan,
  taskCleanup,
  taskHotRankAggregate,
};
