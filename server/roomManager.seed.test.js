import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { closeRoomManager, ensureSeedRoom, listRoomIds } from './roomManager.js';

const originalNodeEnv = process.env.NODE_ENV;

test('production does not create the public test room', () => {
  process.env.NODE_ENV = 'production';
  ensureSeedRoom();
  assert.equal(listRoomIds().includes('TEST01'), false);
});

test('non-production keeps the development test room', () => {
  process.env.NODE_ENV = 'development';
  ensureSeedRoom();
  assert.equal(listRoomIds().includes('TEST01'), true);
});

after(async () => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  await closeRoomManager();
});
