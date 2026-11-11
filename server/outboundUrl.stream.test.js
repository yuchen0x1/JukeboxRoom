import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { safeFetch } from './outboundUrl.js';

/**
 * 这些测试针对一个真实的进程级故障：
 * 媒体代理原本用 `safeFetch` 缓冲整个响应体。请求一个几百 MB 的上游文件
 * 就能把 Node 进程的内存打满。`stream: true` 必须返回未经缓冲的流。
 */

function startUpstream(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

/**
 * safeFetch 会把连接固定到 DNS 校验时解析出的公网地址（防 DNS rebinding）。
 * 测试要连本地服务器，因此通过 requestFactory 去掉 pinned lookup；URL 校验
 * 用 allowPrivate 显式放行。
 */
function localRequest(options, callback) {
  return http.request({ ...options, lookup: undefined }, callback);
}

function localOptions(extra = {}) {
  return {
    allowPrivate: true,
    requestFactory: localRequest,
    ...extra,
  };
}

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test('stream 模式返回可读流，不预读正文', async () => {
  const server = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': '6' });
    res.end('abcdef');
  });
  try {
    const port = server.address().port;
    const response = await safeFetch(`http://127.0.0.1:${port}/song.mp3`, localOptions({ stream: true }));
    assert.equal(response.status, 200);
    assert.ok(response.nodeStream, '应返回 node 流');
    assert.deepEqual(await readAll(response.nodeStream), Buffer.from('abcdef'));
  } finally {
    await close(server);
  }
});

test('缓冲模式超过 maxBytes 时中止并报错', async () => {
  const server = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('x'.repeat(64 * 1024));
  });
  try {
    const port = server.address().port;
    await assert.rejects(
      safeFetch(`http://127.0.0.1:${port}/huge.json`, localOptions({ maxBytes: 1024 })),
      /超过大小上限/,
    );
  } finally {
    await close(server);
  }
});

test('缓冲模式在阈值内正常返回 JSON', async () => {
  const server = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, songs: [1, 2, 3] }));
  });
  try {
    const port = server.address().port;
    const response = await safeFetch(`http://127.0.0.1:${port}/data.json`, localOptions());
    assert.deepEqual(await response.json(), { ok: true, songs: [1, 2, 3] });
    assert.equal(response.nodeStream, null);
  } finally {
    await close(server);
  }
});

test('流式响应不允许误用 text()/json()，避免隐式整体缓冲', async () => {
  const server = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'audio/mpeg' });
    res.end('abc');
  });
  try {
    const port = server.address().port;
    const response = await safeFetch(`http://127.0.0.1:${port}/a.mp3`, localOptions({ stream: true }));
    await assert.rejects(() => response.text(), /流式响应/);
    await assert.rejects(() => response.json(), /流式响应/);
    response.nodeStream.destroy();
  } finally {
    await close(server);
  }
});
