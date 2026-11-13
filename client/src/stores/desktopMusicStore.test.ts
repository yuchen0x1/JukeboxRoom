import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
import { hydrateDesktopMusicState, useDesktopMusicStore } from './desktopMusicStore';

const song = (id: string, name = `Song ${id}`): Song => ({
  id,
  source: 'netease',
  name,
  artist: 'Test Artist',
});

function installLocalStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}

afterEach(() => {
  useDesktopMusicStore.setState({
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
  });
  vi.unstubAllGlobals();
});

describe('desktop music library', () => {
  it('invalidates old playback responses when quality changes without losing the current position', () => {
    installLocalStorage();
    useDesktopMusicStore.getState().playTrack(song('quality'));
    useDesktopMusicStore.getState().setCurrentTime(12);
    const before = useDesktopMusicStore.getState().current!;
    useDesktopMusicStore.getState().setPlaybackQuality('lossless');
    const after = useDesktopMusicStore.getState().current!;
    expect(after.requestId).toBeGreaterThan(before.requestId);
    expect(after.trackKey).toBe(before.trackKey);
    expect(useDesktopMusicStore.getState().currentTime).toBe(12);
  });
  it('plays a queued track and keeps the remaining queue ordered', () => {
    installLocalStorage();
    const store = useDesktopMusicStore.getState();
    store.addToQueue(song('first'));
    store.addToQueue(song('next'), true);

    const next = useDesktopMusicStore.getState().queue[0];
    expect(next.name).toBe('Song next');
    expect(next.trackKey).toContain('netease:next:');
    useDesktopMusicStore.getState().playQueueAt(0);

    expect(useDesktopMusicStore.getState().current?.name).toBe('Song next');
    expect(useDesktopMusicStore.getState().queue.map((track) => track.name)).toEqual(['Song first']);
    expect(useDesktopMusicStore.getState().isPlaying).toBe(true);
  });

  it('toggles favorites and persists them to local storage', () => {
    const values = installLocalStorage();
    useDesktopMusicStore.getState().toggleFavorite(song('favorite'));

    expect(useDesktopMusicStore.getState().favorites).toEqual([song('favorite')]);
    expect(JSON.parse(values.get('jukeboxroom:desktop-music:v1') || '{}').favorites).toEqual([song('favorite')]);

    useDesktopMusicStore.getState().toggleFavorite(song('favorite'));
    expect(useDesktopMusicStore.getState().favorites).toEqual([]);
  });

  it('creates a local playlist and avoids duplicate tracks', () => {
    installLocalStorage();
    const playlistId = useDesktopMusicStore.getState().createPlaylist('Late night');
    expect(playlistId).toBeTruthy();
    if (!playlistId) return;

    useDesktopMusicStore.getState().addTrackToPlaylist(playlistId, song('one'));
    useDesktopMusicStore.getState().addTrackToPlaylist(playlistId, song('one'));

    const playlist = useDesktopMusicStore.getState().playlists[0];
    expect(playlist.name).toBe('Late night');
    expect(playlist.tracks.map((track) => track.id)).toEqual(['one']);
  });

  it('hydrates the library from the desktop profile and saves later changes', async () => {
    installLocalStorage();
    const favorite = song('saved-favorite');
    const loadMusicState = vi.fn().mockResolvedValue({
      current: null,
      queue: [],
      favorites: [favorite],
      history: [],
      playlists: [],
      recentSearches: ['saved search'],
      volume: 0.6,
      playbackQuality: 'higher',
      repeatMode: 'off',
      shuffle: false,
      sourceFilter: 'all',
    });
    const saveMusicState = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('window', { jukeboxWindow: { loadMusicState, saveMusicState } });

    await hydrateDesktopMusicState();
    expect(useDesktopMusicStore.getState().favorites).toEqual([favorite]);
    expect(useDesktopMusicStore.getState().recentSearches).toEqual(['saved search']);

    useDesktopMusicStore.getState().setVolume(0.35);
    expect(saveMusicState).toHaveBeenCalledWith(expect.objectContaining({ volume: 0.35 }));
  });
});
