/**
 * 投票切歌（F2）测试：普通成员投票过半自动切歌（node --test）
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom,
  addUser,
  addToQueue,
  ensurePlayback,
  getRoom,
  requestSkip,
  skipVoteThreshold,
  hasSkipMajority,
  closeRoomManager,
} from './roomManager.js';

test('skipVoteThreshold 计算过半票数', () => {
  assert.equal(skipVoteThreshold(1), Infinity, '单人房间不自动投票切歌');
  assert.equal(skipVoteThreshold(2), 2);
  assert.equal(skipVoteThreshold(3), 2);
  assert.equal(skipVoteThreshold(4), 3);
  assert.equal(skipVoteThreshold(5), 3);
  assert.equal(skipVoteThreshold(0), Infinity);
});

test('hasSkipMajority 判定过半', () => {
  assert.equal(hasSkipMajority(1, 2), false);
  assert.equal(hasSkipMajority(2, 2), true);
  assert.equal(hasSkipMajority(1, 3), false);
  assert.equal(hasSkipMajority(2, 3), true);
  assert.equal(hasSkipMajority(2, 5), false);
  assert.equal(hasSkipMajority(3, 5), true);
  assert.equal(hasSkipMajority(1, 1), false, '单人房间永远不算过半');
});

test('普通成员投票过半自动切歌', async () => {
  const created = createRoom({ name: 'vote-room', creatorId: 'owner' });
  const roomId = created.id;
  assert.ok(roomId, '房间创建成功');

  addUser(roomId, 'owner', '房主');
  addUser(roomId, 'user-a', '成员A');
  addUser(roomId, 'user-b', '成员B');

  await addToQueue(roomId, { id: 'c1', name: '当前曲', source: 'test', artist: 'A' }, { id: 'user-a', nickname: '成员A' });
  await addToQueue(roomId, { id: 'n1', name: '下一曲', source: 'test', artist: 'B' }, { id: 'user-b', nickname: '成员B' });
  await ensurePlayback(roomId);

  assert.equal(getRoom(roomId).current.name, '当前曲', '初始正在播放第一首');

  // 第一票：未过半，不切歌
  const first = await requestSkip(roomId, 'user-a');
  assert.equal(first.error, undefined);
  assert.equal(first.autoSkipped, undefined);
  assert.equal(getRoom(roomId).current.name, '当前曲');

  // 第二票（3 人过半=2）：自动切歌
  const second = await requestSkip(roomId, 'user-b');
  assert.equal(second.error, undefined);
  assert.equal(second.autoSkipped, true, '过半后自动切歌');
  assert.equal(getRoom(roomId).current.name, '下一曲', '切到队列下一首');
});

test('房主/管理员直接切歌不走投票', async () => {
  const created = createRoom({ name: 'owner-room', creatorId: 'owner' });
  const roomId = created.id;
  addUser(roomId, 'owner', '房主');
  addUser(roomId, 'user-a', '成员A');

  await addToQueue(roomId, { id: 'c1', name: '当前曲', source: 'test', artist: 'A' }, { id: 'user-a', nickname: '成员A' });
  await ensurePlayback(roomId);

  const result = await requestSkip(roomId, 'owner');
  assert.equal(result.error, '可直接切歌');
});

test('重复投票被拒绝', async () => {
  const created = createRoom({ name: 'dup-room', creatorId: 'owner' });
  const roomId = created.id;
  addUser(roomId, 'owner', '房主');
  addUser(roomId, 'user-a', '成员A');
  addUser(roomId, 'user-b', '成员B');

  await addToQueue(roomId, { id: 'c1', name: '当前曲', source: 'test', artist: 'A' }, { id: 'user-a', nickname: '成员A' });
  await addToQueue(roomId, { id: 'n1', name: '下一曲', source: 'test', artist: 'B' }, { id: 'user-b', nickname: '成员B' });
  await ensurePlayback(roomId);

  await requestSkip(roomId, 'user-a');
  const again = await requestSkip(roomId, 'user-a');
  assert.equal(again.error, '已提交过切歌申请');
});

after(async () => {
  await closeRoomManager();
});
