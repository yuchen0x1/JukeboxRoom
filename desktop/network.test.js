const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LOCAL_PROXY_BYPASS_RULES,
  configureDesktopSessionProxy,
} = require('./network');

test('keeps the system proxy but bypasses the embedded local server', async () => {
  const calls = [];
  const fakeSession = {
    defaultSession: {
      async setProxy(config) {
        calls.push(['setProxy', config]);
      },
      async closeAllConnections() {
        calls.push(['closeAllConnections']);
      },
    },
  };

  assert.equal(await configureDesktopSessionProxy(fakeSession), true);
  assert.deepEqual(calls, [
    ['setProxy', {
      mode: 'system',
      proxyBypassRules: LOCAL_PROXY_BYPASS_RULES,
    }],
    ['closeAllConnections'],
  ]);
  assert.match(LOCAL_PROXY_BYPASS_RULES, /localhost/);
  assert.match(LOCAL_PROXY_BYPASS_RULES, /127\.0\.0\.1/);
  assert.match(LOCAL_PROXY_BYPASS_RULES, /::1/);
});

test('does not block startup when Electron cannot apply proxy settings', async () => {
  const warnings = [];
  const fakeSession = {
    defaultSession: {
      async setProxy() {
        throw new Error('proxy unavailable');
      },
    },
  };

  assert.equal(await configureDesktopSessionProxy(fakeSession, {
    warn(message) {
      warnings.push(message);
    },
  }), false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /proxy unavailable/);
});
