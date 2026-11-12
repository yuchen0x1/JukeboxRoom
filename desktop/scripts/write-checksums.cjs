const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function writeChecksums(
  directory = path.resolve(__dirname, '..', '..', 'release', 'desktop'),
  version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version,
) {
  const installer = `jukeboxroom-desktop-setup-${version}-x64.exe`;
  const files = [installer, `${installer}.blockmap`, 'latest.yml'];
  const missing = files.filter((name) => !fs.existsSync(path.join(directory, name)));
  if (missing.length) throw new Error(`Expected release assets are missing: ${missing.join(', ')}`);

  const lines = files.map((name) => {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex');
    return `${hash}  ${name}`;
  });
  const manifestPath = path.join(directory, 'SHA256SUMS.txt');
  fs.writeFileSync(manifestPath, `${lines.join('\n')}\n`, 'utf8');
  return { manifestPath, files };
}

if (require.main === module) {
  const result = writeChecksums(process.argv[2] ? path.resolve(process.argv[2]) : undefined, process.argv[3]);
  process.stdout.write(`Wrote ${path.basename(result.manifestPath)} for ${result.files.length} release assets.\n`);
}

module.exports = { writeChecksums };
