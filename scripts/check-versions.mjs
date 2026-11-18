import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const readJson = (name) => JSON.parse(read(name));
const { version } = readJson('package.json');
assert.match(version, /^\d+\.\d+\.\d+$/);

for (const dir of ['', 'client/', 'server/', 'desktop/']) {
  const manifest = readJson(`${dir}package.json`);
  const lock = readJson(`${dir}package-lock.json`);
  assert.equal(manifest.version, version, `${dir}package.json`);
  assert.equal(lock.version, version, `${dir}package-lock.json`);
  assert.equal(lock.packages[''].version, version, `${dir}package-lock.json root package`);
}

const android = read('client/android/app/build.gradle');
assert.equal(android.match(/^\s*versionName "([^"]+)"/m)?.[1], version, 'Android versionName');
const ios = read('client/ios/App/App.xcodeproj/project.pbxproj');
const iosVersions = [...ios.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((match) => match[1]);
assert.ok(iosVersions.length > 0, 'iOS marketing version is missing');
for (const iosVersion of iosVersions) assert.equal(iosVersion, version, 'iOS MARKETING_VERSION');
if (process.argv[2]) assert.equal(process.argv[2], `v${version}`, 'Release tag');
console.log(`Version metadata matches v${version}`);
