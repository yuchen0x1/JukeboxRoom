import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const moduleUrl = new URL('./sourceAccounts.js', import.meta.url).href;

function runWithStore(dataDir, source) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding: 'utf8',
    env: {
      ...process.env,
      OPENMUSIC_DATA_DIR: dataDir,
      // 每个进程独立派生，验证密钥来自落盘的 .secrets.json 而非内存
      CLIENT_ID_SECRET: '',
      SOURCE_CREDENTIAL_SECRET: '',
    },
  }).trim();
}

test('本机音乐账号在进程重启后仍保持登录（刷新页面 / 重建房间不再掉登录）', () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'jukeboxroom-source-accounts-'));
  const cookie = 'MUSIC_U=private-netease-session; __csrf=abc';
  try {
    const first = JSON.parse(runWithStore(dataDir, `
      import { getSourceAccountLogins, saveSourceAccountCookie } from ${JSON.stringify(moduleUrl)};
      saveSourceAccountCookie('netease', ${JSON.stringify(cookie)});
      console.log(JSON.stringify({ logins: getSourceAccountLogins() }));
    `));
    assert.deepEqual(first.logins, { netease: true, tencent: false, kugou: false, qishui: false });

    // 新进程 = 服务端重启 / 房间已销毁
    const restarted = JSON.parse(runWithStore(dataDir, `
      import { getSourceAccountLogins, getSourceAccountCredential } from ${JSON.stringify(moduleUrl)};
      console.log(JSON.stringify({ logins: getSourceAccountLogins(), cookie: getSourceAccountCredential('netease')?.cookie }));
    `));
    assert.deepEqual(restarted.logins, { netease: true, tencent: false, kugou: false, qishui: false });
    assert.equal(restarted.cookie, cookie);

    const stored = readFileSync(path.join(dataDir, 'music_source_accounts.json'), 'utf8');
    assert.equal(stored.includes('private-netease-session'), false);

    const removed = JSON.parse(runWithStore(dataDir, `
      import { getSourceAccountLogins, getSourceAccountCredential, removeSourceAccount } from ${JSON.stringify(moduleUrl)};
      const removed = removeSourceAccount('netease');
      console.log(JSON.stringify({ removed, logins: getSourceAccountLogins(), cookie: getSourceAccountCredential('netease') }));
    `));
    assert.equal(removed.removed, true);
    assert.deepEqual(removed.logins, { netease: false, tencent: false, kugou: false, qishui: false });
    assert.equal(removed.cookie, null);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('汽水会话独立加密存储，并拒绝无效凭据', () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'jukeboxroom-source-qishui-'));
  try {
    const saved = JSON.parse(runWithStore(dataDir, `
      import { getSourceAccountLogins, getSourceAccountCredential, saveSourceAccountSession } from ${JSON.stringify(moduleUrl)};
      saveSourceAccountSession({ ticket: 'private-qishui-ticket', userId: 'u1' });
      let error = '';
      try { saveSourceAccountSession({}); } catch (cause) { error = cause.message; }
      console.log(JSON.stringify({ logins: getSourceAccountLogins(), ticket: getSourceAccountCredential('qishui')?.session?.ticket, error }));
    `));
    assert.deepEqual(saved.logins, { netease: false, tencent: false, kugou: false, qishui: true });
    assert.equal(saved.ticket, 'private-qishui-ticket');
    assert.equal(saved.error, '汽水账号会话无效，请重新扫码登录');

    const stored = readFileSync(path.join(dataDir, 'music_source_accounts.json'), 'utf8');
    assert.equal(stored.includes('private-qishui-ticket'), false);

    const invalid = JSON.parse(runWithStore(dataDir, `
      import { saveSourceAccountCookie } from ${JSON.stringify(moduleUrl)};
      let tencent = '';
      let netease = '';
      try { saveSourceAccountCookie('tencent', 'skey=only-skey'); } catch (cause) { tencent = cause.message; }
      try { saveSourceAccountCookie('netease', 'foo=bar'); } catch (cause) { netease = cause.message; }
      console.log(JSON.stringify({ tencent, netease }));
    `));
    assert.equal(invalid.tencent, '没有取得有效的账号会话，请重新登录');
    assert.equal(invalid.netease, '没有取得有效的账号会话，请重新登录');
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
