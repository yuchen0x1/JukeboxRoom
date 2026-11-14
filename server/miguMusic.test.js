import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { mock } from 'node:test';
import {
  decodeMiguSongId,
  encodeMiguSongId,
  extractPacmToken,
  extractToken,
  loginMiguByPhone,
  passportFailed,
  requestMiguSmsCode,
} from './miguMusic.js';

test('migu song ids preserve content and copyright ids', () => {
  const id = encodeMiguSongId('600902000006889366', '60054701923');
  assert.equal(id, '600902000006889366|60054701923');
  assert.deepEqual(decodeMiguSongId(id), {
    contentId: '600902000006889366',
    copyrightId: '60054701923',
  });
});

test('migu song ids reject malformed or oversized values', () => {
  assert.throws(() => decodeMiguSongId('only-content'), /歌曲标识无效/);
  assert.throws(() => encodeMiguSongId('bad|id', 'copyright'), /歌曲标识无效/);
});

test('migu passport success envelope yields token from result.token', () => {
  const envelope = { status: 2000, message: '', header: { resultcode: '104000' }, result: { token: 'STnidabc123' } };
  assert.equal(passportFailed(envelope), false);
  assert.equal(extractToken(envelope), 'STnidabc123');
});

test('migu passport failure envelope is detected and carries no token', () => {
  const envelope = { status: 4005, message: '短信验证码错误或已失效', header: { resultcode: '104212' }, result: {} };
  assert.equal(passportFailed(envelope), true);
  assert.equal(extractToken(envelope), '');
});

test('extractPacmToken prefers response header and falls back to set-cookie', () => {
  const withHeader = new Response(null, { headers: { pacmtoken: 'HEADERVALUE' } });
  assert.equal(extractPacmToken(withHeader), 'HEADERVALUE');

  const withCookie = new Response(null, {
    headers: { 'Set-Cookie': 'pacmtoken=COOKIEVALUE; Path=/; Expires=Sun, 12-Jul-26 07:20:32 GMT' },
  });
  assert.equal(extractPacmToken(withCookie), 'COOKIEVALUE');

  const withNeither = new Response(null, {
    headers: { 'Set-Cookie': 'other=x; Path=/' },
  });
  assert.equal(extractPacmToken(withNeither), '');
});

// ------------------------------------------------------------------
// 登录流程回归：真实接口行为见 miguMusic.js 顶部注释。
// 短信验证码与发码会话（Cookie + 指纹）绑定，且 ST 令牌一次性。
// ------------------------------------------------------------------

const keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
const passportJwk = keyPair.publicKey.export({ format: 'jwk' });
const PASSPORT_MODULUS = Buffer.from(passportJwk.n, 'base64url').toString('hex');
const PASSPORT_EXPONENT = Buffer.from(passportJwk.e, 'base64url').toString('hex');

function jsonResponse(body, headers = {}, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function installFetchMock(t, handler) {
  const calls = [];
  const stub = mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  });
  t.after(() => stub.mock.restore());
  return calls;
}

function formField(init, name) {
  const params = new URLSearchParams(String(init?.body || ''));
  return params.get(name) || '';
}

function headerValue(init, name) {
  const headers = new Headers(init?.headers || {});
  return headers.get(name) || '';
}

function routePassport({ smsBody, authnBody, validateBody, validateHeaders }) {
  return async (url) => {
    const path = new URL(url).pathname;
    if (path === '/login') {
      // 预热下发会话 Cookie（真实通行证行为），后续请求必须原样携带
      return new Response('<html>login page</html>', {
        headers: { 'Content-Type': 'text/html', 'Set-Cookie': 'JSESSIONID=session-abc; Path=/' },
      });
    }
    if (path === '/password/publickey') {
      return jsonResponse(
        { result: { publicExponent: PASSPORT_EXPONENT, modulus: PASSPORT_MODULUS } },
        { 'Set-Cookie': 'FTAG=tag-123; Path=/' },
      );
    }
    if (path === '/login/dynamicpassword') return jsonResponse(smsBody);
    if (path === '/authn/dynamicpassword') return jsonResponse(authnBody);
    if (path === '/user/h5/token-validate/v3.0') return jsonResponse(validateBody, validateHeaders);
    throw new Error(`unexpected fetch: ${url}`);
  };
}

const SMS_OK = { status: 2000, message: '', header: { resultcode: '104000' }, result: {} };
const AUTHN_OK = {
  status: 2000,
  message: '',
  header: { resultcode: '104000' },
  result: { token: 'STnid-login-test-token-0001' },
};
const VALIDATE_OK = { code: '000000', info: '操作成功', data: { usessionId: 'UDnid-session' } };

test('migu sms login keeps one session: cookies and fingerprint shared between send and authn', async (t) => {
  const phone = '13000000001';
  const calls = installFetchMock(t, routePassport({
    smsBody: SMS_OK,
    authnBody: AUTHN_OK,
    validateBody: VALIDATE_OK,
    validateHeaders: { 'Set-Cookie': 'pacmtoken=COOKIEVALUE; Path=/', pacmtoken: 'HEADERVALUE' },
  }));

  await requestMiguSmsCode(phone);
  const { token, pacmToken } = await loginMiguByPhone(phone, '652149');

  assert.equal(token, 'STnid-login-test-token-0001');
  // 实测响应头与 Set-Cookie 携带相同值；实现优先取响应头（API 明确暴露的通道）
  assert.equal(pacmToken, 'HEADERVALUE');

  // 发码与登录共用同一指纹（验证码与会话绑定）；发码侧指纹在 URL query 中
  const sendCall = calls.find((c) => c.url.includes('/login/dynamicpassword'));
  const authnCall = calls.find((c) => c.url.includes('/authn/dynamicpassword'));
  assert.ok(sendCall && authnCall);
  const queryField = (url, name) => new URL(url).searchParams.get(name) || '';
  assert.equal(queryField(sendCall.url, 'fingerPrint'), formField(authnCall.init, 'fingerPrint'));

  // 登录请求必须携带发码会话的 Cookie
  const sendCookie = headerValue(sendCall.init, 'cookie');
  const authnCookie = headerValue(authnCall.init, 'cookie');
  assert.ok(sendCookie.includes('JSESSIONID=session-abc'), 'send request should carry session cookies');
  assert.equal(authnCookie, sendCookie, 'authn must reuse the SMS session cookies');

  // ST 令牌一次性：token-validate 只能调用一次
  assert.equal(calls.filter((c) => c.url.includes('token-validate')).length, 1);
});

test('migu login surfaces upstream reason on wrong sms code', async (t) => {
  const phone = '13000000002';
  installFetchMock(t, routePassport({
    smsBody: SMS_OK,
    authnBody: { status: 4005, message: '短信验证码错误或已失效', header: { resultcode: '104212' }, result: {} },
  }));

  await requestMiguSmsCode(phone);
  await assert.rejects(
    loginMiguByPhone(phone, '000000'),
    /咪咕登录失败：短信验证码错误或已失效/,
  );
});

test('migu pacm exchange falls back to the pacmtoken response header', async (t) => {
  const phone = '13000000003';
  installFetchMock(t, routePassport({
    smsBody: SMS_OK,
    authnBody: AUTHN_OK,
    validateBody: VALIDATE_OK,
    // 上游可能只通过响应头下发 pacmtoken（实测 Set-Cookie 与响应头同时存在）
    validateHeaders: { pacmtoken: 'HEADERONLYVALUE' },
  }));

  await requestMiguSmsCode(phone);
  const { pacmToken } = await loginMiguByPhone(phone, '444530');
  assert.equal(pacmToken, 'HEADERONLYVALUE');
});

test('migu login fails clearly when token-validate returns no pacmtoken', async (t) => {
  const phone = '13000000004';
  installFetchMock(t, routePassport({
    smsBody: SMS_OK,
    authnBody: AUTHN_OK,
    validateBody: { code: '199999', info: '系统繁忙，请稍后重试' },
    validateHeaders: {},
  }));

  await requestMiguSmsCode(phone);
  await assert.rejects(loginMiguByPhone(phone, '652149'), /咪咕登录会话获取失败/);
});
