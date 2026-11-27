import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomState } from '../types';

type Ack = (error: Error | null, response?: Record<string, unknown>) => void;
type Listener = (...args: unknown[]) => void;

class TestSocket {
  connected = false;
  active = false;
  autoConnect = true;
  id = 'user-1';
  io = { engine: { transport: { name: 'websocket' } } };
  listeners = new Map<string, Set<Listener>>();
  sent: { event: string; payload: unknown }[] = [];
  respond: (event: string, payload: unknown, ack: Ack) => void = (event, payload, ack) => {
    if (event === 'join_room') {
      const { roomId } = payload as { roomId: string };
      ack(null, joinResponse(roomId));
    } else {
      ack(null, { success: true });
    }
  };

  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  once(event: string, listener: Listener) {
    const once: Listener = (...args) => {
      this.off(event, once);
      listener(...args);
    };
    return this.on(event, once);
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  receive(event: string, ...args: unknown[]) {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args);
  }

  connect = vi.fn(() => {
    this.active = true;
    if (this.autoConnect) {
      this.connected = true;
      this.receive('connect');
    }
    return this;
  });

  disconnect = vi.fn(() => {
    const wasConnected = this.connected;
    this.connected = false;
    this.active = false;
    // Socket.IO does not emit disconnect for an unfinished connection.
    if (wasConnected) this.receive('disconnect', 'io client disconnect');
    return this;
  });

  timeout() {
    return {
      emit: (event: string, payload: unknown, ack: Ack) => {
        this.sent.push({ event, payload });
        this.respond(event, payload, ack);
      },
    };
  }
}

const state = vi.hoisted(() => ({
  socket: null as TestSocket | null,
  room: {} as Record<string, unknown>,
  bootstrap: vi.fn<() => Promise<string>>(),
  chat: { reset: vi.fn(), clear: vi.fn() },
  history: { setSongs: vi.fn(), clear: vi.fn() },
  audio: {
    setPlaybackVersion: vi.fn(),
    setTrackLoading: vi.fn(),
    setNeedsAudioUnlock: vi.fn(),
    setSmoothPlaybackTime: vi.fn(),
  },
}));

vi.mock('react', () => ({
  useEffect: (effect: () => void) => effect(),
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
}));
vi.mock('socket.io-client', () => ({ io: () => state.socket }));
vi.mock('../stores/roomStore', () => ({
  useRoomStore: Object.assign((selector: (room: typeof state.room) => unknown) => selector(state.room), {
    getState: () => state.room,
  }),
}));
vi.mock('../stores/chatStore', () => ({ useChatStore: { getState: () => state.chat } }));
vi.mock('../stores/songHistoryStore', () => ({ useSongHistoryStore: { getState: () => state.history } }));
vi.mock('../stores/audioStore', () => ({ useAudioStore: { getState: () => state.audio } }));
vi.mock('../api/music', () => ({ songKey: () => '' }));
vi.mock('../lib/audioElement', () => ({ stopSharedAudio: vi.fn() }));
vi.mock('../lib/driftController', () => ({ resetDriftController: vi.fn() }));
vi.mock('../lib/playbackSync', () => ({ resetPhaseSync: vi.fn() }));
vi.mock('../lib/syncStateMachine', () => ({ resetSyncStateMachine: vi.fn() }));
vi.mock('../lib/songPreloadCache', () => ({ prefetchUpcomingFromRoom: vi.fn() }));
vi.mock('../lib/playbackState', () => ({ resetPlaybackStateCache: vi.fn() }));
vi.mock('../lib/playbackSchedule', () => ({
  schedulePlaybackState: vi.fn(), seedPlaybackFromRoom: vi.fn(), resetPlaybackScheduling: vi.fn(),
}));
vi.mock('../lib/clientId', () => ({ rememberClientIdentity: vi.fn() }));
vi.mock('../lib/sessionBootstrap', () => ({
  requireSessionBootstrap: () => state.bootstrap(), resetSessionBootstrap: vi.fn(),
}));
vi.mock('../lib/mergeRoomState', () => ({ mergeRoomState: (room: RoomState) => room }));
vi.mock('../lib/debugTools', () => ({
  debugLine: vi.fn(), debugLog: vi.fn(), resetDriftHistogram: vi.fn(), setDebugSocketProvider: vi.fn(),
}));
vi.mock('../lib/reportTrackDuration', () => ({ bindReportTrackDurationSocket: vi.fn() }));

function room(id: string): RoomState {
  return {
    id, name: id, ownerId: 'user-1', queue: [], current: null, isPlaying: false,
    currentTime: 0, users: [], userCount: 0, jumpRequests: [], skipRequests: [],
  };
}

function joinResponse(roomId: string) {
  return { success: true, room: room(roomId), socketId: 'user-1' };
}

function defer<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.stubGlobal('window', globalThis);
  state.bootstrap.mockReset().mockResolvedValue('client-1');
  state.socket = new TestSocket();
  const update = (values: Record<string, unknown>) => Object.assign(state.room, values);
  state.room = {
    room: null, nickname: 'listener', mySocketId: null,
    setRoom: (next: RoomState | null) => update({ room: next }),
    syncRolesFromRoom: vi.fn(),
    setNickname: (nickname: string) => update({ nickname }),
    setConnectionInfo: (mySocketId: string | null) => update({ mySocketId }),
    setReconnecting: (isReconnecting: boolean) => update({ isReconnecting }),
    setExitReason: (exitReason: string | null) => update({ exitReason }),
    resetSession: () => update({ room: null, mySocketId: null, isReconnecting: false }),
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('socket session lifecycle', () => {
  it('restarts an unfinished connection after the first connection timeout', async () => {
    state.socket!.active = true;
    const { useSocket } = await import('./useSocket');
    const result = useSocket().joinRoom('room-a', 'listener');

    await vi.advanceTimersByTimeAsync(8000);

    expect(state.socket!.disconnect).toHaveBeenCalledOnce();
    expect(state.socket!.connect).toHaveBeenCalledOnce();
    await expect(result).resolves.toMatchObject({ success: true });
    expect(state.room.room).toMatchObject({ id: 'room-a' });
  });

  it('ignores a successful rejoin response received after leaving the room', async () => {
    const { useSocket } = await import('./useSocket');
    const session = useSocket();
    await session.joinRoom('room-a', 'listener');
    let rejoinAck!: Ack;
    state.socket!.respond = (event, _payload, ack) => {
      if (event === 'join_room') rejoinAck = ack;
      else ack(null, { success: true });
    };
    state.socket!.receive('disconnect', 'transport close');
    await vi.advanceTimersByTimeAsync(800);
    expect(rejoinAck).toBeTypeOf('function');

    await session.leaveRoom();
    rejoinAck(null, joinResponse('room-a'));
    await vi.advanceTimersByTimeAsync(0);

    expect(state.room.room).toBeNull();
    expect(state.room.isReconnecting).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a newly joined room when an older rejoin acknowledges later', async () => {
    const { useSocket } = await import('./useSocket');
    const session = useSocket();
    await session.joinRoom('room-a', 'listener');
    let rejoinAck!: Ack;
    state.socket!.respond = (event, payload, ack) => {
      const roomId = (payload as { roomId?: string }).roomId;
      if (event === 'join_room' && roomId === 'room-a') rejoinAck = ack;
      else if (event === 'join_room') ack(null, joinResponse(roomId!));
      else ack(null, { success: true });
    };
    state.socket!.receive('disconnect', 'transport close');
    await vi.advanceTimersByTimeAsync(800);

    await session.joinRoom('room-b', 'listener');
    rejoinAck(null, joinResponse('room-a'));
    await vi.advanceTimersByTimeAsync(0);

    expect(state.room.room).toMatchObject({ id: 'room-b' });
  });

  it('does not emit a stale rejoin after a pending bootstrap finishes', async () => {
    const { useSocket } = await import('./useSocket');
    const session = useSocket();
    await session.joinRoom('room-a', 'listener');
    const bootstrap = defer<string>();
    state.bootstrap.mockReturnValueOnce(bootstrap.promise);
    state.socket!.receive('disconnect', 'transport close');
    await vi.advanceTimersByTimeAsync(800);

    await session.leaveRoom();
    bootstrap.resolve('client-1');
    await vi.advanceTimersByTimeAsync(0);

    expect(state.socket!.sent.filter(({ event }) => event === 'join_room')).toHaveLength(1);
    expect(state.room.room).toBeNull();
  });
});
