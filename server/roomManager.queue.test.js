import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, addUser, addToQueue, getRoomInternal, removeSongsFromQueue, removeFromQueue, setRoomAdmin, closeRoomManager } from './roomManager.js';

async function fixture() {
  const { id } = createRoom({ name: 'queue-management', creatorId: 'owner' });
  for (const [userId, name] of [['owner', '房主'], ['a', '成员A'], ['b', '成员B']]) addUser(id, userId, name);
  for (const [songId, userId] of [['playing', 'owner'], ['a1', 'a'], ['a2', 'a'], ['b1', 'b']]) {
    const result = await addToQueue(id, { id: songId, name: songId, source: 'test', duration: 300_000 }, { id: userId, nickname: userId });
    assert.equal(result.error, undefined);
  }
  return { id, room: getRoomInternal(id) };
}

test('members can atomically remove their own selection without touching playback', async () => {
  const { id, room } = await fixture();
  const current = room.current;
  const ids = room.queue.filter((s) => s.requestedById === 'a').map((s) => s.queueId);
  room.jumpRequests = ids.map((queueId) => ({ id: queueId, queueId }));
  const result = removeSongsFromQueue(id, 'a', [...ids, ids[0]]);
  assert.equal(result.error, undefined);
  assert.equal(result.removed, 2);
  assert.equal(room.current, current);
  assert.equal(room.isPlaying, true);
  assert.deepEqual(room.queue.map((s) => s.id), ['b1']);
  assert.deepEqual(room.jumpRequests, []);
  assert.ok(result.systemMessage.text.includes('2 首'));
});

test('mixed ownership, stale selections and current track fail without partial deletion', async () => {
  const { id, room } = await fixture();
  const before = room.queue.map((s) => s.queueId);
  for (const [actor, ids] of [
    ['a', [before[0], before[2]]], ['owner', [before[0], 'missing']],
    ['owner', [before[0], room.current.queueId]], ['outsider', [before[0]]],
  ]) {
    assert.ok(removeSongsFromQueue(id, actor, ids).error);
    assert.deepEqual(room.queue.map((s) => s.queueId), before);
  }
});

test('owners and room admins can remove others’ queued songs; single removal stays compatible', async () => {
  const { id, room } = await fixture();
  setRoomAdmin(id, 'owner', 'b', true);
  assert.equal(removeSongsFromQueue(id, 'b', [room.queue[0].queueId, room.queue[1].queueId]).removed, 2);
  assert.equal(removeFromQueue(id, 'owner', room.queue[0].queueId).removed, 1);
  assert.equal(room.queue.length, 0);
  assert.ok(room.current);
});

test('batch payloads are bounded and invalid inputs leave the queue intact', async () => {
  const { id, room } = await fixture();
  const size = room.queue.length;
  for (const ids of [undefined, null, [], 'id', [1], [''], ['a'.repeat(129)], Array(201).fill('id')]) {
    assert.ok(removeSongsFromQueue(id, 'owner', ids).error);
    assert.equal(room.queue.length, size);
  }
});

after(() => closeRoomManager());
