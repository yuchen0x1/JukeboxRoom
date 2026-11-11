/**
 * Socket.IO 事件处理加固。
 *
 * 背景（真实可复现的进程级故障）：
 * - Socket.IO 通过 `process.nextTick` 派发事件。监听器内部抛出的同步异常不会
 *   被 Socket.IO 捕获（只捕获它自己的 `run()` 阶段错误），会冒泡成
 *   `uncaughtException`。本进程的 uncaughtException 处理会调用
 *   `markRuntimeUnhealthy`，使 `/api/health/ready` 永久返回 503 —— 一个匿名
 *   客户端发一次非法 payload 就能摘掉整个实例。
 * - 典型触发：`socket.on('join_room', ({ roomId }) => ...)` 收到 `null`/字符串
 *   时解构直接抛 TypeError。
 * - 异步监听器的 rejection 无人接管，会进入 `unhandledRejection`，客户端 ack
 *   永远不返回，UI 卡在 pending。
 *
 * 这个模块把每个监听器包一层：
 * 1. payload 归一化为对象（非对象一律视为空对象），解构安全；
 * 2. 同步异常与异步 rejection 都被捕获，记录日志并给客户端明确失败 ack；
 * 3. 注册 `socket.on('error')`，避免 Socket.IO 抛出的传输层错误无人处理。
 */

const PASSTHROUGH_EVENTS = new Set(['disconnect', 'disconnecting', 'error']);

/**
 * @param {import('socket.io').Socket} socket
 * @param {{ logger?: { error: Function } }} [options]
 */
export function hardenSocket(socket, options = {}) {
  const logger = options.logger || console;
  const rawOn = socket.on.bind(socket);

  function report(event, error) {
    const target = logger.error || console.error;
    target.call(logger, 'socket event failed', {
      context: 'socket-handler',
      event,
      socketId: socket.id,
      reason: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  function safeAck(ack, event, error) {
    if (typeof ack !== 'function') return;
    try {
      ack({ success: false, error: '操作失败，请稍后重试', event });
    } catch (ackError) {
      report(event, ackError);
    }
  }

  socket.on = function guardedOn(event, handler) {
    if (typeof handler !== 'function') return rawOn(event, handler);
    // disconnect/disconnecting 的第二个参数是原因字符串而不是 ack，不能归一化 payload。
    if (PASSTHROUGH_EVENTS.has(event)) return rawOn(event, handler);

    const wrapped = function guardedHandler(payload, callback, ...rest) {
      const ack = typeof callback === 'function' ? callback : undefined;
      // Socket.IO 允许客户端不带 payload：undefined / null / 字符串 / 数组都归一化为 {}。
      const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload
        : {};

      let result;
      try {
        result = handler.call(this, safePayload, ack, ...rest);
      } catch (error) {
        report(event, error);
        safeAck(ack, event, error);
        return undefined;
      }

      if (result && typeof result.then === 'function') {
        return result.then(undefined, (error) => {
          report(event, error);
          safeAck(ack, event, error);
        });
      }
      return result;
    };

    return rawOn(event, wrapped);
  };

  // Socket.IO 的传输层错误（中间件拒绝、解析失败）需要有监听器，否则会走 `_onerror`。
  rawOn('error', (error) => {
    report('socket-error', error);
  });

  return socket;
}
