import { memo, useState, useEffect } from 'react';
import { Flame, Plus, Loader2, TrendingUp, RefreshCw } from 'lucide-react';
import type { HotSongItem, SearchResult } from '../types';
import { getHotSongs, songKey } from '../api/music';
import SongCover from './SongCover';
import Tooltip from './Tooltip';
import TruncateTip from './TruncateTip';

interface Props {
  addingId: string | null;
  onAdd: (song: SearchResult) => void;
  refreshKey?: number;
  compact?: boolean;
  embedded?: boolean;
  limit?: number;
}

function rankStyle(rank: number) {
  if (rank === 1) return 'bg-[var(--om-accent)] text-[#07110f]';
  if (rank === 2) return 'bg-orange-500/90 text-white';
  if (rank === 3) return 'bg-amber-500/80 text-white';
  return 'bg-white/10 text-white/50';
}

const HOT_SONG_LIST_LIMIT = 15;

/** 固定两行高度，短文案也占位换行区域 */
const HOT_NAME_LINE_CLS =
  'w-full min-w-0 line-clamp-2 break-words leading-snug min-h-[2.5em]';
const HOT_ARTIST_LINE_CLS =
  'w-full min-w-0 line-clamp-2 break-words leading-snug min-h-[2.2em]';

export default memo(function HotSongPanel({
  addingId,
  onAdd,
  refreshKey = 0,
  compact = false,
  embedded = false,
  limit,
}: Props) {
  const fetchLimit = limit ?? HOT_SONG_LIST_LIMIT;
  const [songs, setSongs] = useState<HotSongItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadHot = async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await getHotSongs(fetchLimit);
        if (cancelled) return;
        setSongs(data);
        setLoadError(false);
      } catch {
        if (!cancelled && !silent) setLoadError(true);
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    };

    void loadHot();
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void loadHot(true);
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fetchLimit, refreshKey, reload]);

  const handleAdd = (song: HotSongItem) => {
    onAdd({
      id: song.id,
      source: song.source,
      name: song.name,
      artist: song.artist,
      album: song.album,
      pic: song.pic,
      duration: song.duration,
    });
  };

  if (compact) {
    return (
      <div className="glass-surface glass-surface--panel flex-shrink-0 overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-[var(--om-glass-border)] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-orange-400" />
            <h2 className="text-sm font-medium">点歌热榜</h2>
          </div>
          <Tooltip content="刷新热榜">
            <button type="button" onClick={() => setReload((value) => value + 1)} className="room-icon-button !h-7 !w-7" aria-label="刷新热榜">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </button>
          </Tooltip>
        </div>
        <div className="p-2 overflow-x-auto">
          {loading && songs.length === 0 ? (
            <p className="text-xs text-netease-muted text-center py-3">加载中...</p>
          ) : loadError && songs.length === 0 ? (
            <div className="flex items-center gap-2 py-3 text-xs text-amber-200/80">
              <span className="min-w-0 flex-1">热榜暂时无法载入</span>
              <button type="button" onClick={() => setReload((value) => value + 1)} className="whitespace-nowrap text-[var(--om-accent)] hover:underline">重试</button>
            </div>
          ) : songs.length === 0 ? (
            <p className="text-xs text-netease-muted text-center py-3">暂无热榜数据</p>
          ) : (
            <div className="flex gap-2 min-w-min pb-1">
              {songs.map((song, i) => (
                <button
                  key={songKey(song)}
                  type="button"
                  onClick={() => handleAdd(song)}
                  disabled={addingId === songKey(song)}
                  className="glass-row flex w-28 flex-shrink-0 flex-col border border-[var(--om-glass-border)] bg-[var(--om-glass-base)] p-2 text-left transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-1 mb-1">
                    <span className={`text-[10px] font-bold w-4 h-4 rounded flex items-center justify-center ${rankStyle(i + 1)}`}>
                      {i + 1}
                    </span>
                    <span className="text-[10px] text-netease-muted truncate">{song.count} 次</span>
                  </div>
                  <TruncateTip text={song.name} className={`text-xs font-medium ${HOT_NAME_LINE_CLS}`} />
                  <TruncateTip text={song.artist} className={`text-[10px] text-netease-muted ${HOT_ARTIST_LINE_CLS}`} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-col ${embedded ? 'h-full flex-1' : 'glass-surface glass-surface--panel h-full overflow-hidden rounded-2xl'}`}>
      <div className={`flex flex-shrink-0 items-center justify-between border-b border-[var(--om-glass-border)] px-4 ${embedded ? 'py-2' : 'py-2.5'}`}>
        <div className="flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-orange-400" />
          <h2 className="text-sm font-medium">点歌热榜</h2>
        </div>
        <div className="flex items-center gap-2 text-netease-muted">
          <span className="text-[11px]">按点歌次数</span>
          <Tooltip content="刷新热榜">
            <button type="button" onClick={() => setReload((value) => value + 1)} className="room-icon-button !h-7 !w-7" aria-label="刷新热榜">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </button>
          </Tooltip>
          <TrendingUp className="w-3.5 h-3.5" />
        </div>
      </div>

      <div className="glass-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
        {loading && songs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-netease-muted">
            <Loader2 className="w-5 h-5 animate-spin mb-2" />
            <p className="text-xs">加载热榜...</p>
          </div>
        ) : songs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-netease-muted px-3">
            {loadError ? <RefreshCw className="w-6 h-6 mb-2 opacity-50" /> : <Flame className="w-6 h-6 mb-2 opacity-30" />}
            <p className="text-sm text-center">{loadError ? '热榜暂时无法载入' : '暂无热榜数据'}</p>
            <p className="text-xs text-center mt-1 opacity-70">{loadError ? '检查连接后重试' : '有新的点歌记录后会显示在这里'}</p>
            {loadError && <button type="button" onClick={() => setReload((value) => value + 1)} className="mt-3 text-xs text-[var(--om-accent)] hover:underline">重试</button>}
          </div>
        ) : (
          <div className="space-y-1">
            {songs.map((song, i) => {
              const rank = i + 1;
              const key = songKey(song);
              const isAdding = addingId === key;

              return (
                  <div
                    key={key}
                    className={`glass-row group flex items-start gap-2.5 ${embedded ? 'p-2' : 'p-2.5'}`}
                  >
                  <span
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-xs font-bold ${rankStyle(rank)}`}
                  >
                    {rank}
                  </span>
                  <SongCover
                    song={song}
                    className="h-10 w-10 flex-shrink-0 rounded-md object-cover bg-netease-card"
                  />
                  <div className="flex-1 min-w-0">
                    <TruncateTip text={song.name} className={`text-[13px] font-medium ${HOT_NAME_LINE_CLS}`} />
                    <TruncateTip text={song.artist} className={`text-[11px] text-netease-muted ${HOT_ARTIST_LINE_CLS}`} />
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 self-center">
                    <span className="text-xs text-orange-300/90 font-medium">{song.count} 次</span>
                  </div>
                  <Tooltip content="点歌">
                    <button
                      type="button"
                      onClick={() => handleAdd(song)}
                      disabled={isAdding}
                      className="glass-button-secondary flex-shrink-0 self-center rounded-lg p-1.5 text-[var(--om-accent)] opacity-0 transition-all group-hover:opacity-100 hover:bg-[var(--om-accent)] hover:text-[#07110f] disabled:opacity-50"
                      aria-label="点歌"
                    >
                      {isAdding ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
