/**
 * AutoDJ scheduling engine (P1-3).
 *
 * Features:
 * - 时间窗口: only generates/advances during configured active hours
 *   (AUTODJ_ACTIVE_HOURS, e.g. "9-23"; default 0-24 = always on)
 * - 权重: songs with higher weight are picked earlier/more often
 *   (per-song `weight` 0-10; pool provider may attach it)
 * - 避重: no same song within last N picks, no same artist within last M picks
 *   (AUTODJ_AVOID_SAME_SONG=3, AUTODJ_AVOID_SAME_ARTIST=2 by default)
 * - Persistent queue + state in the JSON store (autodj_queue / autodj_state)
 *
 * HTTP API (mounted at /api/autodj, authMiddleware + requireRole user+):
 *   GET  /api/autodj/status
 *   POST /api/autodj/enable      { enabled: boolean }
 *   POST /api/autodj/generate    { count?: number }  -> top up queue
 *   GET  /api/autodj/queue       -> pending (queued) entries
 *   POST /api/autodj/advance     -> mark next queued as played, return it
 *   POST /api/autodj/reset       -> clear queue + recent history
 */

import { Router } from 'express';
import { insert, find, findOne, update, all, remove } from '../db/store.js';

const QUEUE = 'autodj_queue';
const STATE = 'autodj_state';

/* ------------------------------------------------------------------ */
/*  Config                                                            */
/* ------------------------------------------------------------------ */

function parseActiveHourWindow(value) {
  const parts = String(value ?? '').trim().split('-');
  if (parts.length !== 2 || parts.some(part => !/^\d{1,2}$/.test(part))) return { start: 0, end: 24 };
  const start = Math.min(23, Math.max(0, parseInt(parts[0], 10)));
  const end = Math.min(24, Math.max(1, parseInt(parts[1], 10)));
  return end > start ? { start, end } : { start: 0, end: 24 };
}

function getConfig() {
  return {
    activeHours: parseActiveHourWindow(process.env.AUTODJ_ACTIVE_HOURS),
    avoidSameSong: Math.max(0, parseInt(process.env.AUTODJ_AVOID_SAME_SONG || '3', 10)),
    avoidSameArtist: Math.max(0, parseInt(process.env.AUTODJ_AVOID_SAME_ARTIST || '2', 10)),
    lowWaterMark: Math.max(1, parseInt(process.env.AUTODJ_LOW_WATER || '5', 10)),
  };
}

/** Hour-of-day check; `now` injectable for tests. */
function isActiveNow(hours, now = new Date()) {
  const h = now.getHours();
  return h >= hours.start && h < hours.end;
}

/* ------------------------------------------------------------------ */
/*  Pool provider (dependency-injectable for tests)                   */
/* ------------------------------------------------------------------ */

let poolProvider = null;

/** Set a custom pool provider: () => Promise<Array<{id,title,artist,weight?}>> */
function setPoolProvider(fn) {
  poolProvider = fn;
}

async function getPool() {
  if (poolProvider) return poolProvider();
  const [{ listLocalSongs }, { getHotSongs }] = await Promise.all([
    import('../library/index.js'),
    import('../songHotRank.js'),
  ]);
  const locals = listLocalSongs().map(s => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    weight: Number(s.weight) || 1,
    source: 'local',
  }));
  const hot = await getHotSongs(50).catch(() => []);
  const hotMapped = (hot || []).map((s, i) => ({
    id: s.id || s.songId || `hot-${i}`,
    title: s.title || s.name || '未知歌曲',
    artist: s.artist || '未知艺术家',
    weight: 1,
    source: 'hot',
  }));
  return [...locals, ...hotMapped];
}

/* ------------------------------------------------------------------ */
/*  State helpers                                                     */
/* ------------------------------------------------------------------ */

function getState() {
  let state = findOne(STATE, () => true);
  if (!state) {
    state = insert(STATE, {
      enabled: process.env.AUTODJ_ENABLED === '1',
      recentSongIds: [],
      recentArtists: [],
      stats: { generated: 0, played: 0 },
      createdAt: new Date().toISOString(),
    });
  }
  return state;
}

function saveState(state) {
  update(STATE, () => true, state);
}

function pendingQueue() {
  return all(QUEUE)
    .filter(e => e.status === 'queued')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

/* ------------------------------------------------------------------ */
/*  Selection                                                         */
/* ------------------------------------------------------------------ */

function weightedPick(candidates) {
  const weights = candidates.map(s => Math.max(0.05, Number(s.weight) || 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * Pick the next song from the pool honoring avoidance rules.
 * Relaxes artist avoidance first, then song avoidance, when the pool is exhausted.
 */
function pickNext(state, pool, cfg) {
  const recentSongIds = state.recentSongIds || [];
  const recentArtists = state.recentArtists || [];

  let candidates = pool.filter(s => !recentSongIds.includes(s.id) && !recentArtists.includes(s.artist));
  if (candidates.length === 0) {
    candidates = pool.filter(s => !recentSongIds.includes(s.id));
  }
  if (candidates.length === 0) {
    candidates = pool;
  }
  if (candidates.length === 0) {
    return null;
  }
  return weightedPick(candidates);
}

/* ------------------------------------------------------------------ */
/*  Engine operations                                                 */
/* ------------------------------------------------------------------ */

function enableAutodj(enabled) {
  const state = getState();
  state.enabled = !!enabled;
  state.updatedAt = new Date().toISOString();
  saveState(state);
  return state.enabled;
}

/** Generate up to `count` entries into the queue (respects active window). */
async function generateQueue(count = 5) {
  const cfg = getConfig();
  const state = getState();
  const activeNow = isActiveNow(cfg.activeHours);
  const result = { activeNow, generated: 0, reason: 'ok' };

  if (state.enabled && !activeNow) {
    result.reason = 'inactive_window';
    return result;
  }
  if (!state.enabled) {
    result.reason = 'disabled';
    return result;
  }

  const pool = await getPool();
  const existing = new Set(pendingQueue().map(e => e.songId));
  const freshPool = pool.filter(s => !existing.has(s.id));

  for (let i = 0; i < count; i++) {
    if (freshPool.length === 0) break;
    const pick = pickNext(state, freshPool, cfg);
    if (!pick) break;
    const entry = insert(QUEUE, {
      songId: pick.id,
      title: pick.title,
      artist: pick.artist,
      weight: Number(pick.weight) || 1,
      source: pick.source || 'pool',
      status: 'queued',
      createdAt: new Date().toISOString(),
    });
    freshPool.splice(freshPool.findIndex(s => s.id === pick.id), 1);
    // Trim recent history to avoid-window length
    state.recentSongIds = [...(state.recentSongIds || []), pick.id].slice(-Math.max(cfg.avoidSameSong, 1));
    if (pick.artist) {
      state.recentArtists = [...(state.recentArtists || []), pick.artist].slice(-Math.max(cfg.avoidSameArtist, 1));
    }
    state.stats = { ...(state.stats || {}), generated: (state.stats.generated || 0) + 1 };
    result.generated++;
    result.lastEntryId = entry.id;
  }

  state.lastGeneratedAt = new Date().toISOString();
  state.updatedAt = new Date().toISOString();
  saveState(state);
  return result;
}

/** Mark the next queued entry as played and return it (window-gated when enabled). */
async function advanceQueue() {
  const cfg = getConfig();
  const state = getState();
  if (state.enabled && !isActiveNow(cfg.activeHours)) {
    return { status: 'inactive_window', entry: null };
  }
  let queue = pendingQueue();
  if (queue.length === 0) {
    // Top up to low-water mark so playback never starves
    await generateQueue(cfg.lowWaterMark);
    queue = pendingQueue();
    if (queue.length === 0) return { status: 'empty', entry: null };
  }
  const next = queue[0];
  const now = new Date().toISOString();
  update(QUEUE, e => e.id === next.id, { status: 'played', playedAt: now });
  state.stats = { ...(state.stats || {}), played: (state.stats.played || 0) + 1 };
  state.updatedAt = now;
  saveState(state);
  return { status: 'played', entry: { ...next, status: 'played', playedAt: now } };
}

/** Clear queue and recent-history (stats kept). */
function resetAutodj() {
  remove(QUEUE, () => true);
  const state = getState();
  state.recentSongIds = [];
  state.recentArtists = [];
  state.updatedAt = new Date().toISOString();
  saveState(state);
  return { cleared: true };
}

function autodjStatus() {
  const cfg = getConfig();
  const state = getState();
  return {
    enabled: state.enabled,
    activeNow: isActiveNow(cfg.activeHours),
    activeHours: cfg.activeHours,
    config: { avoidSameSong: cfg.avoidSameSong, avoidSameArtist: cfg.avoidSameArtist, lowWaterMark: cfg.lowWaterMark },
    queueLength: pendingQueue().length,
    recentSongIds: state.recentSongIds || [],
    recentArtists: state.recentArtists || [],
    stats: state.stats || {},
    lastGeneratedAt: state.lastGeneratedAt || null,
    poolProvider: poolProvider ? 'custom' : 'default',
  };
}

/* ------------------------------------------------------------------ */
/*  HTTP API                                                          */
/* ------------------------------------------------------------------ */

const autodjRouter = Router();

autodjRouter.get('/status', (_req, res) => {
  res.json(autodjStatus());
});

autodjRouter.post('/enable', (req, res) => {
  const enabled = !!(req.body && req.body.enabled);
  res.json({ enabled: enableAutodj(enabled) });
});

autodjRouter.post('/generate', async (req, res) => {
  const count = Math.min(50, Math.max(1, parseInt((req.body && req.body.count) || 5, 10) || 5));
  const result = await generateQueue(count);
  res.json({ ...result, queueLength: pendingQueue().length });
});

autodjRouter.get('/queue', (_req, res) => {
  res.json({ entries: pendingQueue(), total: pendingQueue().length });
});

autodjRouter.post('/advance', async (_req, res) => {
  res.json(await advanceQueue());
});

autodjRouter.post('/reset', (_req, res) => {
  res.json(resetAutodj());
});

export {
  autodjRouter,
  parseActiveHourWindow,
  isActiveNow,
  setPoolProvider,
  getConfig,
  generateQueue,
  advanceQueue,
  resetAutodj,
  autodjStatus,
  weightedPick,
};
