import { memo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Play, Pause, SkipForward, ChevronUp, ChevronLeft, Loader2, ListMusic, Music2, RefreshCw } from 'lucide-react';
import { useRoomStore } from '../stores/roomStore';
import { useAudioStore } from '../stores/audioStore';
import { useSocket } from '../hooks/useSocket';

import SourceBadge from './SourceBadge';
import SongCover from './SongCover';

import ProgressBar from './ProgressBar';
import PlaybackProgressBar from './playback/PlaybackProgressBar';
import PlaybackTimeLabel from './playback/PlaybackTimeLabel';
import MiniPlayerLyricTicker from './playback/MiniPlayerLyricTicker';
import VolumeControl from './VolumeControl';
import FavoriteButton from './FavoriteButton';
import Tooltip from './Tooltip';
import { updateMediaSessionPlaybackState } from '../lib/mediaSession';
import { invalidateTrackUrlCache } from '../lib/songPreloadCache';

interface Props {
  onExpand: () => void;
  onPrevious?: () => void;
  onQueueClick?: () => void;
  transparentBar?: boolean;
  barClassName?: string;
  variant?: 'default' | 'immersive';
}



export default memo(function MiniPlayer({
  onExpand,
  onPrevious,
  onQueueClick,
  transparentBar = true,
  barClassName,
  variant = 'default',
}: Props) {

  const { current, isPlaying, fmLoading, skipRequests, hasRoom } = useRoomStore(useShallow((s) => {
    const r = s.room;
    return {
      current: r?.current ?? null,
      isPlaying: r?.isPlaying ?? false,
      fmLoading: Boolean(r?.randomLoading && !r?.current),
      skipRequests: r?.skipRequests,
      hasRoom: Boolean(r),
    };
  }));

  const canControlPlayback = useRoomStore((s) => s.canControlPlayback);
  const trackLoading = useAudioStore((s) => s.trackLoading);
  const playbackError = useAudioStore((s) => s.playbackError);
  const setTrackLoading = useAudioStore((s) => s.setTrackLoading);
  const seekPlayback = useAudioStore((s) => s.seekPlayback);
  const localPlayback = useAudioStore((s) => s.localPlayback);
  const { togglePlay, skipSong, requestSkip } = useSocket();

  const [skipError, setSkipError] = useState('');
  const [skipMsg, setSkipMsg] = useState('');
  const mySocketId = useRoomStore((s) => s.mySocketId);
  const hasPendingSkip = skipRequests?.some((r) => r.requestedBy === mySocketId) ?? false;

  const handlePlayPause = () => {
    if (!hasRoom) return;
    const next = !isPlaying;
    if (!next) {
      localPlayback?.(false);
    }
    updateMediaSessionPlaybackState(next ? 'playing' : 'paused');
    togglePlay(next);
    if (next) localPlayback?.(true);
  };

  const handleSeek = (time: number) => seekPlayback?.(time);

  const handleRetryCurrent = () => {
    if (!current) return;
    invalidateTrackUrlCache(current);
    useAudioStore.getState().setPlaybackError(null);
    setTrackLoading(true);
    useAudioStore.getState().requestTrackReload();
  };

  const handleSkip = async () => {
    setSkipError('');
    setSkipMsg('');
    setTrackLoading(true);
    const res = await skipSong();
    if (!res.success) {
      setTrackLoading(false);
      setSkipError(res.error || '切歌失败');
    }
  };

  const handleRequestSkip = async () => {
    setSkipError('');
    setSkipMsg('');
    const res = await requestSkip();
    if (res.success) {
      setSkipMsg('已提交切歌申请');
      setTimeout(() => setSkipMsg(''), 3000);
    } else {
      setSkipError(res.error || '申请失败');
    }
  };



  if (!current && !fmLoading) return null;

  if (variant === 'immersive') {
    if (fmLoading) {
      return (
        <div id="bottom-bar" className="mineradio-bottom-bar visible room-immersive-bottom mx-auto">
          <div className="mineradio-progress-bar">
            <div className="mineradio-progress-fill" style={{ width: '0%' }} />
          </div>
          <div className="mineradio-controls">
            <div className="control-cluster actions">
              <div className="control-track">
                <div className="control-cover cover-empty" aria-hidden />
                <div className="control-meta">
                  <div className="control-title">私人漫游</div>
                  <div className="control-artist">正在加载…</div>
                </div>
              </div>
            <div className="mineradio-ctrl-btn mineradio-ctrl-btn-placeholder" aria-hidden />
            </div>
            <div className="control-cluster transport">
              <button type="button" className="mineradio-play-btn" disabled aria-label="播放控制">
                <Loader2 className="h-5 w-5 animate-spin" />
              </button>
            </div>
            <div className="control-cluster modes">
            <div className="mineradio-ctrl-btn mineradio-ctrl-btn-placeholder" aria-hidden />
              <div className="mineradio-time-display">0:00 / 0:00</div>
            </div>
          </div>
        </div>
      );
    }

    if (!current) return null;

    return (
      <div id="bottom-bar" className="mineradio-bottom-bar visible room-immersive-bottom mx-auto">
        {playbackError?.queueId === current.queueId && (
          <div className="mb-1 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-rose-100/90" role="alert">
            <span>{playbackError.message}</span>
            <button type="button" onClick={handleRetryCurrent} className="inline-flex items-center gap-1 text-[var(--om-accent)]">
              <RefreshCw className="h-3.5 w-3.5" />重试
            </button>
            {canControlPlayback && <button type="button" onClick={handleSkip} className="text-rose-200">切歌</button>}
          </div>
        )}
        {(skipError || skipMsg) && (
          <p className={`mb-1 text-center text-[10px] ${skipMsg ? 'text-amber-300' : 'text-red-300'}`}>
            {skipMsg || skipError}
          </p>
        )}
        <PlaybackProgressBar
          song={current}
          onSeek={handleSeek}
          disabled={!current.duration}
          variant="mineradio"
        />
        <div className="mineradio-controls">
          <div className="control-cluster actions">
            <button type="button" className="control-track text-left" onClick={onExpand}>
              <SongCover
                song={current}
                size="tiny"
                eager
                className="control-cover"
              />
              <div className="control-meta">
                <div className="control-title">{current.name}</div>
                <div className="control-artist">{current.artist}</div>
              </div>
            </button>
            <FavoriteButton
              song={current}
              className="mineradio-ctrl-btn text-white/65 hover:text-rose-300"
              iconClassName="h-4 w-4"
            />
          </div>

          <div className="control-cluster transport">
            <Tooltip content={canControlPlayback ? '暂停/播放' : isPlaying ? '房主正在播放' : '房主已暂停'}>
              <button
                type="button"
                onClick={canControlPlayback ? handlePlayPause : undefined}
                disabled={trackLoading || !canControlPlayback}
                className="mineradio-play-btn"
                aria-label="播放控制"
              >
                {trackLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="ml-0.5 h-5 w-5" />
                )}
              </button>
            </Tooltip>

            {canControlPlayback ? (
              <Tooltip content="切歌">
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={trackLoading}
                  className="mineradio-ctrl-btn"
                  aria-label="切歌"
                >
                  {trackLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                </button>
              </Tooltip>
            ) : (
              <Tooltip content={hasPendingSkip ? '已申请切歌' : '申请切歌'}>
                <button
                  type="button"
                  onClick={handleRequestSkip}
                  disabled={hasPendingSkip}
                  className="mineradio-ctrl-btn"
                  aria-label="申请切歌"
                >
                  <SkipForward className="h-4 w-4" />
                </button>
              </Tooltip>
            )}
          </div>

          <div className="control-cluster modes">
            <PlaybackTimeLabel
              song={current}
              className="mineradio-time-display"
            />
          </div>
        </div>
      </div>
    );
  }

  const playerBarClass = barClassName
    ? `glass-surface glass-surface--elevated fixed bottom-0 left-0 right-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom,0px)] ${barClassName}`
    : transparentBar
      ? 'glass-surface glass-surface--elevated fixed bottom-0 left-0 right-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom,0px)]'
      : 'glass-surface glass-surface--elevated fixed bottom-0 left-0 right-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom,0px)]';

  if (fmLoading) {
    return (
      <div className={playerBarClass}>
        <div className="py-1.5 -my-1.5">
          <ProgressBar
            progress={0}
            duration={0}
            onSeek={() => {}}
            disabled
            className="h-0.5"
            trackClassName="bg-netease-border"
            fillClassName="bg-[var(--om-accent)]"
          />
        </div>

        <div className="max-w-5xl mx-auto flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5">
          <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0 max-w-[38%] sm:max-w-[32%] min-w-0">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 items-center justify-center rounded-lg bg-netease-card">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--om-accent)]" />
            </div>
            <div className="min-w-0 hidden sm:block">
              <p className="truncate text-sm font-medium text-netease-muted">私人漫游</p>
              <p className="truncate text-[11px] text-netease-muted/80 sm:text-xs">正在加载…</p>
            </div>
            <ChevronUp className="h-4 w-4 flex-shrink-0 text-transparent sm:hidden" aria-hidden />
          </div>

          <div className="min-w-0 flex-1 px-1 text-center sm:px-2">
            <p className="truncate text-xs font-medium leading-tight text-netease-muted sm:text-sm">正在加载私人漫游…</p>
            <p className="mt-0.5 truncate text-[10px] leading-tight text-netease-muted/70 sm:text-xs">{'\u00A0'}</p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
            <span className="hidden text-[10px] text-transparent sm:block">0:00</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10" aria-hidden>
              <Play className="ml-0.5 h-4 w-4 text-white/30" />
            </div>
            <div className="flex h-8 w-8 items-center justify-center" aria-hidden>
              <SkipForward className="h-4 w-4 text-white/20" />
            </div>
            <div className="h-8 w-8 flex-shrink-0" aria-hidden />
            <div className="h-8 w-8 flex-shrink-0" aria-hidden />
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  return (

    <div className={playerBarClass}>

      {playbackError?.queueId === current.queueId && (
        <div className="mx-auto flex w-full max-w-[1840px] flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-[rgba(248,113,113,0.14)] bg-[rgba(248,113,113,0.055)] px-3 py-1.5 text-xs text-rose-100/90 sm:px-6" role="alert">
          <span className="min-w-0 truncate">{playbackError.message}</span>
          <button type="button" onClick={handleRetryCurrent} className="inline-flex items-center gap-1 text-[var(--om-accent)] hover:underline">
            <RefreshCw className="h-3.5 w-3.5" />重试
          </button>
          {canControlPlayback ? (
            <button type="button" onClick={handleSkip} className="text-rose-200 hover:text-white hover:underline">切歌</button>
          ) : (
            <button type="button" onClick={() => void handleRequestSkip()} disabled={hasPendingSkip} className="text-rose-200 hover:text-white hover:underline disabled:opacity-50">
              {hasPendingSkip ? '已申请切歌' : '申请切歌'}
            </button>
          )}
        </div>
      )}

      {(skipError || skipMsg) && (

        <p className={`py-0.5 text-center text-[10px] ${skipMsg ? 'text-amber-400' : 'text-[var(--om-danger)]'}`}>
          {skipMsg || skipError}
        </p>

      )}

      <div className="py-1.5 -my-1.5">
        <PlaybackProgressBar
          song={current}
          onSeek={handleSeek}
          disabled={!canControlPlayback}
          className="h-0.5"
          trackClassName="bg-netease-border"
          fillClassName="bg-[var(--om-accent)]"
        />
      </div>



      <div className="room-player-content mx-auto grid w-full max-w-[1840px] grid-cols-[minmax(160px,0.9fr)_minmax(100px,1.1fr)_auto] items-center gap-4 border-t border-white/[0.04] px-3 py-2 sm:px-6 sm:py-2.5">

        <div className="room-player-track flex min-w-0 items-center gap-3">
        <button onClick={onExpand} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="打开歌词和歌曲详情">

          <SongCover
            song={current}
            size="tiny"
            eager
            className="room-player-cover h-10 w-10 flex-shrink-0 rounded-lg object-cover sm:h-11 sm:w-11"
          />

          <div className="min-w-0 hidden sm:block">

            <div className="flex items-center gap-1 sm:gap-1.5">

              <p className="text-sm font-medium truncate">{current.name}</p>

              <SourceBadge source={current.source || 'netease'} className="hidden sm:inline-flex" />

            </div>

            <p className="text-[11px] sm:text-xs text-netease-muted truncate">

              {current.artist}
              {current.requestedBy && (
                <span className="text-netease-muted/70"> · {current.requestedBy}点的歌</span>
              )}

            </p>

          </div>

          <ChevronUp className="h-4 w-4 flex-shrink-0 text-netease-muted sm:hidden" />

        </button>
        <FavoriteButton song={current} className="h-8 w-8 flex-shrink-0 text-netease-muted hover:text-rose-300" />
        </div>

        <div className="room-player-lyrics min-w-0">
          <MiniPlayerLyricTicker song={current} onExpand={onExpand} />
        </div>

        <div className="room-player-controls flex flex-shrink-0 items-center justify-end gap-1 sm:gap-2">

        <PlaybackTimeLabel
          song={current}
          className="text-[10px] text-netease-muted hidden sm:block"
        />



        <Tooltip content={canControlPlayback ? '上一首（播放到开头时回退）' : '仅房主或管理员可切回上一首'}>
          <button
            type="button"
            onClick={canControlPlayback ? onPrevious : undefined}
            disabled={!canControlPlayback || trackLoading || !onPrevious}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-netease-muted transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="上一首"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </Tooltip>

        <Tooltip content={canControlPlayback ? '暂停/播放' : (isPlaying ? '房主正在播放' : '房主已暂停')}>
          <button
            onClick={canControlPlayback ? handlePlayPause : undefined}
            disabled={trackLoading || !canControlPlayback}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-all disabled:opacity-70 ${canControlPlayback ? 'bg-white text-black hover:scale-105' : 'bg-white/10 text-white/70 cursor-not-allowed'}`}
            aria-label="播放控制"
          >
            {trackLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>
        </Tooltip>

        {canControlPlayback ? (
          <Tooltip content="切歌">
            <button
              onClick={handleSkip}
              disabled={trackLoading}
              className="w-8 h-8 flex items-center justify-center text-netease-muted hover:text-white transition-colors disabled:opacity-50"
              aria-label="切歌"
            >
              {trackLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <SkipForward className="w-4 h-4" />
              )}
            </button>
          </Tooltip>
        ) : (
          <Tooltip content={hasPendingSkip ? '已申请切歌' : '申请切歌'}>
            <button
              onClick={handleRequestSkip}
              disabled={hasPendingSkip}
              className="w-8 h-8 flex items-center justify-center text-netease-muted hover:text-white transition-colors disabled:opacity-40"
              aria-label="申请切歌"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </Tooltip>
        )}

        <VolumeControl compact className="flex-shrink-0" />
        <Tooltip content="打开歌词">
          <button type="button" onClick={onExpand} className="flex h-8 w-8 items-center justify-center rounded-lg text-netease-muted transition-colors hover:bg-white/10 hover:text-white" aria-label="打开歌词">
            <Music2 className="h-4 w-4" />
          </button>
        </Tooltip>
        {onQueueClick && (
          <Tooltip content="查看播放队列">
            <button type="button" onClick={onQueueClick} className="flex h-8 w-8 items-center justify-center rounded-lg text-netease-muted transition-colors hover:bg-white/10 hover:text-white" aria-label="查看播放队列">
              <ListMusic className="h-4 w-4" />
            </button>
          </Tooltip>
        )}

        </div>

      </div>

    </div>

  );

});


