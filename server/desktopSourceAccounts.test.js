import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const moduleUrl = new URL('./desktopSourceAccounts.js', import.meta.url).href;

function runWithStore(dataDir, secret, source) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding: 'utf8',
    env: {
      ...process.env,
      OPENMUSIC_DATA_DIR: dataDir,
      DESKTOP_CREDENTIAL_SECRET: secret,
    },
  }).trim();
}

test('desktop source accounts encrypt credentials and never expose them in account state', () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'jukeboxroom-desktop-accounts-'));
  const secret = 'd'.repeat(64);
  const cookie = 'uin=o123456789; skey=private-account-session';
  try {
    const saved = JSON.parse(runWithStore(dataDir, secret, `
      import { getDesktopSourceLogins, getDesktopSourceCookie, getDesktopSourceCookieForPlayback, getDesktopSourceSession, getDesktopMiguSession, isTrustedDesktopRequest, saveDesktopSourceCookie, saveDesktopSourceSession, saveDesktopMiguSession } from ${JSON.stringify(moduleUrl)};
      const qishuiPlaybackCookieBeforeLogin = getDesktopSourceCookieForPlayback('qishui');
      saveDesktopSourceCookie('tencent', ${JSON.stringify(cookie)});
      saveDesktopSourceSession({ ticket: 'private-qishui-ticket', userId: 'qishui-user' });
      saveDesktopMiguSession({ token: 'private-migu-token', pacmToken: 'private-migu-pacm-token' });
      const request = { headers: { host: '127.0.0.1:34567', origin: 'http://127.0.0.1:34567', 'sec-fetch-site': 'same-origin' }, socket: { remoteAddress: '127.0.0.1' } };
      const crossOrigin = { ...request, headers: { ...request.headers, origin: 'http://evil.example' } };
      console.log(JSON.stringify({ logins: getDesktopSourceLogins(), cookie: getDesktopSourceCookie('tencent'), tencentPlaybackCookie: getDesktopSourceCookieForPlayback('tencent'), qishuiPlaybackCookieBeforeLogin, qishuiPlaybackCookie: getDesktopSourceCookieForPlayback('qishui'), qishuiTicket: getDesktopSourceSession()?.ticket, miguPacmToken: getDesktopMiguSession()?.pacmToken, local: isTrustedDesktopRequest(request, 34567), crossOrigin: isTrustedDesktopRequest(crossOrigin, 34567) }));
    `));

    assert.deepEqual(saved.logins, { netease: false, tencent: true, kugou: false, qishui: true, migu: true });
    assert.equal(saved.cookie, cookie);
    assert.equal(saved.tencentPlaybackCookie, cookie);
    assert.equal(saved.qishuiPlaybackCookieBeforeLogin, '');
    assert.equal(saved.qishuiPlaybackCookie, '');
    assert.equal(saved.qishuiTicket, 'private-qishui-ticket');
    assert.equal(saved.miguPacmToken, 'private-migu-pacm-token');
    assert.equal(saved.local, true);
    assert.equal(saved.crossOrigin, false);
    const stored = readFileSync(path.join(dataDir, 'desktop_source_accounts.json'), 'utf8');
    assert.equal(stored.includes('private-account-session'), false);
    assert.equal(stored.includes('private-qishui-ticket'), false);
    assert.equal(stored.includes('private-migu-token'), false);
    assert.equal(stored.includes('private-migu-pacm-token'), false);

    const wrongKey = JSON.parse(runWithStore(dataDir, 'x'.repeat(64), `
      import { getDesktopSourceCookie } from ${JSON.stringify(moduleUrl)};
      let error = '';
      try { getDesktopSourceCookie('tencent'); } catch (cause) { error = cause.message; }
      console.log(JSON.stringify({ error }));
    `));
    assert.equal(wrongKey.error, '本机账号凭据无法解密，请重新登录');
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
