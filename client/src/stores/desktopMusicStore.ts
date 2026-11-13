import { create } from 'zustand';
import type { MusicSource, Song } from '../types';

const STORAGE_KEY = 'jukeboxroom:desktop-music:v1';
const MAX_HISTORY = 500;
const MAX_SEARCHES = 20;

export type DesktopView = 'discover' | 'search' | 'favorites' | 'history' | 'playlists' | 'local' | 'settings';
export type DesktopRepeatMode = 'off' | 'all' | 'one';
export type DesktopSourceFilter = 'all' | MusicSource;

export interface DesktopTrack extends Song {
  trackKey: string;
  requestId: number;
  isLocal?: boolean;
  localUrl?: string;
  fileName?: string;
}

type DesktopTrackInput = Omit<DesktopTrack, 'trackKey' | 'requestId'>
  & Partial<Pick<DesktopTrack, 'trackKey' | 'requestId'>>;

export interface DesktopPlaylist {
  id: string;
  name: string;
  tracks: Song[];
  createdAt: number;
  updatedAt: number;
}

interface PersistedDesktopMusicState {
  current: DesktopTrack | null;
  queue: DesktopTrack[];
  favorites: Song[];
  history: DesktopTrack[];
  playlists: DesktopPlaylist[];
  recentSearches: string[];
  volume: number;
  playbackQuality: string;
  repeatMode: DesktopRepeatMode;
  shuffle: boolean;
  sourceFilter: DesktopSourceFilter;
}

interface DesktopMusicState extends PersistedDesktopMusicState {
  isPlaying: boolean;
  trackLoading: boolean;
  playbackError: string;
  currentTime: number;
  duration: number;
  autoplayOnLoad: boolean;
  setCurrent: (track: DesktopTrack | null) => void;
  setTrackLoading: (loading: boolean) => void;
  setPlaybackError: (message: string) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  playTrack: (track: DesktopTrackInput) => void;
  retryCurrent: () => void;
  addToQueue: (track: DesktopTrackInput, playNext?: boolean) => void;
  removeFromQueue: (trackKey: string) => void;
  clearQueue: () => void;
  playQueueAt: (index: number) => void;
  playNextTrack: (ended?: boolean) => void;
  playPreviousTrack: () => void;
  seekTo: (time: number) => void;
  toggleFavorite: (song: Song) => void;
  addTrackToPlaylist: (playlistId: string, song: Song) => void;
  removeTrackFromPlaylist: (playlistId: string, song: Song) => void;
  createPlaylist: (name: string) => string | null;
  renamePlaylist: (playlistId: string, name: string) => void;
  deletePlaylist: (playlistId: string) => void;
  addRecentSearch: (query: string) => void;
  setVolume: (volume: number) => void;
  setPlaybackQuality: (quality: string) => void;
  setRepeatMode: (mode: DesktopRepeatMode) => void;
  toggleShuffle: () => void;
  setSourceFilter: (source: DesktopSourceFilter) => void;
}

function songKey(song: Pick<Song, 'id' | 'source'>): string {
  return `${song.source || 'netease'}:${song.id}`;
}

function normalizeSavedState(value: unknown): Partial<PersistedDesktopMusicState> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const saved = value as Partial<PersistedDesktopMusicState>;
  return {
    current: saved.current && !saved.current.isLocal ? saved.current : null,
    queue: Array.isArray(saved.queue) ? saved.queue.filter((track) => !track.isLocal) : [],
    favorites: Array.isArray(saved.favorites) ? saved.favorites : [],
    history: Array.isArray(saved.history) ? saved.history.filter((track) => !track.isLocal) : [],
    playlists: Array.isArray(saved.playlists) ? saved.playlists : [],
    recentSearches: Array.isArray(saved.recentSearches) ? saved.recentSearches : [],
    volume: Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, Number(saved.volume))) : 0.8,
    playbackQuality: typeof saved.playbackQuality === 'string' ? saved.playbackQuality : 'standard',
    repeatMode: saved.repeatMode === 'all' || saved.repeatMode === 'one' ? saved.repeatMode : 'off',
    shuffle: Boolean(saved.shuffle),
    sourceFilter: saved.sourceFilter === 'netease' || saved.sourceFilter === 'tencent' || saved.sourceFilter === 'kugou' || saved.sourceFilter === 'qishui' || saved.sourceFilter === 'migu'
      ? saved.sourceFilter
      : 'all',
  };
}

function readSavedState(): Partial<PersistedDesktopMusicState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSavedState(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

const savedState = readSavedState();
let requestSequence = [savedState.current, ...(savedState.queue || []), ...(savedState.history || [])]
  .reduce((largest, track) => Math.max(largest, Number.isFinite(track?.requestId) ? Number(track?.requestId) : 0), 0);

export const useDesktopMusicStore = create<DesktopMusicState>((set, get) => ({
  current: null,
  queue: [],
  favorites: [],
  history: [],
  playlists: [],
  recentSearches: [],
  volume: 0.8,
  playbackQuality: 'standard',
  repeatMode: 'off',
  shuffle: false,
  sourceFilter: 'all',
  isPlaying: false,
  trackLoading: false,
  playbackError: '',
  currentTime: 0,
  duration: 0,
  autoplayOnLoad: false,
  ...savedState,

  setCurrent: (current) => set({ current }),
  setTrackLoading: (trackLoading) => set({ trackLoading }),
  setPlaybackError: (playbackError) => set({ playbackError }),
  setCurrentTime: (currentTime) => set({ currentTime: Math.max(0, currentTime) }),
  setDuration: (duration) => set({ duration: Number.isFinite(duration) ? Math.max(0, duration) : 0 }),
  setPlaying: (isPlaying) => set({ isPlaying, autoplayOnLoad: false }),
  togglePlaying: () => set((state) => ({
    isPlaying: !state.isPlaying,
    autoplayOnLoad: false,
    playbackError: '',
  })),

  playTrack: (input) => {
    const trackKey = input.trackKey || `${input.isLocal ? 'local' : songKey(input)}:${Date.now()}:${requestSequence}`;
    const track: DesktopTrack = { ...input, trackKey, requestId: ++requestSequence };
    const history = [track, ...get().history.filter((item) => songKey(item) !== songKey(track))].slice(0, MAX_HISTORY);
    set({
      current: track,
      history,
      isPlaying: true,
      trackLoading: true,
      playbackError: '',
      currentTime: 0,
      duration: Math.max(0, Number(track.duration || 0) / 1000),
      autoplayOnLoad: true,
    });
  },

  retryCurrent: () => {
    const current = get().current;
    if (!current) return;
    set({
      current: { ...current, requestId: ++requestSequence },
      isPlaying: true,
      trackLoading: true,
      playbackError: '',
      currentTime: 0,
      autoplayOnLoad: true,
    });
  },

  addToQueue: (input, playNext = false) => {
    const track: DesktopTrack = {
      ...input,
      trackKey: input.trackKey || `${input.isLocal ? 'local' : songKey(input)}:${Date.now()}:${requestSequence++}`,
      requestId: input.requestId ?? 0,
    };
    set((state) => ({ queue: playNext ? [track, ...state.queue] : [...state.queue, track] }));
  },
  removeFromQueue: (trackKey) => set((state) => ({ queue: state.queue.filter((track) => track.trackKey !== trackKey) })),
  clearQueue: () => set({ queue: [] }),
  playQueueAt: (index) => {
    const queue = get().queue;
    const track = queue[index];
    if (!track) return;
    set({ queue: queue.filter((_, itemIndex) => itemIndex !== index) });
    get().playTrack(track);
  },
  playNextTrack: (ended = false) => {
    const state = get();
    if (state.queue.length) {
      const index = state.shuffle && state.queue.length > 1
        ? Math.floor(Math.random() * state.queue.length)
        : 0;
      state.playQueueAt(index);
      return;
    }
    if (state.repeatMode === 'all' && state.history.length > 1) {
      state.playTrack(state.history[state.history.length - 1]);
      return;
    }
    if (ended) set({ isPlaying: false, autoplayOnLoad: false, trackLoading: false });
  },
  playPreviousTrack: () => {
    const state = get();
    if (state.history.length < 2) {
      state.seekTo(0);
      return;
    }
    state.playTrack(state.history[1]);
  },
  seekTo: (time) => {
    const duration = get().duration;
    set({ currentTime: Math.min(Math.max(0, time), duration || Math.max(0, time)) });
  },

  toggleFavorite: (song) => {
    set((state) => {
      const key = songKey(song);
      const exists = state.favorites.some((item) => songKey(item) === key);
      return { favorites: exists ? state.favorites.filter((item) => songKey(item) !== key) : [{ ...song }, ...state.favorites] };
    });
  },
  addTrackToPlaylist: (playlistId, song) => set((state) => ({
    playlists: state.playlists.map((playlist) => {
      if (playlist.id !== playlistId || playlist.tracks.some((item) => songKey(item) === songKey(song))) return playlist;
      return { ...playlist, tracks: [...playlist.tracks, { ...song }], updatedAt: Date.now() };
    }),
  })),
  removeTrackFromPlaylist: (playlistId, song) => set((state) => ({
    playlists: state.playlists.map((playlist) => playlist.id === playlistId
      ? { ...playlist, tracks: playlist.tracks.filter((item) => songKey(item) !== songKey(song)), updatedAt: Date.now() }
      : playlist),
  })),
  createPlaylist: (name) => {
    const trimmed = name.trim().slice(0, 50);
    if (!trimmed) return null;
    const id = `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({ playlists: [{ id, name: trimmed, tracks: [], createdAt: Date.now(), updatedAt: Date.now() }, ...state.playlists] }));
    return id;
  },
  renamePlaylist: (playlistId, name) => {
    const trimmed = name.trim().slice(0, 50);
    if (!trimmed) return;
    set((state) => ({ playlists: state.playlists.map((playlist) => playlist.id === playlistId
      ? { ...playlist, name: trimmed, updatedAt: Date.now() }
      : playlist) }));
  },
  deletePlaylist: (playlistId) => set((state) => ({ playlists: state.playlists.filter((playlist) => playlist.id !== playlistId) })),
  addRecentSearch: (query) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    set((state) => ({ recentSearches: [trimmed, ...state.recentSearches.filter((item) => item !== trimmed)].slice(0, MAX_SEARCHES) }));
  },
  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
  setPlaybackQuality: (playbackQuality) => set((state) => state.playbackQuality === playbackQuality ? state : ({
    playbackQuality,
    current: state.current ? { ...state.current, requestId: ++requestSequence } : null,
  })),
  setRepeatMode: (repeatMode) => set({ repeatMode }),
  toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
  setSourceFilter: (sourceFilter) => set({ sourceFilter }),
}));

function getPersistedState(state: DesktopMusicState): PersistedDesktopMusicState {
  return {
    current: state.current?.isLocal ? null : state.current,
    queue: state.queue.filter((track) => !track.isLocal),
    favorites: state.favorites,
    history: state.history.filter((track) => !track.isLocal),
    playlists: state.playlists,
    recentSearches: state.recentSearches,
    volume: state.volume,
    playbackQuality: state.playbackQuality,
    repeatMode: state.repeatMode,
    shuffle: state.shuffle,
    sourceFilter: state.sourceFilter,
  };
}

export async function hydrateDesktopMusicState(): Promise<void> {
  const bridge = typeof window === 'undefined' ? undefined : window.jukeboxWindow;
  if (!bridge) return;
  try {
    const saved = await bridge.loadMusicState();
    if (saved) {
      useDesktopMusicStore.setState({
        ...normalizeSavedState(saved),
        isPlaying: false,
        trackLoading: false,
        currentTime: 0,
        duration: 0,
        autoplayOnLoad: false,
      });
    } else {
      await bridge.saveMusicState(getPersistedState(useDesktopMusicStore.getState()));
    }
  } catch {
    // The player remains usable when local persistence is unavailable.
  }
}

let lastPersistedState = '';
useDesktopMusicStore.subscribe((state) => {
  const persisted = getPersistedState(state);
  const serialized = JSON.stringify(persisted);
  if (serialized === lastPersistedState) return;
  lastPersistedState = serialized;

  try {
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Local persistence must not interrupt playback.
  }

  const bridge = typeof window === 'undefined' ? undefined : window.jukeboxWindow;
  if (bridge) void bridge.saveMusicState(persisted).catch(() => undefined);
});
