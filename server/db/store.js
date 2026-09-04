
/**
 * Lightweight JSON file store for development/startup.
 * Replace with PostgreSQL in production (Phase 2).
 * Stores data as JSON files in server/data/ directory.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(process.env.OPENMUSIC_DATA_DIR || path.join(__dirname, '..', 'data'));
const LOCK_RETRY_MS = 10;
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_STALE_MS = 60_000;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(collection) {
  const safe = collection.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(DATA_DIR, `${safe}.json`);
}

function lockPath(collection) {
  return `${filePath(collection)}.lock`;
}

function sleepSync(milliseconds) {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, milliseconds);
}

function withCollectionLock(collection, operation) {
  const lockFile = lockPath(collection);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let lockHandle = null;

  while (!lockHandle) {
    try {
      lockHandle = fs.openSync(lockFile, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      try {
        const lockStat = fs.statSync(lockFile);
        if (Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
          fs.rmSync(lockFile, { force: true });
          continue;
        }
      } catch (statError) {
        if (statError.code !== 'ENOENT') throw statError;
        continue;
      }

      if (Date.now() >= deadline) {
        throw new Error(`等待数据文件锁超时: ${collection}`);
      }
      sleepSync(LOCK_RETRY_MS);
    }
  }

  try {
    return operation();
  } finally {
    fs.closeSync(lockHandle);
    fs.rmSync(lockFile, { force: true });
  }
}

function readAll(collection) {
  const fp = filePath(collection);
  try {
    const raw = fs.readFileSync(fp, 'utf-8').trim();
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

function writeAll(collection, data) {
  const target = filePath(collection);
  const temp = `${target}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  const serialized = JSON.stringify(data, null, 2);

  // Finish the write in a temporary file before replacing the collection.
  // This prevents a process crash from leaving a partially-written JSON file.
  try {
    fs.writeFileSync(temp, serialized, 'utf-8');
    try {
      fs.renameSync(temp, target);
    } catch (error) {
      // Windows does not replace an existing file with renameSync reliably.
      if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error.code)) throw error;
      fs.rmSync(target, { force: true });
      fs.renameSync(temp, target);
    }
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

/** Insert one record (auto-generates id + timestamps) */
function insert(collection, record) {
  return withCollectionLock(collection, () => {
    const records = readAll(collection);
    const doc = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...record,
    };
    records.push(doc);
    writeAll(collection, records);
    return doc;
  });
}

/** Find records matching a predicate */
function find(collection, predicate) {
  return readAll(collection).filter(predicate);
}

/** Find first record matching predicate */
function findOne(collection, predicate) {
  return readAll(collection).find(predicate) || null;
}

/** Update records matching predicate */
function update(collection, predicate, updates) {
  return withCollectionLock(collection, () => {
    const records = readAll(collection);
    let count = 0;
    for (const record of records) {
      if (predicate(record)) {
        Object.assign(record, updates, { updatedAt: new Date().toISOString() });
        count++;
      }
    }
    writeAll(collection, records);
    return count;
  });
}

/** Delete records matching predicate */
function remove(collection, predicate) {
  return withCollectionLock(collection, () => {
    const records = readAll(collection);
    const before = records.length;
    const remaining = records.filter(r => !predicate(r));
    writeAll(collection, remaining);
    return before - remaining.length;
  });
}

function all(collection) {
  return readAll(collection);
}

export { insert, find, findOne, update, remove, all, DATA_DIR };
