import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.join(root, '.evolution');
fs.mkdirSync(workspace, { recursive: true });

for (const fail of [false, true]) {
  test(`server test runner isolates inherited data paths and cleans after ${fail ? 'failure' : 'success'}`, () => {
    const fixture = fs.mkdtempSync(path.join(workspace, 'runtime-isolation-'));
    const sentinelDir = path.join(fixture, 'original-data');
    fs.mkdirSync(sentinelDir);
    const sentinel = path.join(sentinelDir, 'sentinel.json');
    const content = '[{"id":"keep-this-record"}]';
    fs.writeFileSync(sentinel, content);
    const probe = path.join(fixture, 'probe.test.mjs');
    fs.writeFileSync(probe, `
import assert from 'node:assert/strict';
import { all, remove, DATA_DIR } from ${JSON.stringify(new URL('../server/db/store.js', import.meta.url).href)};
console.log('TEST_DATA_PATH=' + DATA_DIR);
assert.notEqual(DATA_DIR, ${JSON.stringify(sentinelDir)});
assert.equal(process.env.REDIS_URL, '');
assert.equal(process.env.REDIS_HOST, '');
assert.deepEqual(all('sentinel'), []);
remove('sentinel', () => true);
${fail ? "assert.fail('intentional fixture failure');" : ''}
`);
    try {
      const fixtureEnv = { ...process.env, OPENMUSIC_DATA_DIR: sentinelDir, REDIS_URL: 'redis://fixture.invalid', REDIS_HOST: 'fixture.invalid' };
      // This child is a new CLI invocation, not a nested node:test worker.
      delete fixtureEnv.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, [path.join(root, 'scripts/test-server.mjs'), probe], {
        cwd: root, encoding: 'utf8', env: fixtureEnv,
      });
      assert.equal(result.status, fail ? 1 : 0, result.stdout + result.stderr);
      assert.equal(fs.readFileSync(sentinel, 'utf8'), content);
      const isolated = result.stdout.match(/TEST_DATA_PATH=([^\r\n]+)/)?.[1];
      assert.ok(isolated, result.stdout);
      assert.equal(path.dirname(isolated), workspace);
      assert.equal(fs.existsSync(isolated), false, 'Disposable data should be removed after test completion');
    } finally {
      assert.equal(path.dirname(fixture), workspace);
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });
}
