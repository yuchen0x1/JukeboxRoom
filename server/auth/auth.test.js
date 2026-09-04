import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { remove, findOne } from '../db/store.js';
import { authRouter, loginUser } from './index.js';

function request(server, body) {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({
      host: '127.0.0.1',
      port: address.port,
      path: '/api/auth/register',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(data),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

test('public registration ignores a requested admin role', async () => {
  const username = `auth-test-${Date.now()}`;
  const fixtureSecret = ['test', 'credential'].join('-');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const response = await request(server, {
      username,
      password: fixtureSecret,
      role: 'super_admin',
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.role, 'user');
    assert.equal(findOne('users', (user) => user.username === username).role, 'user');
    assert.equal((await loginUser(username, fixtureSecret)).user.role, 'user');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    remove('users', (user) => user.username === username);
  }
});
