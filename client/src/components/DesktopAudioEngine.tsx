import { useEffect } from 'react';
import { resolveDesktopSongUrl } from '../api/desktopMusic';
import { getSharedAudio } from '../lib/audioElement';
import { useDesktopMusicStore } from '../stores/desktopMusicStore';

function mediaErrorMessage(code: number | undefined): string {
  if (code === 2) return '网络中断，音频没有完整加载。请重试或切换音源。';
  if (code === 3) return '音频格式无法解码。请重试或切换音源。';
  if (code === 4) return '当前音源暂不可播放。请重试或搜索其他版本。';
  return '播放失败。请重试或切换音源。';
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
    const handleError = () => {
      const state = useDesktopMusicStore.getState();
      state.setPlaying(false);
      state.setTrackLoading(false);
      state.setPlaybackError(mediaErrorMessage(audio.error?.code));
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDuration);
    audio.addEventListener('loadedmetadata', handleDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDuration);
      audio.removeEventListener('loadedmetadata', handleDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
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
    const requestId = current.requestId;
    audio.pause();
    useDesktopMusicStore.getState().setTrackLoading(true);

    const load = async () => {
      try {
        const src = current.isLocal && current.localUrl
          ? current.localUrl
          : await resolveDesktopSongUrl(current, playbackQuality);
        if (!active) return;

        const latest = useDesktopMusicStore.getState();
        if (latest.current?.requestId !== requestId) return;
        audio.src = src;
        audio.load();

        const shouldPlay = latest.isPlaying;
        if (shouldPlay) {
          await audio.play();
          if (!active || useDesktopMusicStore.getState().current?.requestId !== requestId) return;
          useDesktopMusicStore.getState().setTrackLoading(false);
          useDesktopMusicStore.getState().setPlaying(true);
        } else {
          const markReady = () => {
            if (active && useDesktopMusicStore.getState().current?.requestId === requestId) {
              useDesktopMusicStore.getState().setTrackLoading(false);
            }
          };
          audio.addEventListener('canplay', markReady, { once: true });
          if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) markReady();
        }
      } catch (error) {
        if (!active || useDesktopMusicStore.getState().current?.requestId !== requestId) return;
        const message = error instanceof Error ? error.message : '音源解析失败';
        useDesktopMusicStore.getState().setPlaying(false);
        useDesktopMusicStore.getState().setTrackLoading(false);
        useDesktopMusicStore.getState().setPlaybackError(message);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [current?.requestId, playbackQuality]);

  return null;
}
