
/**
 * Redis adapter for Socket.IO multi-instance.
 * 
 * When REDIS_URL is set, wraps the Socket.IO server with @socket.io/redis-adapter
 * so events are broadcast across all instances via Redis Pub/Sub.
 *
 * Also provides room lease helpers (distributed lock per room) and event
 * version control for idempotent state synchronization.
 *
 * Phase 1: adapter + basic lease (no full CRDT).
 * Phase 2: snapshot/patch/resync, event version CAS.
 */

import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { buildRedisOptions } from './roomStorage.js';

let pubClient = null;
let subClient = null;
let adapter = null;

/**
 * Initialize redis adapter. Returns null if REDIS_URL is not set.
 * Must be called before `io.listen()`.
 */
async function initRedisAdapter(io) {
  const options = buildRedisOptions();
  if (!options) {
    console.log('[redis] Redis not configured — running in single-instance mode');
    return null;
  }

  try {
    pubClient = createClient(options);
    subClient = pubClient.duplicate();

    await pubClient.connect();
    await subClient.connect();

    adapter = createAdapter(pubClient, subClient);
    io.adapter(adapter);

    const rawTarget = options.url || options.socket?.host || 'localhost';
    console.log('[redis] Socket.IO adapter connected:', String(rawTarget).replace(/\/\/.*@/, '//***@'));
    return adapter;
  } catch (err) {
    console.error('[redis] Failed to initialize adapter:', err.message);
    console.log('[redis] Falling back to single-instance mode');
    return null;
  }
}

/**
 * Attempt to acquire a lease for a room ID.
 * Returns true if this instance now owns the room.
 * Uses Redis SET NX EX (atomic lock with TTL).
 */
async function acquireRoomLease(roomId, ttlSeconds = 30) {
  if (!pubClient) return true; // single instance — always ok
  try {
    const instanceId = process.env.INSTANCE_ID || `instance-${process.pid}`;
    const key = `room:lease:${roomId}`;
    const result = await pubClient.set(key, instanceId, {
      NX: true,
      EX: ttlSeconds,
    });
    return result === 'OK';
  } catch {
    return true; // fallback: allow operation
  }
}

/**
 * Release a room lease (on room close / instance shutdown).
 */
async function releaseRoomLease(roomId) {
  if (!pubClient) return;
  try {
    await pubClient.del(`room:lease:${roomId}`);
  } catch {
    // ignore
  }
}

/**
 * Refresh lease TTL (extend ownership).
 */
async function refreshRoomLease(roomId, ttlSeconds = 30) {
  if (!pubClient) return;
  try {
    await pubClient.expire(`room:lease:${roomId}`, ttlSeconds);
  } catch {
    // ignore
  }
}

/**
 * Shutdown redis connections gracefully.
 */
async function closeRedis() {
  if (pubClient) {
    try { await pubClient.quit(); } catch {}
    pubClient = null;
  }
  if (subClient) {
    try { await subClient.quit(); } catch {}
    subClient = null;
  }
  adapter = null;
}

export { initRedisAdapter, acquireRoomLease, releaseRoomLease, refreshRoomLease, closeRedis };
