import { useEffect } from 'react';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { usePrefetchTrackDuration } from '../hooks/usePrefetchTrackDuration';
import { useAudioStore } from '../stores/audioStore';
import { applyAudioVolume } from '../lib/audioElement';
import AudioUnlockOverlay from './AudioUnlockOverlay';

interface Props {
  tvMode?: boolean;
}

export default function AudioEngine({ tvMode = false }: Props) {
  const volume = useAudioStore((s) => s.volume);
  useAudioPlayer({ tvMode });
  usePrefetchTrackDuration();

  useEffect(() => {
    applyAudioVolume(volume);
  }, [volume]);

  return <AudioUnlockOverlay tvMode={tvMode} />;
}
