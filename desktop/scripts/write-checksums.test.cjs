const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { writeChecksums } = require('./write-checksums.cjs');

test('writes SHA-256 checksums for installer, blockmap and updater metadata', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukeboxroom-checksums-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const artifacts = {
    'jukeboxroom-desktop-setup-1.2.3-x64.exe': 'installer',
    'jukeboxroom-desktop-setup-1.2.3-x64.exe.blockmap': 'blockmap',
    'latest.yml': 'metadata',
    'jukeboxroom-desktop-setup-0.0.13-x64.exe': 'old installer',
  };
  for (const [name, contents] of Object.entries(artifacts)) fs.writeFileSync(path.join(directory, name), contents);

  const { files, manifestPath } = writeChecksums(directory, '1.2.3');
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  assert.equal(files.length, 3);
  for (const [name, contents] of Object.entries(artifacts).slice(0, 3)) {
    const expected = crypto.createHash('sha256').update(contents).digest('hex');
    assert.match(manifest, new RegExp(`^${expected}  ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }
});
