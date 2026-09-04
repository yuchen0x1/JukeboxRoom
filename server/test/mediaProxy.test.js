import assert from 'node:assert/strict';
import test from 'node:test';
import { preferHttpsMediaUrl, refererForMediaUrl, serveUpstreamMedia } from '../mediaProxy.js';

function createResponse({ status = 200, headers = {}, body = null } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    body,
    async arrayBuffer() {
      return new TextEncoder().encode('media').buffer;
    },
  };
}

function createResponseWriter() {
  return {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    statusCode: 200,
    responseBody: null,
    set() { return this; },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      this.responseBody = payload;
      this.headersSent = true;
      return this;
    },
    send(payload) {
      this.responseBody = payload;
      this.headersSent = true;
      return this;
    },
    on() { return this; },
    destroy() { this.destroyed = true; },
  };
}

test('media URL helpers preserve known provider behavior', () => {
  assert.equal(
    preferHttpsMediaUrl('http://m10.music.126.net/song.mp3'),
    'https://m10.music.126.net/song.mp3',
  );
  assert.equal(
    preferHttpsMediaUrl('http://fs.w.kugou.com/song.mp3'),
    'http://fs.w.kugou.com/song.mp3',
  );
  assert.equal(refererForMediaUrl('https://y.qq.com/song.mp3'), 'https://y.qq.com/');
});

test('media proxy rejects an unsafe redirect target before fetching it', async () => {
  const responseWriter = createResponseWriter();
  const fetchedUrls = [];
  const validatedUrls = [];
  const handled = await serveUpstreamMedia(
    'https://media.example/song.mp3',
    responseWriter,
    async (url) => {
      fetchedUrls.push(url);
      return createResponse({
        status: 302,
        headers: { location: 'http://127.0.0.1:4000/private' },
      });
    },
    {
      validateUrl: async (url) => {
        validatedUrls.push(url);
        return !url.includes('127.0.0.1');
      },
    },
  );

  assert.equal(handled, false);
  assert.deepEqual(fetchedUrls, ['https://media.example/song.mp3']);
  assert.equal(validatedUrls.length, 2);
  assert.equal(responseWriter.statusCode, 403);
  assert.deepEqual(responseWriter.responseBody, { error: '禁止访问内网地址' });
});

test('media proxy buffers successful image responses', async () => {
  const responseWriter = createResponseWriter();
  const handled = await serveUpstreamMedia(
    'https://media.example/cover.jpg',
    responseWriter,
    async () => createResponse({ headers: { 'content-type': 'image/jpeg' } }),
    { validateUrl: async () => true },
  );

  assert.equal(handled, true);
  assert.equal(responseWriter.statusCode, 200);
  assert.equal(Buffer.isBuffer(responseWriter.responseBody), true);
});
