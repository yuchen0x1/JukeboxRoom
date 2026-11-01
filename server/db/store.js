/**
 * Lightweight JSON file store for development/startup.
 * Replace with PostgreSQL in production (Phase 2).
 * Stores data as JSON files in server/data/ directory.
 *
 * Reads and writes use the same cross-process collection lock. Compound helpers
 * are safe for small single-host deployments, but this synchronous JSON store
 * is not a replacement for a transactional database.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(process.env.OPENMUSIC_DATA_DIR || path.join(__dirname, '..', 'data'));
const LOCK_RETRY_MS = 10;
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_STALE_MS = 60_000;
const BACKUP_SUFFIX = '.bak';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function filePath(collection) {
  const safe = String(collection).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) throw new Error('数据集合名称无效');
  return path.join(DATA_DIR, `${safe}.json`);
}

function lockPath(collection) {
  return `${filePath(collection)}.lock`;
}

function sleepSync(milliseconds) {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, milliseconds);
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readLockMetadata(lockFile) {
  try {
    const metadata = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    return metadata && typeof metadata === 'object' ? metadata : null;
  } catch {
    return null;
  }
}

function lockIsStale(lockFile) {
  let stat;
  try {
    stat = fs.statSync(lockFile);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  const metadata = readLockMetadata(lockFile);
  const createdAt = Number(metadata?.createdAt);
  const timestamp = Number.isFinite(createdAt) ? createdAt : stat.mtimeMs;
  if (Date.now() - timestamp <= LOCK_STALE_MS) return false;
  // Do not remove an old lock held by a live process (long synchronous work).
  return !processIsAlive(Number(metadata?.pid));
}

function withCollectionLock(collection, operation) {
  const lockFile = lockPath(collection);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let lockHandle = null;
  let lockToken = null;

  while (lockHandle === null) {
    try {
      lockHandle = fs.openSync(lockFile, 'wx');
      lockToken = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      fs.writeFileSync(lockHandle, JSON.stringify({ pid: process.pid, createdAt: Date.now(), token: lockToken }), 'utf8');
      try { fs.fsyncSync(lockHandle); } catch { /* best effort */ }
    } catch (error) {
      if (lockHandle !== null) {
        fs.closeSync(lockHandle);
        lockHandle = null;
      }
      const contended = error.code === 'EEXIST'
        || error.code === 'EPERM'
        || (error.code === 'EACCES' && fs.existsSync(lockFile));
      // Windows can report EPERM briefly while another process is replacing or
      // deleting the lock file. Treat that observable lock race as contention;
      // a genuine permission error with no lock remains fatal.
      if (!contended) throw error;
      if (lockIsStale(lockFile)) {
        try { fs.rmSync(lockFile, { force: true }); } catch (removeError) {
          if (removeError.code !== 'ENOENT') throw removeError;
        }
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`等待数据文件锁超时: ${collection}`);
      sleepSync(LOCK_RETRY_MS);
    }
  }

  try {
    return operation();
  } finally {
    fs.closeSync(lockHandle);
    // Never delete a replacement lock acquired after this lock was released.
    if (readLockMetadata(lockFile)?.token === lockToken) fs.rmSync(lockFile, { force: true });
  }
}

function parseCollectionFile(target) {
  const raw = fs.readFileSync(target, 'utf8').trim();
  const data = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(data)) throw new Error(`数据文件格式无效: ${target}`);
  return data;
}

function replaceFile(temp, target) {
  try {
    fs.renameSync(temp, target);
    return;
  } catch (error) {
    if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error.code)) throw error;
  }
  // Windows cannot reliably rename over an existing file. The collection lock
  // protects readers during this short replacement gap.
  fs.rmSync(target, { force: true });
  fs.renameSync(temp, target);
}

function writeSerialized(target, serialized) {
  const temp = `${target}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  const backup = `${target}${BACKUP_SUFFIX}`;
  let handle = null;
  try {
    handle = fs.openSync(temp, 'wx');
    fs.writeFileSync(handle, serialized, 'utf8');
    try { fs.fsyncSync(handle); } catch { /* best effort */ }
    fs.closeSync(handle);
    handle = null;
    if (fs.existsSync(target)) fs.copyFileSync(target, backup);
    replaceFile(temp, target);
  } finally {
    if (handle !== null) fs.closeSync(handle);
    fs.rmSync(temp, { force: true });
  }
}

function readAllUnlocked(collection) {
  const target = filePath(collection);
  let targetError = null;
  try {
    return parseCollectionFile(target);
  } catch (error) {
    if (error.code !== 'ENOENT') targetError = error;
  }

  try {
    const backup = `${target}${BACKUP_SUFFIX}`;
    const recovered = parseCollectionFile(backup);
    const recoveryTemp = `${target}.${process.pid}.${Date.now()}.recovery.tmp`;
    try {
      fs.copyFileSync(backup, recoveryTemp);
      replaceFile(recoveryTemp, target);
    } finally {
      fs.rmSync(recoveryTemp, { force: true });
    }
    return recovered;
  } catch (backupError) {
    if (targetError) throw targetError;
    if (backupError.code === 'ENOENT') return [];
    throw backupError;
  }
}

function readAll(collection) {
  return withCollectionLock(collection, () => readAllUnlocked(collection));
}

function writeAll(collection, data) {
  if (!Array.isArray(data)) throw new TypeError('数据集合必须是数组');
  writeSerialized(filePath(collection), JSON.stringify(data, null, 2));
}

function makeDocument(record) {
  const now = new Date().toISOString();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
    ...record,
  };
}

function insert(collection, record) {
  return withCollectionLock(collection, () => {
    const records = readAllUnlocked(collection);
    const doc = makeDocument(record);
    records.push(doc);
    writeAll(collection, records);
    return doc;
  });
}

/** Atomically insert when no record matches predicate. */
function insertUnique(collection, record, predicate) {
  if (typeof predicate !== 'function') throw new TypeError('insertUnique 需要 predicate 函数');
  return withCollectionLock(collection, () => {
    const records = readAllUnlocked(collection);
    const existing = records.find(predicate) || null;
    if (existing) return { inserted: false, record: existing };
    const doc = makeDocument(record);
    records.push(doc);
    writeAll(collection, records);
    return { inserted: true, record: doc };
  });
}

function find(collection, predicate = () => true) {
  return readAll(collection).filter(predicate);
}

function findOne(collection, predicate = () => true) {
  return readAll(collection).find(predicate) || null;
}

function applyUpdates(record, updates) {
  const patch = typeof updates === 'function' ? updates(record) : updates;
  if (patch && typeof patch === 'object') Object.assign(record, patch);
  record.updatedAt = new Date().toISOString();
}

/** Atomically find and update one record (or all with { multi: true }). */
function findAndUpdate(collection, predicate, updates, { multi = false } = {}) {
  if (typeof predicate !== 'function') throw new TypeError('findAndUpdate 需要 predicate 函数');
  return withCollectionLock(collection, () => {
    const records = readAllUnlocked(collection);
    const matched = [];
    for (const record of records) {
      if (predicate(record)) {
        matched.push(record);
        if (!multi) break;
      }
    }
    for (const record of matched) applyUpdates(record, updates);
    if (matched.length > 0) writeAll(collection, records);
    return { matched: matched.length, updated: matched.length, records: matched };
  });
}

function update(collection, predicate, updates) {
  return findAndUpdate(collection, predicate, updates, { multi: true }).updated;
}

function remove(collection, predicate) {
  return withCollectionLock(collection, () => {
    const records = readAllUnlocked(collection);
    const remaining = records.filter((record) => !predicate(record));
    const removed = records.length - remaining.length;
    if (removed > 0) writeAll(collection, remaining);
    return removed;
  });
}

function all(collection) {
  return readAll(collection);
}

export { insert, insertUnique, find, findOne, findAndUpdate, update, remove, all, DATA_DIR };
