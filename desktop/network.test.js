const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LOCAL_PROXY_BYPASS_RULES,
  DOMESTIC_MUSIC_DIRECT_SUFFIXES,
  buildDesktopProxyBypassRules,
  mergeDomesticMusicNoProxy,
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
      proxyBypassRules: buildDesktopProxyBypassRules(),
    }],
    ['closeAllConnections'],
  ]);
  assert.match(LOCAL_PROXY_BYPASS_RULES, /localhost/);
  assert.match(LOCAL_PROXY_BYPASS_RULES, /127\.0\.0\.1/);
  assert.match(LOCAL_PROXY_BYPASS_RULES, /::1/);
});

test('bypass rules force domestic music CDNs to connect directly', () => {
  const rules = buildDesktopProxyBypassRules();
  // 以本机服务开头，随后是国内音源域名（含子域通配与根域两种写法）
  assert.ok(rules.startsWith(`${LOCAL_PROXY_BYPASS_RULES},`));
  for (const suffix of DOMESTIC_MUSIC_DIRECT_SUFFIXES) {
    assert.match(rules, new RegExp(`\\*\\.${suffix.replace(/\./g, '\\.')}`), `missing wildcard for ${suffix}`);
    assert.match(rules, new RegExp(`(^|,)${suffix.replace(/\./g, '\\.')}(,|$)`), `missing root host for ${suffix}`);
  }
  // 覆盖各音源的关键域名
  assert.match(rules, /\*\.126\.net/);
  assert.match(rules, /\*\.163\.com/);
  assert.match(rules, /\*\.qq\.com/);
  assert.match(rules, /\*\.gtimg\.com/);
  assert.match(rules, /\*\.kugou\.com/);
  assert.match(rules, /\*\.migu\.cn/);
  assert.match(rules, /\*\.douyinpic\.com/);
});

test('NO_PROXY merge keeps existing entries and appends music suffixes', () => {
  const merged = mergeDomesticMusicNoProxy(['localhost,.internal', 'migu.cn', '']);
  assert.match(merged, /localhost/);
  assert.match(merged, /\.internal/);
  assert.match(merged, /migu\.cn/);
  assert.match(merged, /126\.net/);
  // 无重复
  const parts = merged.split(',');
  assert.equal(new Set(parts).size, parts.length);
  assert.equal(mergeDomesticMusicNoProxy(null), DOMESTIC_MUSIC_DIRECT_SUFFIXES.join(','));
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
