import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { copyServerFiles, isServerPackageEntry } from './package-server.mjs';

test('server bundle keeps runtime files and excludes local credentials, stores and tests', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jukeboxroom-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  const allowed = ['index.js', 'auth/index.js', 'package.json', 'package-lock.json', '.env.example'];
  const excluded = ['.env', '.env.production', '.qishui-device', 'data/users.json',
    'data_quarantine/users.json', 'data_quarantine2/leak.js', 'data-backup/session.js',
    'downloads/app.apk', 'node_modules/pkg/index.js', 'test/fixture.js', 'tests/fixture.js',
    'auth/auth.test.js', 'auth/auth.spec.js', 'debug.log', 'users.json.bak', 'local.json', 'signing.pfx'];
  for (const name of [...allowed, ...excluded]) {
    fs.mkdirSync(path.dirname(path.join(source, name)), { recursive: true });
    fs.writeFileSync(path.join(source, name), 'synthetic fixture');
  }
  copyServerFiles(source, target);
  for (const name of allowed) assert.ok(fs.existsSync(path.join(target, name)), name);
  for (const name of excluded) assert.ok(!fs.existsSync(path.join(target, name)), name);
});

test('Windows installer uses the same source-only boundary and preserves runtime modules', () => {
  const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url));
  const { minimatch } = requireDesktop('minimatch');
  const config = JSON.parse(fs.readFileSync(new URL('../desktop/package.json', import.meta.url)));
  const patterns = config.build.extraResources.find((entry) => entry.to === 'server').filter;
  const included = (name) => patterns.some((pattern) => !pattern.startsWith('!') && minimatch(name, pattern, { dot: true }))
    && !patterns.some((pattern) => pattern.startsWith('!') && minimatch(name, pattern.slice(1), { dot: true }));
  const allowed = ['index.js', 'db/store.js', 'auth/index.js', '.env.example', 'package.json', 'package-lock.json'];
  const excluded = ['.env', '.env.local', '.qishui-device', 'data/users.json', 'data_quarantine/auth.js',
    'data_quarantine2/users.json', 'downloads/app.apk', 'test/fixture.js', 'auth/auth.test.js',
    'nested/node_modules/pkg/index.js', '.local/identity.js', 'private.key'];
  for (const name of allowed) assert.ok(included(name), name);
  for (const name of excluded) assert.ok(!included(name), name);
  for (const name of [...allowed, ...excluded]) assert.equal(included(name), isServerPackageEntry(name, false), name);
  const serverRoot = new URL('../server/', import.meta.url);
  for (const entry of fs.readdirSync(serverRoot, { recursive: true })) {
    const normalized = entry.replaceAll('\\', '/');
    if (normalized.includes('node_modules/') || !normalized.endsWith('.js')) continue;
    assert.equal(included(normalized), isServerPackageEntry(normalized, false), normalized);
  }
});
