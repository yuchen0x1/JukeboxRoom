import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPrivateIp,
  isPrivateHostname,
  isSafeHttpUrl,
  parseHttpUrl,
  resolveValidatedHttpUrl,
} from './outboundUrl.js';

test('outbound URL guard rejects private, reserved and non-http targets', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.1.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  assert.equal(isPrivateHostname('localhost'), true);
  assert.equal(isPrivateHostname('service.local'), true);
  assert.equal(isPrivateHostname('example.com'), false);
  assert.equal(await isSafeHttpUrl('file:///etc/passwd'), false);
  assert.equal(await isSafeHttpUrl('http://127.0.0.1:4000', { lookup: async () => [{ address: '127.0.0.1' }] }), false);
});

test('outbound URL guard rejects mixed DNS results', async () => {
  const lookup = async () => [{ address: '93.184.216.34' }, { address: '10.0.0.1' }];
  assert.equal(await isSafeHttpUrl('https://example.com/media.mp3', { lookup }), false);
});

test('outbound URL guard accepts a public host with public DNS', async () => {
  const lookup = async () => [{ address: '93.184.216.34' }];
  assert.equal(await isSafeHttpUrl('https://example.com/media.mp3', { lookup }), true);
});

test('private override is explicit and does not permit non-http schemes', async () => {
  assert.equal(parseHttpUrl('http://127.0.0.1:4000', { allowPrivate: true })?.hostname, '127.0.0.1');
  assert.equal(parseHttpUrl('file:///etc/passwd', { allowPrivate: true }), null);
  assert.equal(await isSafeHttpUrl('https://example.com/media.mp3', {
    allowPrivate: true,
    lookup: async () => [{ address: '10.0.0.1' }],
  }), true);
});

test('validated DNS result is pinned to the selected public address', async () => {
  const validated = await resolveValidatedHttpUrl('https://example.com/media.mp3', {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
  });
  assert.equal(validated.address, '93.184.216.34');
  assert.equal(validated.family, 4);
});
