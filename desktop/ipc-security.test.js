const assert = require('node:assert/strict');
const test = require('node:test');
const { assertTrustedRendererRequest } = require('./ipc-security');

function fixture(url = 'http://127.0.0.1:4321/') {
  const mainFrame = { url };
  const webContents = { mainFrame };
  const mainWindow = { webContents, isDestroyed: () => false };
  return { mainFrame, webContents, mainWindow, event: { sender: webContents, senderFrame: mainFrame } };
}

test('accepts only the trusted window main frame and exact local origin', () => {
  const context = fixture();
  assert.doesNotThrow(() => assertTrustedRendererRequest(context.event, {
    mainWindow: context.mainWindow,
    origin: 'http://127.0.0.1:4321',
  }));
});

test('rejects a different sender, subframe, destroyed window and foreign origin', () => {
  const context = fixture();
  const trusted = { mainWindow: context.mainWindow, origin: 'http://127.0.0.1:4321' };
  assert.throws(() => assertTrustedRendererRequest({ ...context.event, sender: {} }, trusted), /Untrusted/);
  assert.throws(() => assertTrustedRendererRequest({ ...context.event, senderFrame: { url: 'http://127.0.0.1:4321/child' } }, trusted), /main frame/);
  assert.throws(() => assertTrustedRendererRequest(context.event, { ...trusted, mainWindow: { ...context.mainWindow, isDestroyed: () => true } }), /Untrusted/);
  context.mainFrame.url = 'https://example.com/';
  assert.throws(() => assertTrustedRendererRequest(context.event, trusted), /origin/);
});
