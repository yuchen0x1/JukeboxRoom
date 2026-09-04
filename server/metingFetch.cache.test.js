/**
 * metingFetch 本地缓存层测试（node --test）
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createFetchMetingForTest, fetchMeting } from './metingFetch.js';
import { resetProviderHealth } from './mediaHealth.js';

let hits = 0;
let server = null;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      hits += 1;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, n: hits }));
    });
    server.listen(0, '127.0.0.1', resolve);
  });
}

function localRequest(options, callback) {
  return http.request({ ...options, lookup: undefined }, callback);
}

const fetchMetingForTest = createFetchMetingForTest({
  allowPrivateForTest: true,
  requestFactory: localRequest,
});

test('GET 成功响应被本地缓存：同 URL 只请求一次上游', async () => {
  await startServer();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/api?type=playlist`;

  const first = await fetchMetingForTest(url);
  assert.equal(first.ok, true);
  assert.equal((await first.json()).n, 1);

  const second = await fetchMetingForTest(url);
  assert.equal((await second.json()).n, 1, '命中缓存，未再次请求上游');
  assert.equal(hits, 1, '上游只收到一次请求');
});

test('cache:false 跳过缓存', async () => {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/api?type=search&q=test`;

  await fetchMetingForTest(url); // 入缓存
  const before = hits;
  await fetchMetingForTest(url, { cache: false }); // 跳过缓存，再请求一次
  assert.equal(hits, before + 1, 'cache:false 会再次请求上游');
});

test('production fetchMeting rejects private upstream by default', async () => {
  const port = server.address().port;
  await assert.rejects(
    () => fetchMeting(`http://127.0.0.1:${port}/api?type=playlist`),
    /拒绝访问不安全的外部 URL/,
  );
});

after(() => {
  if (server) server.close();
  resetProviderHealth();
});
