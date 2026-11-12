const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { findBundledRcedit } = require('./afterPack.cjs');

test('finds the electron-winstaller bundled rcedit executable', () => {
  const rcedit = findBundledRcedit();
  assert.ok(rcedit, 'expected electron-winstaller to provide its bundled rcedit.exe');
  assert.equal(path.basename(rcedit).toLowerCase(), 'rcedit.exe');
  assert.equal(fs.statSync(rcedit).isFile(), true);
});
