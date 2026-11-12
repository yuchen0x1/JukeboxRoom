const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { createDesktopUpdater } = require('./updater');

class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.checkCalls = 0;
    this.downloadCalls = 0;
    this.installCalls = 0;
  }

  async checkForUpdates() {
    this.checkCalls += 1;
    return this.nextResult || null;
  }

  async downloadUpdate() {
    this.downloadCalls += 1;
    return [];
  }

  quitAndInstall() { this.installCalls += 1; }
}

class FakeCancellationToken extends EventEmitter {
  constructor() { super(); this.cancelled = false; }
  cancel() { this.cancelled = true; this.emit('cancel'); }
  dispose() { this.removeAllListeners(); }
}

test('unpackaged or unsupported environments never call electron-updater', async () => {
  const fake = new FakeUpdater();
  const updater = createDesktopUpdater({ updater: fake, supported: false, currentVersion: '0.0.14' });
  const state = await updater.check();
  assert.equal(fake.checkCalls, 0);
  assert.equal(state.state, 'not-available');
  assert.equal(state.supported, false);
});

test('uses the packaged fixed GitHub provider and emits safe state transitions', async () => {
  const fake = new FakeUpdater();
  const updater = createDesktopUpdater({ updater: fake, supported: true, currentVersion: '0.0.14' });
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  assert.deepEqual(packageJson.build.publish[0], {
    provider: 'github', owner: 'yuchen0x1', repo: 'JukeboxRoom', releaseType: 'release',
  });
  assert.equal(typeof fake.setFeedURL, 'undefined');
  assert.equal(fake.autoDownload, false);
  assert.equal(fake.autoInstallOnAppQuit, false);
  assert.equal(fake.allowPrerelease, false);

  fake.emit('checking-for-update');
  fake.emit('update-available', {
    version: '0.0.15',
    releaseNotes: '## 修复\n\n内容',
    releaseDate: '2026-11-12T00:00:00.000Z',
    files: [{ url: 'https://secret.example/update.exe', size: 2048 }],
  });
  let state = updater.getState();
  assert.equal(state.state, 'available');
  assert.equal(state.latestVersion, '0.0.15');
  assert.equal(state.releaseNotes, '## 修复\n\n内容');
  assert.equal(state.total, 2048);
  assert.equal('files' in state, false);

  fake.emit('download-progress', { percent: 42.4, bytesPerSecond: 1024, transferred: 1024, total: 4096 });
  state = updater.getState();
  assert.equal(state.state, 'downloading');
  assert.equal(state.percent, 42.4);
  assert.equal(state.transferred, 1024);

  fake.emit('update-downloaded', { version: '0.0.15', releaseNotes: 'done' });
  state = updater.getState();
  assert.equal(state.state, 'downloaded');
  assert.equal(updater.install(), true);
  assert.equal(fake.installCalls, 1);
});

test('check and download are de-duplicated and errors are sanitized', async () => {
  const fake = new FakeUpdater();
  fake.nextResult = { updateInfo: { version: '0.0.15', releaseNotes: 'new' } };
  const updater = createDesktopUpdater({ updater: fake, supported: true, currentVersion: '0.0.14' });
  const [first, second] = await Promise.all([updater.check(), updater.check()]);
  assert.equal(fake.checkCalls, 1);
  assert.equal(first.latestVersion, '0.0.15');
  assert.equal(second.latestVersion, '0.0.15');

  fake.emit('update-available', { version: '0.0.15' });
  const download = await updater.download();
  assert.equal(fake.downloadCalls, 1);
  assert.equal(download.state, 'downloading');
  fake.emit('error', new Error('https://token:secret@example.com/private-path'));
  assert.equal(updater.getState().state, 'error');
  assert.equal(updater.getState().error, '更新服务暂时不可用，请稍后重试。');
  assert.equal(updater.getState().error.includes('secret'), false);
});

test('supports user cancellation and leaves the offered update ready to retry', async () => {
  const fake = new FakeUpdater();
  fake.downloadUpdate = (token) => new Promise((resolve, reject) => {
    if (token.cancelled) reject(new Error('cancelled'));
    else token.once('cancel', () => reject(new Error('cancelled')));
  });
  const updater = createDesktopUpdater({
    updater: fake,
    supported: true,
    currentVersion: '0.0.14',
    createCancellationToken: () => new FakeCancellationToken(),
  });
  fake.emit('update-available', { version: '0.0.15' });
  const downloading = updater.download();
  assert.equal(updater.getState().state, 'downloading');
  assert.equal(updater.cancelDownload(), true);
  const state = await downloading;
  assert.equal(state.state, 'available');
  assert.equal(state.latestVersion, '0.0.15');
  assert.equal(updater.cancelDownload(), false);
});

test('automatically retries one failed download before reporting an error', async () => {
  const fake = new FakeUpdater();
  fake.downloadUpdate = async () => {
    fake.downloadCalls += 1;
    if (fake.downloadCalls === 1) throw new Error('temporary network failure');
    fake.emit('update-downloaded', { version: '0.0.15' });
    return [];
  };
  const updater = createDesktopUpdater({ updater: fake, supported: true, currentVersion: '0.0.14' });
  fake.emit('update-available', { version: '0.0.15' });

  const state = await updater.download();

  assert.equal(fake.downloadCalls, 2);
  assert.equal(state.state, 'downloaded');
  assert.equal(state.latestVersion, '0.0.15');
});
