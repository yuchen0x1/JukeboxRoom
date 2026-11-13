import type { NativeMediaState } from './androidMedia';

export function nativeQueueId(track: { trackKey: string; requestId: number }): string {
  return `${track.trackKey}:request:${track.requestId}`;
}

export function acceptsNativeState(state: NativeMediaState, track: { trackKey: string; requestId: number } | null): boolean {
  return Boolean(track && state.queueId === nativeQueueId(track));
}
