import type { Socket } from 'socket.io-client';
import { useRoomStore } from '../stores/roomStore';

let socketGetter: (() => Socket | null) | null = null;

export function bindReportTrackDurationSocket(getSocket: () => Socket | null) {
  socketGetter = getSocket;
}

/** 房主将音频/元数据时长回传服务端，供自动切歌（不触发 room_update） */
export function reportTrackDurationToServer(queueId: string, durationMs: number) {
  if (!queueId || !Number.isFinite(durationMs) || durationMs <= 0) return;
  const { isPlaybackLeader, room } = useRoomStore.getState();
  if (!isPlaybackLeader || !room?.current || room.current.queueId !== queueId) return;

  const existingMs = Number(room.current.duration || 0);
  const roundedMs = Math.round(durationMs);
  // 已有更长时长时不覆盖；允许用音频真实时长替换偏短的歌词估算
  if (existingMs > 0 && roundedMs <= existingMs) return;

  const socket = socketGetter?.();
  if (!socket?.connected) return;

  socket.timeout(5000).emit(
    'report_track_duration',
    { queueId, durationMs: roundedMs },
    () => {},
  );
}
