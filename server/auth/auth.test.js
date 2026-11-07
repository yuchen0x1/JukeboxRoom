import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { remove, findOne } from '../db/store.js';
import {
  authRouter,
  loginUser,
  ensureInitialAdmin,
  signToken,
  verifyToken,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from './index.js';

function request(server, { path = '/api/auth/register', method = 'POST', body, headers = {} } = {}) {
  const data = body === undefined ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({
      host: '127.0.0.1',
      port: address.port,
      path,
      method,
      headers: {
        ...headers,
        ...(body === undefined ? {} : {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data),
        }),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : {} });
      });
    });
    req.on('error', reject);
    req.end(data);
  });
}

function startApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

test('registration enforces password length bounds', async () => {
  const server = await startApp();
  try {
    const tooShort = await request(server, {
      body: { username: `short-${Date.now()}`, password: '1234567' },
    });
    assert.equal(tooShort.status, 400);
    const tooLong = await request(server, {
      body: { username: `long-${Date.now()}`, password: 'x'.repeat(PASSWORD_MAX_LENGTH + 1) },
    });
    assert.equal(tooLong.status, 400);
    assert.ok(PASSWORD_MIN_LENGTH >= 8);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('initial admin is created only from explicit environment credentials', async () => {
  const username = `initial-admin-${Date.now()}`;
  const previousUsername = process.env.ADMIN_INIT_USERNAME;
  const previousPassword = process.env.ADMIN_INIT_PASSWORD;
  try {
    delete process.env.ADMIN_INIT_USERNAME;
    delete process.env.ADMIN_INIT_PASSWORD;
    const skipped = await ensureInitialAdmin();
    assert.equal(skipped.created, false);
    assert.equal(skipped.skipped, 'not_configured');

    process.env.ADMIN_INIT_USERNAME = username;
    process.env.ADMIN_INIT_PASSWORD = 'initial-admin-password';
    const created = await ensureInitialAdmin();
    assert.equal(created.created, true);
    assert.equal(findOne('users', (user) => user.username === username).role, 'super_admin');
  } finally {
    if (previousUsername === undefined) delete process.env.ADMIN_INIT_USERNAME;
    else process.env.ADMIN_INIT_USERNAME = previousUsername;
    if (previousPassword === undefined) delete process.env.ADMIN_INIT_PASSWORD;
    else process.env.ADMIN_INIT_PASSWORD = previousPassword;
    remove('users', (user) => user.username === username);
  }
});

test('JWT verification rejects malformed headers and expired millisecond tokens', () => {
  assert.equal(verifyToken('not-a-jwt'), null);
  const expired = signToken({ sub: 'user', exp: Date.now() - 1 });
  assert.equal(verifyToken(expired), null);
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'user', exp: Date.now() + 60_000 })).toString('base64url');
  assert.equal(verifyToken(`${header}.${payload}.invalid`), null);
});

test('public registration ignores a requested admin role', async () => {
  const username = `auth-test-${Date.now()}`;
  const fixtureSecret = ['test', 'credential'].join('-');
  const server = await startApp();

  try {
    const response = await request(server, {
      body: {
        username,
        password: `${fixtureSecret}1`,
        role: 'super_admin',
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.role, 'user');
    assert.equal(findOne('users', (user) => user.username === username).role, 'user');
    const login = await loginUser(username, `${fixtureSecret}1`);
    assert.equal(login.user.role, 'user');
    assert.ok(login.accessToken);
    assert.ok(login.refreshToken);

    const refreshed = await request(server, {
      path: '/api/auth/refresh',
      body: { refreshToken: login.refreshToken },
    });
    assert.equal(refreshed.status, 200);
    assert.ok(refreshed.body.accessToken);
    assert.ok(refreshed.body.refreshToken);
    assert.notEqual(refreshed.body.refreshToken, login.refreshToken);

    const replay = await request(server, {
      path: '/api/auth/refresh',
      body: { refreshToken: login.refreshToken },
    });
    assert.equal(replay.status, 401);

    const logout = await request(server, {
      path: '/api/auth/logout',
      body: { refreshToken: refreshed.body.refreshToken },
    });
    assert.equal(logout.status, 200);
    const afterLogout = await request(server, {
      path: '/api/auth/refresh',
      body: { refreshToken: refreshed.body.refreshToken },
    });
    assert.equal(afterLogout.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    const user = findOne('users', (entry) => entry.username === username);
    if (user) {
      remove('auth_refresh_sessions', (session) => session.userId === user.id);
      remove('users', (entry) => entry.id === user.id);
    }
  }
});
