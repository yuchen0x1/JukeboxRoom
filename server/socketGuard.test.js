import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { hardenSocket } from './socketGuard.js';

/** 最小 socket 替身：只需要 .id / .on 与事件派发能力。 */
function createFakeSocket() {
  const emitter = new EventEmitter();
  const socket = {
    id: 'socket-1',
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
  };
  return hardenSocket(socket, { logger: { error() {} } });
}

function collectLogs() {
  const logs = [];
  return { logs, logger: { error(message, detail) { logs.push({ message, detail }); } } };
}

test('非对象 payload 归一化为空对象，解构不再抛异常', () => {
  const socket = createFakeSocket();
  const seen = [];
  socket.on('join_room', ({ roomId }) => { seen.push(roomId); });

  for (const payload of [undefined, null, 'oops', 42, [1, 2, 3]]) {
    assert.doesNotThrow(() => socket.emit('join_room', payload));
  }
  assert.deepEqual(seen, [undefined, undefined, undefined, undefined, undefined]);
});

test('同步异常被捕获，客户端收到失败 ack，不会冒泡', () => {
  const { logs, logger } = collectLogs();
  const socket = hardenSocket(createFakeSocket(), { logger });
  const acks = [];
  socket.on('add_song', () => { throw new Error('synthetic failure'); });

  assert.doesNotThrow(() => socket.emit('add_song', { song: {} }, (ack) => acks.push(ack)));
  assert.equal(acks.length, 1);
  assert.equal(acks[0].success, false);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].detail.event, 'add_song');
});

test('异步 rejection 被接管，ack 不会悬挂', async () => {
  const { logs, logger } = collectLogs();
  const socket = hardenSocket(createFakeSocket(), { logger });
  const acks = [];
  socket.on('skip_song', async () => { throw new Error('redis down'); });

  socket.emit('skip_song', {}, (ack) => acks.push(ack));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(acks.length, 1);
  assert.equal(acks[0].success, false);
  assert.equal(logs[0].detail.event, 'skip_song');
});

test('正常 handler 的 ack 与返回值不受影响', () => {
  const socket = createFakeSocket();
  const acks = [];
  socket.on('leave_room', (_payload, callback) => {
    callback({ success: true });
    return 'done';
  });

  socket.emit('leave_room', { any: 1 }, (ack) => acks.push(ack));
  assert.deepEqual(acks, [{ success: true }]);
});

test('disconnect 事件保持原签名（第二参数是原因）', () => {
  const socket = createFakeSocket();
  const received = [];
  socket.on('disconnect', (reason, extra) => received.push([reason, extra]));

  socket.emit('disconnect', 'client namespace disconnect', 'extra');
  assert.deepEqual(received, [['client namespace disconnect', 'extra']]);
});

test('未捕获的 socket error 会被记录而不是抛出', () => {
  const { logs, logger } = collectLogs();
  const socket = hardenSocket(createFakeSocket(), { logger });

  assert.doesNotThrow(() => socket.emit('error', new Error('transport reset')));
  assert.equal(logs.length, 1);
  assert.equal(logs[0].detail.event, 'socket-error');
});

test('自定义 socket 替身不会导致 hardenSocket 抛错', () => {
  const plain = { id: 'x', on() { return this; } };
  assert.doesNotThrow(() => hardenSocket(plain, { logger: { error() {} } }));
  assert.doesNotThrow(() => plain.emit?.('join_room', null));
});
