import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import express from 'express';
import {
  createHttpApiRateLimit,
  resolveApiRateLimitPerMin,
  DEFAULT_API_RATE_LIMIT_PER_MIN,
  HEALTH_PROBE_PATHS,
} from './httpRateLimit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function start(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function request(server, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: server.address().port,
      path,
      method: 'GET',
    }, (res) => {
      res.resume();
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** 模拟真实挂载顺序：限流挂在 /api，静态资源挂在其后。 */
function buildApp({ max = 3 } = {}) {
  const app = express();
  app.use('/api', createHttpApiRateLimit({ max, windowMs: 60_000 }));
  app.get('/api/rooms', (_req, res) => res.json({ ok: true }));
  app.get('/api/health/live', (_req, res) => res.json({ ok: true }));
  app.get('/api/health/ready', (_req, res) => res.json({ ok: true }));
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('/{*splat}', (_req, res) => res.type('html').send('<html></html>'));
  return app;
}

test('静态资源不会被 API 限流拦截', async () => {
  const server = await start(buildApp({ max: 2 }));
  try {
    // 远超 API 阈值：每次进房间都要拉 20+ 个静态 chunk
    for (let i = 0; i < 40; i += 1) {
      const asset = await request(server, '/assets/Room.js');
      assert.notEqual(asset.status, 429, `第 ${i + 1} 次静态资源请求被限流`);
    }
    const index = await request(server, '/');
    assert.notEqual(index.status, 429);

    // 同一时间窗内 API 仍然受限，说明限流本身没有被整体关闭
    const statuses = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await request(server, '/api/rooms')).status);
    assert.equal(statuses[0], 200);
    assert.equal(statuses[1], 200);
    assert.ok(statuses.includes(429), `预期出现 429，实际 ${statuses.join(',')}`);
  } finally {
    await close(server);
  }
});

test('API 超过阈值返回 429 并带限流响应头', async () => {
  const server = await start(buildApp({ max: 3 }));
  try {
    const first = await request(server, '/api/rooms');
    assert.equal(first.status, 200);
    assert.equal(first.headers['x-ratelimit-limit'], '3');

    let last = null;
    for (let i = 0; i < 4; i += 1) last = await request(server, '/api/rooms');
    assert.equal(last.status, 429);
    assert.equal(last.headers['x-ratelimit-remaining'], '0');
  } finally {
    await close(server);
  }
});

test('健康检查探针豁免限流', async () => {
  const server = await start(buildApp({ max: 1 }));
  try {
    for (const probe of ['/api/health/live', '/api/health/ready', '/api/health']) {
      for (let i = 0; i < 30; i += 1) {
        const res = await request(server, probe);
        assert.notEqual(res.status, 429, `${probe} 第 ${i + 1} 次探测被限流`);
      }
    }
  } finally {
    await close(server);
  }
});

test('健康检查豁免路径集合覆盖三种探针', () => {
  assert.deepEqual(
    [...HEALTH_PROBE_PATHS].sort(),
    ['/health', '/health/live', '/health/ready'],
  );
});

test('限流阈值解析回退到安全默认值', () => {
  assert.equal(resolveApiRateLimitPerMin(''), DEFAULT_API_RATE_LIMIT_PER_MIN);
  assert.equal(resolveApiRateLimitPerMin(undefined), DEFAULT_API_RATE_LIMIT_PER_MIN);
  assert.equal(resolveApiRateLimitPerMin('abc'), DEFAULT_API_RATE_LIMIT_PER_MIN);
  assert.equal(resolveApiRateLimitPerMin('0'), DEFAULT_API_RATE_LIMIT_PER_MIN);
  assert.equal(resolveApiRateLimitPerMin('-5'), DEFAULT_API_RATE_LIMIT_PER_MIN);
  assert.equal(resolveApiRateLimitPerMin('300'), 300);
  assert.ok(DEFAULT_API_RATE_LIMIT_PER_MIN >= 240, '默认阈值需能容纳房间页正常操作');
});
