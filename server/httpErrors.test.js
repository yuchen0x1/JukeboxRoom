import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { apiNoStore, apiNotFoundHandler, createErrorHandler } from './httpErrors.js';

function start(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function request(server, path, init = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: server.address().port,
      path,
      method: init.method || 'GET',
      headers: init.headers,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end(init.body);
  });
}

function buildApp({ logger = { error() {}, warn() {} } } = {}) {
  const app = express();
  app.use('/api', apiNoStore);
  app.get('/api/ok', (req, res) => {
    req.requestId = 'req-123';
    res.json({ ok: true });
  });
  app.get('/api/boom', () => {
    throw new Error('内部数据库连接失败：secret-dsn');
  });
  app.get('/api/teapot', (_req, _res, next) => {
    const error = new Error('I am a teapot');
    error.status = 418;
    error.expose = true;
    next(error);
  });
  app.get('/api/user-input', (_req, _res, next) => {
    const error = new Error('缺少参数 song');
    error.status = 400;
    next(error);
  });
  app.use(apiNotFoundHandler);
  app.use(createErrorHandler({ logger }));
  return app;
}

test('/api 未匹配路径返回 JSON 404 而不是 HTML', async () => {
  const server = await start(buildApp());
  try {
    const res = await request(server, '/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.match(res.headers['content-type'], /application\/json/);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, false);
    assert.equal(body.error, 'not_found');
  } finally {
    await close(server);
  }
});

test('API 成功响应禁止缓存，透出 requestId', async () => {
  const server = await start(buildApp());
  try {
    const res = await request(server, '/api/ok');
    assert.equal(res.status, 200);
    assert.equal(res.headers['cache-control'], 'no-store');
  } finally {
    await close(server);
  }
});

test('路由异常返回 JSON 500，不泄漏内部错误信息', async () => {
  const logs = [];
  const server = await start(buildApp({
    logger: {
      error(message, detail) { logs.push({ level: 'error', message, detail }); },
      warn(message, detail) { logs.push({ level: 'warn', message, detail }); },
    },
  }));
  try {
    const res = await request(server, '/api/boom');
    assert.equal(res.status, 500);
    assert.match(res.headers['content-type'], /application\/json/);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, false);
    assert.equal(body.error, 'internal_error');
    assert.equal(body.message, '服务器内部错误');
    assert.doesNotMatch(res.body, /secret-dsn/);

    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'error');
    assert.match(logs[0].message, /内部数据库连接失败/);
    assert.equal(logs[0].detail.path, '/api/boom');
  } finally {
    await close(server);
  }
});

test('显式 expose 的 4xx 信息可以透出，并记录 warn 而非 error', async () => {
  const logs = [];
  const server = await start(buildApp({
    logger: {
      error(message, detail) { logs.push({ level: 'error', message, detail }); },
      warn(message, detail) { logs.push({ level: 'warn', message, detail }); },
    },
  }));
  try {
    const res = await request(server, '/api/teapot');
    assert.equal(res.status, 418);
    assert.equal(JSON.parse(res.body).message, 'I am a teapot');
    assert.equal(logs[0].level, 'warn');
  } finally {
    await close(server);
  }
});

test('未 expose 的 4xx 使用通用文案，避免回显原始堆栈', async () => {
  const server = await start(buildApp());
  try {
    const res = await request(server, '/api/user-input');
    assert.equal(res.status, 400);
    assert.equal(JSON.parse(res.body).message, '请求格式无效');
  } finally {
    await close(server);
  }
});

test('非 API 路径异常返回纯文本，不返回 JSON', async () => {
  const app = express();
  app.get('/boom', () => { throw new Error('css failed'); });
  app.use(createErrorHandler({ logger: { error() {}, warn() {} } }));
  const server = await start(app);
  try {
    const res = await request(server, '/boom');
    assert.equal(res.status, 500);
    assert.match(res.headers['content-type'], /text\//);
    assert.equal(res.body, '服务器内部错误');
  } finally {
    await close(server);
  }
});
