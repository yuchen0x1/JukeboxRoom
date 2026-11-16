import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedQqLoginUrl } from './sourceResolvers.js';

test('QQ login redirect allowlist accepts known auth hosts only', () => {
  assert.equal(isAllowedQqLoginUrl('https://graph.qq.com/oauth2.0/login_jump?uin=123'), true);
  assert.equal(isAllowedQqLoginUrl('https://ssl.ptlogin2.qq.com/ptqrlogin'), true);
  assert.equal(isAllowedQqLoginUrl('https://169.254.169.254/latest/meta-data/?check_sig=1'), false);
  assert.equal(isAllowedQqLoginUrl('https://attacker.example/check_sig?next=graph.qq.com'), false);
  assert.equal(isAllowedQqLoginUrl('http://graph.qq.com/oauth2.0/login_jump'), false);
});
