import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { all, insert, insertUnique, remove, DATA_DIR } from './store.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const storePath = new URL('./store.js', import.meta.url).href;

function runChild(dataDir, source) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
      cwd: path.resolve(moduleDir, '..', '..'),
      env: { ...process.env, OPENMUSIC_DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0
      ? resolve(JSON.parse(output.trim()))
      : reject(new Error(`child exited ${code}: ${error || output}`)));
  });
}

test('insertUnique serializes check-and-insert across processes', async () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'openmusic-store-'));
  const source = `import { insertUnique } from ${JSON.stringify(storePath)};
const result = insertUnique('users', { username: 'same' }, (entry) => entry.username === 'same');
console.log(JSON.stringify({ inserted: result.inserted, id: result.record.id }));`;
  const results = await Promise.all(Array.from({ length: 8 }, () => runChild(dataDir, source)));
  assert.equal(results.filter((result) => result.inserted).length, 1);
  assert.equal(new Set(results.map((result) => result.id)).size, 1);
  assert.equal(JSON.parse(readFileSync(path.join(dataDir, 'users.json'), 'utf8')).length, 1);
  rmSync(dataDir, { recursive: true, force: true });
});

test('corrupt collection recovers from the previous backup', () => {
  const name = `store-recovery-${Date.now()}`;
  // 必须与 store.js 的 DATA_DIR 一致：测试可用 OPENMUSIC_DATA_DIR 重定向数据目录
  const target = path.join(DATA_DIR, `${name}.json`);
  insert(name, { value: 'first' });
  insert(name, { value: 'second' });
  writeFileSync(target, '{not-json', 'utf8');
  assert.deepEqual(all(name).map((record) => record.value), ['first']);
  remove(name, () => true);
  rmSync(target, { force: true });
  rmSync(`${target}.bak`, { force: true });
});
