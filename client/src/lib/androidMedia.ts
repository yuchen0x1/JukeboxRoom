import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativeMediaState {
  queueId?: string | null;
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
  positionMs: number;
  durationMs: number;
  error?: string;
}

export interface NativeMediaPlugin {
  load(options: {
    url: string;
    queueId: string;
    title: string;
    artist: string;
    album?: string;
    artworkUrl?: string;
    position?: number;
    autoplay?: boolean;
  }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(options: { position: number }): Promise<void>;
  stop(): Promise<void>;
  setVolume(options: { volume: number }): Promise<void>;
  getState(): Promise<NativeMediaState>;
  addListener(eventName: 'state', listener: (state: NativeMediaState) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'transport', listener: (event: { queueId?: string | null; action: 'next' | 'previous' }) => void): Promise<PluginListenerHandle>;
}

export const NativeMedia = registerPlugin<NativeMediaPlugin>('NativeMedia');
