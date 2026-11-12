import { useEffect } from 'react';
import { resolveDesktopSongPlaybackUrls } from '../api/desktopMusic';
import { getSharedAudio } from '../lib/audioElement';
import { useDesktopMusicStore } from '../stores/desktopMusicStore';

const MEDIA_READY_TIMEOUT_MS = 20_000;

function mediaErrorMessage(code: number | undefined): string {
  if (code === 2) return '网络中断，音频没有完整加载。请重试或切换音源。';
  if (code === 3) return '音频格式无法解码。请重试或切换音源。';
  if (code === 4) return '当前音源暂不可播放。请重试或搜索其他版本。';
  return '播放失败。请重试或切换音源。';
}

function isAutoplayBlocked(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotAllowedError';
}

function waitForMediaReady(
  audio: HTMLAudioElement,
  signal: AbortSignal,
): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let timer: number | undefined;
    const cleanup = () => {
      audio.removeEventListener('canplay', onReady);
      audio.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
      if (timer !== undefined) window.clearTimeout(timer);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(mediaErrorMessage(audio.error?.code)));
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('音频加载已取消'));
    };

    audio.addEventListener('canplay', onReady, { once: true });
    audio.addEventListener('error', onError, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('音频加载超时，请检查代理或切换音源。'));
    }, MEDIA_READY_TIMEOUT_MS);

    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) onReady();
  });
}

async function loadAudioSource(
  audio: HTMLAudioElement,
  source: string,
  shouldPlay: boolean,
  signal: AbortSignal,
): Promise<void> {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  audio.src = source;
  const ready = waitForMediaReady(audio, signal);
  audio.load();
  await ready;
  if (shouldPlay) await audio.play();
}

export default function DesktopAudioEngine() {
  const current = useDesktopMusicStore((state) => state.current);
  const volume = useDesktopMusicStore((state) => state.volume);
  const playbackQuality = useDesktopMusicStore((state) => state.playbackQuality);

  useEffect(() => {
    const audio = getSharedAudio();
    const store = useDesktopMusicStore.getState();
    audio.preload = 'auto';
    audio.volume = store.volume;

    const handleTimeUpdate = () => useDesktopMusicStore.getState().setCurrentTime(audio.currentTime);
    const handleDuration = () => useDesktopMusicStore.getState().setDuration(audio.duration);
    const handleEnded = () => {
      const state = useDesktopMusicStore.getState();
      if (state.repeatMode === 'one') {
        audio.currentTime = 0;
        void audio.play().catch(() => state.setPlaybackError('无法继续播放当前歌曲，请重试。'));
        return;
      }
      state.playNextTrack(true);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDuration);
    audio.addEventListener('loadedmetadata', handleDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDuration);
      audio.removeEventListener('loadedmetadata', handleDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
    };
  }, []);

  useEffect(() => {
    const audio = getSharedAudio();
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = getSharedAudio();
    if (!current) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      useDesktopMusicStore.getState().setTrackLoading(false);
      return;
    }

    let active = true;
    let sourceReady = false;
    const abortController = new AbortController();
    const requestId = current.requestId;
    audio.pause();
    useDesktopMusicStore.getState().setTrackLoading(true);

    const handleError = () => {
      if (!active || !sourceReady) return;
      const state = useDesktopMusicStore.getState();
      if (state.current?.requestId !== requestId) return;
      state.setPlaying(false);
      state.setTrackLoading(false);
      state.setPlaybackError(mediaErrorMessage(audio.error?.code));
    };
    audio.addEventListener('error', handleError);

    const load = async () => {
      try {
        const urls = current.isLocal && current.localUrl
          ? { primary: current.localUrl }
          : await resolveDesktopSongPlaybackUrls(current, playbackQuality);
        if (!active) return;

        const latest = useDesktopMusicStore.getState();
        if (latest.current?.requestId !== requestId) return;
        const shouldPlay = latest.isPlaying;
        try {
          await loadAudioSource(audio, urls.primary, shouldPlay, abortController.signal);
        } catch (error) {
          if (
            !active
            || abortController.signal.aborted
            || !urls.fallback
            || isAutoplayBlocked(error)
          ) {
            throw error;
          }
          // A local media proxy can be unreachable while the user's system
          // proxy can still fetch the original CDN URL from Chromium.
          await loadAudioSource(audio, urls.fallback, shouldPlay, abortController.signal);
        }

        if (!active || useDesktopMusicStore.getState().current?.requestId !== requestId) return;
        sourceReady = true;
        useDesktopMusicStore.getState().setTrackLoading(false);
        if (shouldPlay) useDesktopMusicStore.getState().setPlaying(true);
      } catch (error) {
        if (
          !active
          || abortController.signal.aborted
          || useDesktopMusicStore.getState().current?.requestId !== requestId
        ) return;
        const message = error instanceof Error ? error.message : '音源解析失败';
        useDesktopMusicStore.getState().setPlaying(false);
        useDesktopMusicStore.getState().setTrackLoading(false);
        useDesktopMusicStore.getState().setPlaybackError(message);
      }
    };

    void load();
    return () => {
      active = false;
      abortController.abort();
      audio.removeEventListener('error', handleError);
    };
  }, [current?.requestId, playbackQuality]);

  return null;
}
