// Never let destructive test fixtures use a developer's real JSON collections.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runRoot = path.join(root, '.evolution');
fs.mkdirSync(runRoot, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(runRoot, 'test-data-'));
let status = 1;
try {
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...process.argv.slice(2)], {
    cwd: path.join(root, 'server'),
    stdio: 'inherit',
    env: { ...process.env, OPENMUSIC_DATA_DIR: dataDir, REDIS_URL: '', REDIS_HOST: '' },
  });
  if (result.error) console.error(result.error.message);
  status = result.status ?? 1;
} finally {
  // Only remove the unique disposable directory created by this invocation.
  if (path.dirname(dataDir) !== runRoot || !path.basename(dataDir).startsWith('test-data-')) {
    throw new Error('Refusing to clean a test directory outside the project test workspace');
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exitCode = status;
