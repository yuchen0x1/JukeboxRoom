import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { insert, remove } from './db/store.js';
import { registerUser, signToken, authRouter } from './auth/index.js';
import { adminRouter } from './admin/index.js';
import {
  addUser,
  createRoom,
  getRoomInternal,
  kickUser,
  setChatMute,
  setRoomAdmin,
  transferOwner,
} from './roomManager.js';
import { createSocketRateLimiter } from './rateLimiter.js';

function start(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function request(server, { method = 'POST', path = '/', body, headers = {} } = {}) {
  const data = body === undefined ? '' : JSON.stringify(body);
  const requestHeaders = {
    ...headers,
  };
  if (body !== undefined) requestHeaders['content-type'] = 'application/json';
  requestHeaders['content-length'] = Buffer.byteLength(data);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: server.address().port,
      path,
      method,
      headers: requestHeaders,
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

test('banned accounts lose JWT access immediately', async () => {
  const username = `security-jwt-${Date.now()}`;
  const fixtureSecret = ['test', 'credential'].join('-');
  const user = await registerUser(username, fixtureSecret);
  const token = signToken({ sub: user.id, username, role: user.role, exp: Date.now() + 60_000 });

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const server = await start(app);
  try {
    const before = await request(server, {
      method: 'GET',
      path: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(before.status, 200);

    const { update } = await import('./db/store.js');
    update('users', (entry) => entry.id === user.id, { status: 'banned' });

    const after = await request(server, {
      method: 'GET',
      path: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(after.status, 401);
  } finally {
    await close(server);
    remove('users', (entry) => entry.id === user.id);
  }
});

function adminApp(reqUser) {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', (req, _res, next) => {
    req.user = reqUser;
    next();
  }, adminRouter);
  return app;
}

test('admin cannot ban self or another admin', async () => {
  const actor = insert('users', {
    username: `security-admin-${Date.now()}`,
    passwordHash: 'test',
    role: 'admin',
    status: 'active',
  });
  const target = insert('users', {
    username: `security-target-${Date.now()}`,
    passwordHash: 'test',
    role: 'admin',
    status: 'active',
  });
  const server = await start(adminApp({ id: actor.id, username: actor.username, role: actor.role }));
  try {
    const selfBan = await request(server, {
      path: `/api/admin/users/${actor.id}/ban`,
    });
    assert.equal(selfBan.status, 403);

    const peerBan = await request(server, {
      path: `/api/admin/users/${target.id}/ban`,
    });
    assert.equal(peerBan.status, 403);
  } finally {
    await close(server);
    remove('users', (entry) => entry.id === actor.id || entry.id === target.id);
  }
});

test('super admin can ban an admin', async () => {
  const actor = insert('users', {
    username: `security-super-${Date.now()}`,
    passwordHash: 'test',
    role: 'super_admin',
    status: 'active',
  });
  const target = insert('users', {
    username: `security-admin-target-${Date.now()}`,
    passwordHash: 'test',
    role: 'admin',
    status: 'active',
  });
  const server = await start(adminApp({ id: actor.id, username: actor.username, role: actor.role }));
  try {
    const ban = await request(server, {
      path: `/api/admin/users/${target.id}/ban`,
    });
    assert.equal(ban.status, 200);
    assert.equal(ban.body.status, 'banned');
  } finally {
    await close(server);
    remove('users', (entry) => entry.id === actor.id || entry.id === target.id);
  }
});

test('transferOwner moves creator and rejects invalid targets', () => {
  const room = createRoom({ name: 'transfer regression', creatorId: 'owner-1234' });
  addUser(room.id, 'owner-1234', 'Owner');
  addUser(room.id, 'member-5678', 'Member');
  addUser(room.id, 'read-only-1', 'TV', { readOnly: true });

  const result = transferOwner(room.id, 'owner-1234', 'member-5678');
  assert.equal(result.error, undefined);
  assert.equal(getRoomInternal(room.id).creatorId, 'member-5678');
  assert.equal(getRoomInternal(room.id).ownerId, 'member-5678');
  assert.ok(getRoomInternal(room.id).adminIds.has('owner-1234'));

  const formerOwnerRetry = transferOwner(room.id, 'owner-1234', 'member-5678');
  assert.ok(formerOwnerRetry.error);

  const readOnlyTarget = transferOwner(room.id, 'member-5678', 'read-only-1');
  assert.ok(readOnlyTarget.error);
});

test('room moderation keeps creator/admin boundaries intact', async () => {
  const room = createRoom({ name: 'moderation regression', creatorId: 'perm-owner' });
  addUser(room.id, 'perm-owner', 'Owner');
  addUser(room.id, 'perm-admin-1', 'Admin');
  addUser(room.id, 'perm-user-1', 'User');
  const promoted = setRoomAdmin(room.id, 'perm-owner', 'perm-admin-1', true);
  assert.equal(promoted.error, undefined);

  const muteMember = setChatMute(room.id, 'perm-admin-1', {
    userId: 'perm-user-1',
    muted: true,
  });
  assert.equal(muteMember.error, undefined);

  const muteCreator = setChatMute(room.id, 'perm-admin-1', {
    userId: 'perm-owner',
    muted: true,
  });
  assert.ok(muteCreator.error);

  const muteAll = setChatMute(room.id, 'perm-admin-1', { muteAll: true });
  assert.ok(muteAll.error);

  const kickCreator = await kickUser(room.id, 'perm-admin-1', 'perm-owner');
  assert.ok(kickCreator.error);
});

test('socket rate limiter enforces per-client limits', () => {
  const key = `socket-rate-test-${Date.now()}`;
  const limiter = createSocketRateLimiter({
    windowMs: 60_000,
    max: 2,
    keyFn: () => key,
  });
  const socket = { request: { socket: { remoteAddress: '127.0.0.1' } } };
  assert.equal(limiter(socket, 'test_event'), true);
  assert.equal(limiter(socket, 'test_event'), true);
  assert.equal(limiter(socket, 'test_event'), false);
});
