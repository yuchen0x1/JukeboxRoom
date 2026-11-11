/**
 * 房间状态机回归测试：切歌去重、播放参数校验、seek 边界。
 *
 * 这些用例对应审计中确认的真实缺陷：
 * - 同一轮事件循环内两次 skip 会连续切两首（锁只保证串行，不保证幂等）
 * - `setPlaying({ isPlaying: "false" })` 会被当成 true
 * - 越界 seek 会在下一次自动播放检查时触发隐式跳歌
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom,
  addUser,
  addToQueue,
  ensurePlayback,
  getRoom,
  getRoomInternal,
  skipSong,
  setPlaying,
  seekTo,
  toggleCurrentDislike,
  setSongRequestEnabled,
  closeRoomManager,
} from './roomManager.js';

function newRoom(name) {
  const created = createRoom({ name, creatorId: 'owner' });
  assert.ok(created.id, `房间创建失败: ${created.error || ''}`);
  addUser(created.id, 'owner', '房主');
  return created.id;
}

test('并发 skip 只推进一首，不会吞掉队列', async () => {
  const roomId = newRoom('skip-dedupe');
  await addToQueue(roomId, { id: 'c1', name: '当前曲', source: 'test', artist: 'A' }, { id: 'owner', nickname: '房主' });
  await addToQueue(roomId, { id: 'n1', name: '第二首', source: 'test', artist: 'B' }, { id: 'owner', nickname: '房主' });
  await addToQueue(roomId, { id: 'n2', name: '第三首', source: 'test', artist: 'C' }, { id: 'owner', nickname: '房主' });
  await ensurePlayback(roomId);

  assert.equal(getRoom(roomId).current.name, '当前曲');

  // 模拟房主在同一个事件循环里连点两次切歌
  const [first, second] = await Promise.all([
    skipSong(roomId, 'owner'),
    skipSong(roomId, 'owner'),
  ]);

  assert.equal(first.error, undefined);
  assert.equal(second.error, undefined);
  assert.equal(getRoom(roomId).current.name, '第二首', '只应前进一首，而不是跳到第三首');
  assert.equal(getRoom(roomId).queue.length, 1, '队列只应消费一首');
});

test('setPlaying 拒绝非布尔值，避免 "false" 被当成播放', async () => {
  const roomId = newRoom('setplaying-types');
  await addToQueue(roomId, { id: 'c1', name: '当前曲', source: 'test', artist: 'A' }, { id: 'owner', nickname: '房主' });
  await ensurePlayback(roomId);
  setPlaying(roomId, 'owner', false);
  assert.equal(getRoomInternal(roomId).isPlaying, false);

  // 字符串 "false" 是 truthy；必须被拒绝，而不是误开启播放
  assert.equal(setPlaying(roomId, 'owner', 'false'), null);
  assert.equal(getRoomInternal(roomId).isPlaying, false, '非法类型不得改变播放状态');

  assert.equal(setPlaying(roomId, 'owner', 0), null);
  assert.equal(getRoomInternal(roomId).isPlaying, false);

  assert.ok(setPlaying(roomId, 'owner', true));
  assert.equal(getRoomInternal(roomId).isPlaying, true);
});

test('seek 超出时长会被夹到曲目末尾而不是隐式跳歌', async () => {
  const roomId = newRoom('seek-clamp');
  // duration 单位为毫秒
  await addToQueue(roomId, { id: 'c1', name: '当前曲', source: 'test', artist: 'A', duration: 60_000 }, { id: 'owner', nickname: '房主' });
  await ensurePlayback(roomId);

  const room = getRoomInternal(roomId);
  const durationSec = 60;
  seekTo(roomId, 'owner', durationSec + 3600);
  assert.ok(room.currentTime <= durationSec, `currentTime 应被夹到 ${durationSec}s，实际 ${room.currentTime}`);
  assert.equal(room.currentTime, durationSec);

  // 非法值仍应被拒绝
  assert.equal(seekTo(roomId, 'owner', Number.NaN), null);
  assert.equal(seekTo(roomId, 'owner', -5), null);
});

test('踩歌达到阈值时并发请求只切一次', async () => {
  const roomId = newRoom('dislike-dedupe');
  addUser(roomId, 'user-a', '成员A');
  addUser(roomId, 'user-b', '成员B');
  await addToQueue(roomId, { id: 'c1', name: '当前曲', source: 'test', artist: 'A' }, { id: 'owner', nickname: '房主' });
  await addToQueue(roomId, { id: 'n1', name: '第二首', source: 'test', artist: 'B' }, { id: 'owner', nickname: '房主' });
  await addToQueue(roomId, { id: 'n2', name: '第三首', source: 'test', artist: 'C' }, { id: 'owner', nickname: '房主' });
  await ensurePlayback(roomId);

  // 阈值设为 2 人
  setSongRequestEnabled(roomId, 'owner', { dislikeSkipMode: 'count', dislikeSkipThreshold: 2 });
  assert.equal(getRoom(roomId).dislikeSkipThreshold, 2);

  const [a, b] = await Promise.all([
    toggleCurrentDislike(roomId, 'user-a'),
    toggleCurrentDislike(roomId, 'user-b'),
  ]);

  assert.equal(getRoom(roomId).current.name, '第二首', '只应切一首');
  assert.equal(getRoom(roomId).queue.length, 1, '队列只应消费一首');
  // 至少有一个请求报告 skipped
  assert.ok(a.skipped || b.skipped);
});

test('创建后未加入的房间会排定销毁计时器（避免幽灵房间）', () => {
  const created = createRoom({ name: 'ghost-room', creatorId: 'ghost-owner' });
  const room = getRoomInternal(created.id);
  assert.ok(room, '房间应已创建');
  assert.ok(room.destroyTimer, '全新空房必须排定销毁计时器，否则会永久驻留内存');
});

test('加入房间会取消销毁计时器', () => {
  const created = createRoom({ name: 'revive-room', creatorId: 'owner' });
  addUser(created.id, 'owner', '房主');
  const room = getRoomInternal(created.id);
  assert.equal(room.destroyTimer, null, '有用户在场时不应保留销毁计时器');
});

after(async () => {
  await closeRoomManager();
});
