import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { loginPhone } from 'migu-api-enhanced/login';
import { decodeMiguSongId, encodeMiguSongId, extractToken, loginMiguByPhone, passportFailed } from './miguMusic.js';

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

test('migu passport failure envelope reports upstream message instead of missing session', async (t) => {
  const envelope = { status: 4005, message: '短信验证码错误或已失效', header: { resultcode: '104212' }, result: {} };
  assert.equal(passportFailed(envelope), true);
  assert.equal(extractToken(envelope), '');
  const stub = mock.method(loginPhone, 'authn', async () => envelope);
  try {
    await assert.rejects(loginMiguByPhone('13000000000', '444530'), /短信验证码错误或已失效/);
  } finally {
    stub.mock.restore();
  }
});

test('migu login maps upstream connection errors to a friendly message', async (t) => {
  const stub = mock.method(loginPhone, 'authn', async () => { throw new Error('connect ETIMEDOUT'); });
  try {
    await assert.rejects(loginMiguByPhone('13000000000', '444530'), /无法连接咪咕服务/);
  } finally {
    stub.mock.restore();
  }
});
