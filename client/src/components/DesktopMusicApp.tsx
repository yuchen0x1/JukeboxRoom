import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  FileAudio,
  FolderHeart,
  MessagesSquare,
  FolderPlus,
  Heart,
  Headphones,
  History,
  Info,
  ListMusic,
  ListPlus,
  Loader2,
  LogIn,
  Mic2,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Repeat,
  Repeat1,
  Search,
  ScrollText,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type { SearchResult, Song } from '../types';
import { formatDuration, getSourceLabel } from '../api/music';
import SongCover from './SongCover';
import { fetchUpdateInfo, type UpdateInfo } from '../api/update';
import {
  getDesktopMusicCapabilities,
  getDesktopSourceLogins,
  getDesktopTopSongs,
  removeDesktopSourceLogin,
  saveDesktopSourceCookie,
  searchDesktopSongs,
  type DesktopSourceFilter,
  type DesktopAccountSource,
  type DesktopSourceLogins,
} from '../api/desktopMusic';
import RoomSourceLoginModal from './RoomSourceLoginModal';
import ChangelogViewer from './ChangelogViewer';
import Modal from './Modal';
import { useTrackLyrics } from '../hooks/useTrackLyrics';
import { getSharedAudio } from '../lib/audioElement';
import { releaseNotesToPlainText } from '../lib/releaseNotesText';
import {
  useDesktopMusicStore,
  type DesktopPlaylist,
  type DesktopTrack,
  type DesktopView,
} from '../stores/desktopMusicStore';
import DesktopAudioEngine from './DesktopAudioEngine';
import Lyrics from './Lyrics';
import './desktopMusic.css';

type TrackInput = Omit<DesktopTrack, 'trackKey' | 'requestId'> & Partial<Pick<DesktopTrack, 'trackKey' | 'requestId'>>;

function formatUpdateBytes(value: number) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatUpdateTimeRemaining(total: number, transferred: number, bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0 || total <= transferred) return null;
  const seconds = Math.ceil((total - transferred) / bytesPerSecond);
  if (seconds < 60) return `${seconds} 秒剩余`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒剩余`;
}

const SOURCE_OPTIONS: Array<{ id: DesktopSourceFilter; label: string }> = [
  { id: 'all', label: '全部音源' },
  { id: 'netease', label: '网易云' },
  { id: 'tencent', label: 'QQ 音乐' },
  { id: 'kugou', label: '酷狗音乐' },
  { id: 'qishui', label: '汽水音乐' },
  { id: 'migu', label: '咪咕音乐（实验性）' },
];

const SEARCH_PAGE_SIZE = 30;
const QQ_GROUP_URL = 'https://qm.qq.com/q/ktfryAk4Y8';

const VIEW_META: Record<DesktopView, { title: string; subtitle: string }> = {
  discover: { title: '发现音乐', subtitle: '从真实平台榜单里找到下一首想听的歌。' },
  search: { title: '音乐搜索', subtitle: '跨音源搜索歌曲，并直接加入个人播放队列。' },
  favorites: { title: '我的收藏', subtitle: '收藏只保存在这台设备上。' },
  history: { title: '最近播放', subtitle: '按最近播放顺序查看本机历史。' },
  playlists: { title: '我的歌单', subtitle: '创建仅保存在本机的私人歌单。' },
  local: { title: '本地音乐', subtitle: '打开电脑上的音频文件播放，不会复制或上传文件。' },
  settings: { title: '设置', subtitle: '管理默认音源、播放质量和桌面版音源配置。' },
};

const NAV_ITEMS: Array<{ id: DesktopView; label: string; Icon: typeof Radio }> = [
  { id: 'discover', label: '发现音乐', Icon: Radio },
  { id: 'search', label: '音乐搜索', Icon: Search },
  { id: 'favorites', label: '我的收藏', Icon: Heart },
  { id: 'history', label: '最近播放', Icon: History },
  { id: 'playlists', label: '我的歌单', Icon: FolderHeart },
  { id: 'local', label: '本地音乐', Icon: FileAudio },
  { id: 'settings', label: '设置', Icon: Settings },
];

function formatUpdateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function trackKey(song: Pick<Song, 'id' | 'source'>): string {
  return `${song.source || 'netease'}:${song.id}`;
}

function songDuration(song: Pick<Song, 'duration'>): string {
  return song.duration ? formatDuration(song.duration / 1000) : '--:--';
}

function Cover({ song, size = 'small' }: { song: Song & Partial<DesktopTrack>; size?: 'small' | 'medium' }) {
  const local = Boolean(song.isLocal);
  const className = size === 'medium' ? 'desktop-cover desktop-cover--medium' : 'desktop-cover';
  if (local) {
    return <span className={`${className} desktop-cover--local`}><FileAudio aria-hidden="true" /></span>;
  }
  return <SongCover song={song} size={size === 'medium' ? 'medium' : 'tiny'} className={className} />;
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="desktop-empty-state">
      <span className="desktop-empty-icon"><Music2 aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </div>
  );
}

interface DesktopSongRowProps {
  song: Song & Partial<DesktopTrack>;
  current?: boolean;
  favorites: Song[];
  playlists: DesktopPlaylist[];
  onPlay: (song: TrackInput) => void;
  onQueue: (song: TrackInput, playNext?: boolean) => void;
  onFavorite: (song: Song) => void;
  onAddPlaylist: (playlistId: string, song: Song) => void;
  onRemove?: () => void;
  queuePosition?: number;
}

function DesktopSongRow({
  song,
  current = false,
  favorites,
  playlists,
  onPlay,
  onQueue,
  onFavorite,
  onAddPlaylist,
  onRemove,
  queuePosition,
}: DesktopSongRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ left: number; top: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuItemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const local = Boolean(song.isLocal);
  const favorite = !local && favorites.some((item) => trackKey(item) === trackKey(song));
  const title = song.name || song.fileName || '未知歌曲';
  const contextActions = [
    { label: '立即播放', Icon: Play, action: () => onPlay(song) },
    { label: '下一首播放', Icon: SkipForward, action: () => onQueue(song, true) },
    { label: '加入播放队列', Icon: ListPlus, action: () => onQueue(song) },
    ...(!local ? [{ label: favorite ? '取消收藏' : '收藏歌曲', Icon: Heart, action: () => onFavorite(song) }] : []),
    ...(onRemove ? [{ label: '从当前列表移除', Icon: Trash2, action: onRemove }] : []),
  ];

  const openContextMenu = (left: number, top: number) => {
    const width = 214;
    const height = contextActions.length * 34 + 8;
    setContextMenu({
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
      top: Math.max(46, Math.min(top, window.innerHeight - height - 8)),
    });
  };

  const closeContextMenu = (restoreFocus = false) => {
    setContextMenu(null);
    if (restoreFocus) requestAnimationFrame(() => playButtonRef.current?.focus());
  };

  useEffect(() => {
    if (!contextMenu) return;
    contextMenuItemsRef.current[0]?.focus();
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!contextMenuRef.current?.contains(target) && !rowRef.current?.contains(target)) closeContextMenu();
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [contextMenu]);

  const handleContextMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Tab') event.preventDefault();
      closeContextMenu(true);
      return;
    }
    const current = contextMenuItemsRef.current.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === 'ArrowDown') next = (current + 1 + contextMenuItemsRef.current.length) % contextMenuItemsRef.current.length;
    else if (event.key === 'ArrowUp') next = (current - 1 + contextMenuItemsRef.current.length) % contextMenuItemsRef.current.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = contextMenuItemsRef.current.length - 1;
    else return;
    event.preventDefault();
    contextMenuItemsRef.current[next]?.focus();
  };

  const runContextAction = (action: () => void) => {
    closeContextMenu();
    action();
  };

  return (
    <div
      ref={rowRef}
      className={`desktop-song-row${current ? ' is-current' : ''}`}
      onContextMenu={(event) => {
        event.preventDefault();
        openContextMenu(event.clientX, event.clientY);
      }}
    >
      {typeof queuePosition === 'number' && <span className="desktop-queue-position">{String(queuePosition + 1).padStart(2, '0')}</span>}
      <button
        ref={playButtonRef}
        className="desktop-song-play"
        type="button"
        onClick={() => onPlay(song)}
        aria-label={`播放 ${title}`}
        onKeyDown={(event) => {
          if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          openContextMenu(rect.left + 24, rect.bottom);
        }}
      >
        <Cover song={song} />
        <span className="desktop-song-meta">
          <span className="desktop-song-title">{current && <span className="desktop-playing-dot" aria-label="正在播放" />}{title}</span>
          <span className="desktop-song-artist">{song.artist || '未知歌手'}{song.album ? ` · ${song.album}` : ''}</span>
        </span>
      </button>
      <span className="desktop-song-source">{local ? '本地文件' : getSourceLabel(song.source)}</span>
      <span className="desktop-song-duration">{songDuration(song)}</span>
      <div className="desktop-song-actions">
        <button type="button" className={`desktop-icon-button${favorite ? ' is-favorite' : ''}`} onClick={() => onFavorite(song)} disabled={local} title={favorite ? '取消收藏' : '收藏'} aria-label={favorite ? '取消收藏' : '收藏'}>
          <Heart className={favorite ? 'fill-current' : ''} aria-hidden="true" />
        </button>
        <button type="button" className="desktop-icon-button" onClick={() => onQueue(song)} title="加入播放队列" aria-label="加入播放队列">
          <ListPlus aria-hidden="true" />
        </button>
        <div className="desktop-row-menu-wrap">
          <button type="button" className="desktop-icon-button" onClick={() => setMenuOpen((open) => !open)} disabled={local || playlists.length === 0} title={playlists.length ? '加入歌单' : '请先创建歌单'} aria-label="加入歌单">
            <FolderPlus aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="desktop-row-menu" role="menu">
              {playlists.map((playlist) => (
                <button type="button" role="menuitem" key={playlist.id} onClick={() => { onAddPlaylist(playlist.id, song); setMenuOpen(false); }}>
                  {playlist.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {onRemove && <button type="button" className="desktop-icon-button desktop-icon-button--danger" onClick={onRemove} title="从队列移除" aria-label="从队列移除"><X aria-hidden="true" /></button>}
      </div>
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="desktop-row-context-menu"
          role="menu"
          aria-label={`${title} 歌曲操作`}
          style={{ left: contextMenu.left, top: contextMenu.top }}
          onKeyDown={handleContextMenuKeyDown}
          onContextMenu={(event) => event.preventDefault()}
        >
          {contextActions.map(({ label, Icon, action }, index) => (
            <button
              ref={(node) => { contextMenuItemsRef.current[index] = node; }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              key={label}
              onClick={() => runContextAction(action)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

function QueueRow({ track, index, favorites, playlists, onPlay, onQueue, onFavorite, onAddPlaylist, onRemove, current }: {
  track: DesktopTrack;
  index: number;
  favorites: Song[];
  playlists: DesktopPlaylist[];
  onPlay: (song: TrackInput) => void;
  onQueue: (song: TrackInput, playNext?: boolean) => void;
  onFavorite: (song: Song) => void;
  onAddPlaylist: (playlistId: string, song: Song) => void;
  onRemove: () => void;
  current: boolean;
}) {
  return (
    <DesktopSongRow
      song={track}
      current={current}
      queuePosition={index}
      favorites={favorites}
      playlists={playlists}
      onPlay={onPlay}
      onQueue={onQueue}
      onFavorite={onFavorite}
      onAddPlaylist={onAddPlaylist}
      onRemove={onRemove}
    />
  );
}

function DesktopAudioPlayer({
  onOpenPanel,
  onOpenQueue,
  onSearchCurrent,
}: {
  onOpenPanel: (tab: 'lyrics' | 'queue' | 'details') => void;
  onOpenQueue: () => void;
  onSearchCurrent: () => void;
}) {
  const current = useDesktopMusicStore((state) => state.current);
  const isPlaying = useDesktopMusicStore((state) => state.isPlaying);
  const trackLoading = useDesktopMusicStore((state) => state.trackLoading);
  const error = useDesktopMusicStore((state) => state.playbackError);
  const currentTime = useDesktopMusicStore((state) => state.currentTime);
  const duration = useDesktopMusicStore((state) => state.duration);
  const volume = useDesktopMusicStore((state) => state.volume);
  const queueLength = useDesktopMusicStore((state) => state.queue.length);
  const repeatMode = useDesktopMusicStore((state) => state.repeatMode);
  const shuffle = useDesktopMusicStore((state) => state.shuffle);
  const favorites = useDesktopMusicStore((state) => state.favorites);
  const setVolume = useDesktopMusicStore((state) => state.setVolume);
  const setPlaying = useDesktopMusicStore((state) => state.setPlaying);
  const retryCurrent = useDesktopMusicStore((state) => state.retryCurrent);
  const toggleFavorite = useDesktopMusicStore((state) => state.toggleFavorite);
  const setCurrentTime = useDesktopMusicStore((state) => state.setCurrentTime);
  const setRepeatMode = useDesktopMusicStore((state) => state.setRepeatMode);
  const toggleShuffle = useDesktopMusicStore((state) => state.toggleShuffle);
  const playNextTrack = useDesktopMusicStore((state) => state.playNextTrack);
  const playPreviousTrack = useDesktopMusicStore((state) => state.playPreviousTrack);

  const togglePlayback = useCallback(() => {
    if (!current || trackLoading) return;
    const audio = getSharedAudio();
    if (isPlaying) {
      audio.pause();
      setPlaying(false);
      return;
    }
    void audio.play().then(() => setPlaying(true)).catch(() => {
      setPlaying(false);
      useDesktopMusicStore.getState().setPlaybackError('播放被系统阻止，请再次按播放。');
    });
  }, [current, isPlaying, setPlaying, trackLoading]);

  const seek = useCallback((time: number) => {
    setCurrentTime(time);
    const audio = getSharedAudio();
    if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(Math.max(0, time), audio.duration);
  }, [setCurrentTime]);

  const previous = () => {
    if (currentTime > 3) seek(0);
    else playPreviousTrack();
  };

  const cycleRepeat = () => setRepeatMode(repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off');
  const favorite = current && !current.isLocal && favorites.some((song) => trackKey(song) === trackKey(current));

  return (
    <footer className="desktop-player">
      {error && (
        <div className="desktop-player-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={retryCurrent}><RefreshCw aria-hidden="true" />重试</button>
          <button type="button" onClick={onSearchCurrent}>搜索其他版本</button>
        </div>
      )}
      <div className="desktop-player-main">
        <div className="desktop-player-track">
          {current ? <Cover song={current} size="medium" /> : <span className="desktop-cover desktop-cover--medium desktop-cover--empty"><Headphones aria-hidden="true" /></span>}
          <div className="desktop-player-meta">
            <span className="desktop-player-title">{current?.name || '选择一首歌开始播放'}</span>
            <span className="desktop-player-artist">{current?.artist || '个人音乐库'}</span>
          </div>
          <button type="button" className={`desktop-icon-button${favorite ? ' is-favorite' : ''}`} disabled={!current || current.isLocal} onClick={() => current && toggleFavorite(current)} title={favorite ? '取消收藏' : '收藏当前歌曲'} aria-label={favorite ? '取消收藏' : '收藏当前歌曲'}>
            <Heart className={favorite ? 'fill-current' : ''} aria-hidden="true" />
          </button>
        </div>

        <div className="desktop-player-center">
          <div className="desktop-transport">
            <button type="button" className="desktop-icon-button" onClick={previous} disabled={!current} title="上一首" aria-label="上一首"><SkipBack aria-hidden="true" /></button>
            <button type="button" className="desktop-play-button" onClick={togglePlayback} disabled={!current || trackLoading} title={isPlaying ? '暂停' : '播放'} aria-label={isPlaying ? '暂停' : '播放'}>
              {trackLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </button>
            <button type="button" className="desktop-icon-button" onClick={() => playNextTrack()} disabled={!queueLength && repeatMode !== 'all'} title="下一首" aria-label="下一首"><SkipForward aria-hidden="true" /></button>
          </div>
          <div className="desktop-seek-row">
            <span>{formatDuration(currentTime)}</span>
            <input type="range" min="0" max={Math.max(1, duration)} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={(event) => seek(Number(event.target.value))} disabled={!current || !duration} aria-label="播放进度" />
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        <div className="desktop-player-tools">
          <button type="button" className={`desktop-icon-button${shuffle ? ' is-active' : ''}`} onClick={toggleShuffle} title={shuffle ? '关闭随机播放' : '随机播放'} aria-label={shuffle ? '关闭随机播放' : '随机播放'}><Shuffle aria-hidden="true" /></button>
          <button type="button" className={`desktop-icon-button${repeatMode !== 'off' ? ' is-active' : ''}`} onClick={cycleRepeat} title={repeatMode === 'one' ? '单曲循环' : repeatMode === 'all' ? '列表循环' : '不循环'} aria-label="切换循环模式">
            {repeatMode === 'one' ? <Repeat1 aria-hidden="true" /> : <Repeat aria-hidden="true" />}
          </button>
          <span className="desktop-volume-control"><Volume2 aria-hidden="true" /><input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="音量" /></span>
          <button type="button" className="desktop-icon-button" onClick={() => onOpenPanel('lyrics')} title="打开歌词" aria-label="打开歌词"><Mic2 aria-hidden="true" /></button>
          <button type="button" className="desktop-icon-button desktop-queue-trigger" onClick={onOpenQueue} title="播放队列" aria-label="播放队列"><ListMusic aria-hidden="true" />{queueLength > 0 && <span>{queueLength}</span>}</button>
        </div>
      </div>
    </footer>
  );
}

export default function DesktopMusicApp() {
  const [view, setView] = useState<DesktopView>('discover');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<'lyrics' | 'queue' | 'details'>('lyrics');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [topSongs, setTopSongs] = useState<SearchResult[]>([]);
  const [topLoading, setTopLoading] = useState(true);
  const [topError, setTopError] = useState('');
  const [capabilities, setCapabilities] = useState<Awaited<ReturnType<typeof getDesktopMusicCapabilities>> | null>(null);
  const [capabilityError, setCapabilityError] = useState('');
  const [sourceLogins, setSourceLogins] = useState<DesktopSourceLogins>({ netease: false, tencent: false, kugou: false, qishui: false, migu: false });
  const [sourceLoginOpen, setSourceLoginOpen] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<'latest' | 'failed' | null>(null);
  const [desktopUpdateState, setDesktopUpdateState] = useState<DesktopUpdateState | null>(null);
  const [desktopUpdateAction, setDesktopUpdateAction] = useState<'download' | 'install' | null>(null);
  const [snoozedDesktopVersion, setSnoozedDesktopVersion] = useState('');
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [localTracks, setLocalTracks] = useState<DesktopTrack[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const viewScrollRef = useRef<HTMLDivElement>(null);
  const searchTotalPages = Math.max(1, Math.ceil(searchResults.length / SEARCH_PAGE_SIZE));
  const updateCheckInFlight = useRef(false);

  const current = useDesktopMusicStore((state) => state.current);
  const currentTime = useDesktopMusicStore((state) => state.currentTime);
  const queue = useDesktopMusicStore((state) => state.queue);
  const favorites = useDesktopMusicStore((state) => state.favorites);
  const history = useDesktopMusicStore((state) => state.history);
  const playlists = useDesktopMusicStore((state) => state.playlists);
  const recentSearches = useDesktopMusicStore((state) => state.recentSearches);
  const sourceFilter = useDesktopMusicStore((state) => state.sourceFilter);
  const playbackQuality = useDesktopMusicStore((state) => state.playbackQuality);
  const toggleFavorite = useDesktopMusicStore((state) => state.toggleFavorite);
  const addToQueue = useDesktopMusicStore((state) => state.addToQueue);
  const removeFromQueue = useDesktopMusicStore((state) => state.removeFromQueue);
  const clearQueue = useDesktopMusicStore((state) => state.clearQueue);
  const playTrack = useDesktopMusicStore((state) => state.playTrack);
  const addTrackToPlaylist = useDesktopMusicStore((state) => state.addTrackToPlaylist);
  const removeTrackFromPlaylist = useDesktopMusicStore((state) => state.removeTrackFromPlaylist);
  const createPlaylist = useDesktopMusicStore((state) => state.createPlaylist);
  const deletePlaylist = useDesktopMusicStore((state) => state.deletePlaylist);
  const addRecentSearch = useDesktopMusicStore((state) => state.addRecentSearch);
  const setSourceFilter = useDesktopMusicStore((state) => state.setSourceFilter);
  const setPlaybackQuality = useDesktopMusicStore((state) => state.setPlaybackQuality);

  const selectedPlaylist = playlists.find((playlist) => playlist.id === activePlaylistId) || null;
  const lyricLines = useTrackLyrics(current && !current.isLocal ? current : null);
  const viewMeta = VIEW_META[view];
  const nativeUpdate = desktopUpdateState?.supported ? desktopUpdateState : null;
  const nativeLatestVersion = nativeUpdate?.latestVersion;
  const nativeUpdateAvailable = Boolean(nativeLatestVersion && ['available', 'downloading', 'downloaded', 'error'].includes(nativeUpdate?.state || ''));

  const refreshSourceLogins = useCallback(async () => {
    const [result, nextCapabilities] = await Promise.all([
      getDesktopSourceLogins(),
      getDesktopMusicCapabilities(),
    ]);
    setSourceLogins(result);
    setCapabilities(nextCapabilities);
    setAccountError('');
    return result;
  }, []);

  const checkForUpdates = useCallback(async (manual = false) => {
    if (updateCheckInFlight.current) return;
    updateCheckInFlight.current = true;
    setUpdateChecking(true);
    try {
      if (window.desktopUpdater) {
        const desktopState = await window.desktopUpdater.getState();
        if (desktopState) setDesktopUpdateState(desktopState);
        if (manual && desktopState?.supported) {
          const checked = await window.desktopUpdater.check();
          if (checked) setDesktopUpdateState(checked);
        }
      }
      const next = await fetchUpdateInfo();
      setUpdateInfo(next);
      if (manual) setUpdateMessage(!next ? 'failed' : next.updateAvailable ? null : 'latest');
      else if (next?.updateAvailable) setUpdateMessage(null);
    } finally {
      updateCheckInFlight.current = false;
      setUpdateChecking(false);
    }
  }, []);

  useEffect(() => {
    const updater = window.desktopUpdater;
    if (!updater) return undefined;
    let active = true;
    void updater.getState().then((state) => {
      if (active && state) setDesktopUpdateState(state);
    });
    const unsubscribe = updater.onState((state) => {
      if (active) setDesktopUpdateState(state);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const downloadDesktopUpdate = useCallback(async () => {
    if (!window.desktopUpdater) return;
    setDesktopUpdateAction('download');
    try {
      const next = await window.desktopUpdater.download();
      if (next) setDesktopUpdateState(next);
    } finally {
      setDesktopUpdateAction(null);
    }
  }, []);

  const installDesktopUpdate = useCallback(async () => {
    if (!window.desktopUpdater) return;
    setDesktopUpdateAction('install');
    try { await window.desktopUpdater.install(); } finally { setDesktopUpdateAction(null); }
  }, []);

  const cancelDesktopUpdateDownload = useCallback(async () => {
    if (!window.desktopUpdater) return;
    await window.desktopUpdater.cancelDownload();
  }, []);

  useEffect(() => {
    void checkForUpdates();
    const timer = window.setInterval(() => void checkForUpdates(), 30 * 60 * 1000);
    const onFocus = () => void checkForUpdates();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [checkForUpdates]);

  const saveDesktopCredential = useCallback(async (
    source: string,
    credential: { cookie?: string; customUrl?: string } | null,
  ) => {
    if (!['netease', 'tencent', 'kugou'].includes(source) || !credential?.cookie) {
      return { success: false, error: '账号凭据无效' };
    }
    try {
      await saveDesktopSourceCookie(source as DesktopAccountSource, credential.cookie);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '账号凭据保存失败' };
    }
  }, []);

  const removeDesktopCredential = useCallback(async (source: DesktopAccountSource) => {
    try {
      await removeDesktopSourceLogin(source);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '退出账号失败' };
    }
  }, []);

  useEffect(() => {
    let active = true;
    void getDesktopTopSongs(100).then((songs) => {
      if (!active) return;
      setTopSongs(songs);
      setTopError('');
    }).catch((error: unknown) => {
      if (!active) return;
      setTopError(error instanceof Error ? error.message : '榜单加载失败');
    }).finally(() => {
      if (active) setTopLoading(false);
    });
    void getDesktopMusicCapabilities().then((value) => {
      if (active) setCapabilities(value);
    }).catch((error: unknown) => {
      if (active) setCapabilityError(error instanceof Error ? error.message : '音源状态不可用');
    });
    void getDesktopSourceLogins().then((value) => {
      if (active) setSourceLogins(value);
    }).catch((error: unknown) => {
      if (active) setAccountError(error instanceof Error ? error.message : '音乐账号状态不可用');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    for (const objectUrl of objectUrlsRef.current) URL.revokeObjectURL(objectUrl);
  }, []);

  const runSearch = useCallback(async (query = searchInput, filter = sourceFilter) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setView('search');
    setSearchInput(trimmed);
    setSearchTerm(trimmed);
    setSearchError('');
    setSearchPage(1);
    setSearchLoading(true);
    addRecentSearch(trimmed);
    try {
      setSearchResults(await searchDesktopSongs(trimmed, filter));
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : '搜索失败');
    } finally {
      setSearchLoading(false);
    }
  }, [addRecentSearch, searchInput, sourceFilter]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch();
  };

  const gotoSearchPage = (page: number) => {
    setSearchPage(Math.min(Math.max(1, page), searchTotalPages));
    viewScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openQueue = () => {
    setRightPanelOpen(true);
    setRightPanelTab('queue');
  };

  const handleAddPlaylist = (playlistId: string, song: Song) => addTrackToPlaylist(playlistId, song);

  const handleCreatePlaylist = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = createPlaylist(newPlaylistName);
    if (id) {
      setNewPlaylistName('');
      setActivePlaylistId(id);
    }
  };

  const handleLocalFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const tracks = Array.from(files).filter((file) => file.type.startsWith('audio/') || /\.(mp3|flac|m4a|wav|aac|ogg|opus)$/i.test(file.name)).map((file, index) => {
      const localUrl = URL.createObjectURL(file);
      objectUrlsRef.current.push(localUrl);
      const name = file.name.replace(/\.[^.]+$/, '') || file.name;
      return {
        id: `local-${file.lastModified}-${index}-${file.size}`,
        source: 'netease' as const,
        name,
        artist: '本地文件',
        album: file.name,
        duration: undefined,
        trackKey: `local:${file.lastModified}:${file.size}:${index}`,
        requestId: 0,
        isLocal: true,
        localUrl,
        fileName: file.name,
      } satisfies DesktopTrack;
    });
    setLocalTracks((previous) => [...tracks, ...previous.filter((item) => !tracks.some((track) => track.fileName === item.fileName))]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const renderSongs = (songs: Array<Song & Partial<DesktopTrack>>, emptyTitle: string, emptyDetail: string, removePlaylistId?: string) => (
    <>
      <div className="desktop-list-head" aria-hidden="true">
        <span>歌曲</span><span>音源</span><span>时长</span><span />
      </div>
      {songs.length ? songs.map((song) => (
        <DesktopSongRow
          key={(song as DesktopTrack).trackKey || trackKey(song)}
          song={song}
          current={Boolean(current && trackKey(current) === trackKey(song))}
          favorites={favorites}
          playlists={playlists}
          onPlay={playTrack}
          onQueue={addToQueue}
          onFavorite={toggleFavorite}
          onAddPlaylist={handleAddPlaylist}
          onRemove={removePlaylistId ? () => removeTrackFromPlaylist(removePlaylistId, song) : undefined}
        />
      )) : <EmptyState title={emptyTitle} detail={emptyDetail} />}
    </>
  );

  const renderPlaylistList = (playlistList: DesktopPlaylist[]) => (
    <div className="desktop-playlist-list">
      {playlistList.map((playlist) => (
        <button type="button" className="desktop-playlist-row" key={playlist.id} onClick={() => setActivePlaylistId(playlist.id)}>
          <span className="desktop-playlist-art"><ListMusic aria-hidden="true" /></span>
          <span><strong>{playlist.name}</strong><small>{playlist.tracks.length} 首歌曲</small></span>
          <ChevronDown aria-hidden="true" />
        </button>
      ))}
    </div>
  );

  const openMusicConfig = async () => {
    await window.jukeboxWindow?.openMusicConfig();
  };

  const restartApp = async () => {
    await window.jukeboxWindow?.restartApp();
  };

  const openDataDir = async () => {
    await window.jukeboxWindow?.openDataDir?.();
  };

  const clearLocalData = async () => {
    // 主进程会弹二次确认；取消时返回 false，不做任何改动
    await window.jukeboxWindow?.clearLocalData?.();
  };

  const searchCurrentVersion = () => {
    if (!current) return;
    setSourceFilter('all');
    void runSearch(current.name, 'all');
  };

  useEffect(() => {
    const isEditable = (target: EventTarget | null) => target instanceof HTMLElement
      && (target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"]')));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || isEditable(event.target)) return;
      if (event.code === 'Space') {
        const state = useDesktopMusicStore.getState();
        if (!state.current || state.trackLoading) return;
        event.preventDefault();
        const audio = getSharedAudio();
        if (state.isPlaying) {
          audio.pause();
          state.setPlaying(false);
        } else {
          void audio.play().then(() => useDesktopMusicStore.getState().setPlaying(true)).catch(() => {
            useDesktopMusicStore.getState().setPlaybackError('播放被系统阻止，请再次按空格键。');
          });
        }
      } else if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.desktop-search-form input')?.focus();
      } else if (event.ctrlKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        const state = useDesktopMusicStore.getState();
        if (state.currentTime > 3) {
          state.seekTo(0);
          getSharedAudio().currentTime = 0;
        } else state.playPreviousTrack();
      } else if (event.ctrlKey && event.key === 'ArrowRight') {
        event.preventDefault();
        useDesktopMusicStore.getState().playNextTrack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!window.jukeboxWindow) return;
    if (current) {
      void window.jukeboxWindow.setTrayTrack?.(`${current.name} - ${current.artist}`);
    } else {
      void window.jukeboxWindow.setTrayTrack?.('');
    }
  }, [current]);

  useEffect(() => {
    if (!window.jukeboxWindow) return;
    const cleanToggle = window.jukeboxWindow.onTrayTogglePlay?.(() => {
      const state = useDesktopMusicStore.getState();
      if (!state.current || state.trackLoading) return;
      const audio = getSharedAudio();
      if (state.isPlaying) {
        audio.pause();
        state.setPlaying(false);
      } else {
        void audio.play().then(() => state.setPlaying(true)).catch(() => {
          state.setPlaying(false);
        });
      }
    });
    const cleanNext = window.jukeboxWindow.onTrayNextTrack?.(() => {
      useDesktopMusicStore.getState().playNextTrack();
    });
    return () => {
      cleanToggle?.();
      cleanNext?.();
    };
  }, []);

  return (
    <div className="desktop-music-app">
      <DesktopAudioEngine />
      <div className="desktop-workspace">
        <aside className="desktop-sidebar" aria-label="音乐导航">
          <nav className="desktop-nav-group">
            <p className="desktop-nav-label">音乐库</p>
            {NAV_ITEMS.map(({ id, label, Icon }) => (
              <button type="button" key={id} className={`desktop-nav-item${view === id ? ' is-active' : ''}`} onClick={() => setView(id)} aria-current={view === id ? 'page' : undefined}>
                <Icon aria-hidden="true" /><span>{label}</span>
                {id === 'favorites' && favorites.length > 0 && <small>{favorites.length}</small>}
              </button>
            ))}
          </nav>
          {playlists.length > 0 && (
            <div className="desktop-sidebar-playlists">
              <p className="desktop-nav-label">歌单</p>
              {playlists.slice(0, 6).map((playlist) => (
                <button type="button" key={playlist.id} className={`desktop-nav-item desktop-nav-playlist${activePlaylistId === playlist.id && view === 'playlists' ? ' is-active' : ''}`} onClick={() => { setView('playlists'); setActivePlaylistId(playlist.id); }}>
                  <ListMusic aria-hidden="true" /><span>{playlist.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="desktop-sidebar-footer"><span className="desktop-status-dot" />本机音乐空间</div>
        </aside>

        <main className="desktop-main-column">
          <div className="desktop-content-row">
            <section className="desktop-content-area">
              <header className="desktop-content-header">
                <div>
                  <h1>{viewMeta.title}</h1>
                  <p>{viewMeta.subtitle}</p>
                </div>
                <form className="desktop-search-form" onSubmit={handleSearchSubmit} role="search">
                  <Search aria-hidden="true" />
                  <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索歌曲、歌手或专辑" aria-label="搜索歌曲、歌手或专辑" />
                  <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as DesktopSourceFilter)} aria-label="搜索音源">
                    {SOURCE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                  <button type="submit" disabled={!searchInput.trim() || searchLoading} aria-label="开始搜索" title="搜索">
                    {searchLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
                  </button>
                </form>
              </header>

              <div className="desktop-view-scroll" key={view} ref={viewScrollRef}>
                {view === 'discover' && (
                  <>
                    <div className="desktop-section-heading"><div><h2>网易云音乐榜单</h2><p>实时读取平台公开榜单，不填充模拟歌曲。</p></div><button type="button" className="desktop-text-button" onClick={() => { setTopLoading(true); void getDesktopTopSongs(100).then(setTopSongs).catch((error: unknown) => setTopError(error instanceof Error ? error.message : '榜单加载失败')).finally(() => setTopLoading(false)); }}><RefreshCw aria-hidden="true" />刷新</button></div>
                    {topLoading ? <div className="desktop-loading"><Loader2 className="animate-spin" aria-hidden="true" />正在读取榜单…</div> : topError ? <EmptyState title="榜单暂不可用" detail={topError} action={<button type="button" className="desktop-primary-button" onClick={() => void getDesktopTopSongs(100).then(setTopSongs).catch((error: unknown) => setTopError(error instanceof Error ? error.message : '榜单加载失败'))}>重试</button>} /> : renderSongs(topSongs, '榜单暂时没有歌曲', '上游榜单没有返回歌曲，请稍后刷新。')}
                  </>
                )}

                {view === 'search' && (
                  <>
                    {searchTerm ? (
                      <div className="desktop-section-heading"><div><h2>“{searchTerm}” 的搜索结果</h2><p>{searchResults.length} 首歌曲 · {SOURCE_OPTIONS.find((option) => option.id === sourceFilter)?.label}</p></div></div>
                    ) : (
                      <div className="desktop-section-heading"><div><h2>最近搜索</h2><p>本机保存的搜索记录。</p></div></div>
                    )}
                    {searchLoading ? <div className="desktop-loading"><Loader2 className="animate-spin" aria-hidden="true" />正在搜索音乐源…</div> : searchError ? <EmptyState title="搜索暂不可用" detail={searchError} action={<button type="button" className="desktop-primary-button" onClick={() => void runSearch(searchTerm)}>重试</button>} /> : searchTerm ? (
                      <>
                        {renderSongs(searchResults.slice((searchPage - 1) * SEARCH_PAGE_SIZE, searchPage * SEARCH_PAGE_SIZE), '没有找到歌曲', '换一个歌名或搜索其他音源。')}
                        {searchResults.length > SEARCH_PAGE_SIZE && (
                          <div className="desktop-pagination">
                            <button type="button" className="desktop-secondary-button" onClick={() => gotoSearchPage(searchPage - 1)} disabled={searchPage <= 1}>
                              <ChevronLeft aria-hidden="true" />上一页
                            </button>
                            <span className="desktop-pagination-status">第 {searchPage} / {searchTotalPages} 页 · 共 {searchResults.length} 首</span>
                            <button type="button" className="desktop-secondary-button" onClick={() => gotoSearchPage(searchPage + 1)} disabled={searchPage >= searchTotalPages}>
                              下一页<ChevronRight aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </>
                    ) : recentSearches.length ? <div className="desktop-recent-searches">{recentSearches.map((query) => <button type="button" key={query} onClick={() => void runSearch(query)}><Clock3 aria-hidden="true" />{query}</button>)}</div> : <EmptyState title="开始搜索音乐" detail="输入歌曲名、歌手或专辑，即可搜索可用音乐源。" />}
                  </>
                )}

                {view === 'favorites' && (
                  <>
                    <div className="desktop-section-heading"><div><h2>已收藏的歌曲</h2><p>{favorites.length} 首歌曲</p></div></div>
                    {renderSongs(favorites, '还没有收藏歌曲', '在榜单或搜索结果中点击爱心，歌曲会保存在本机。')}
                  </>
                )}

                {view === 'history' && (
                  <>
                    <div className="desktop-section-heading"><div><h2>最近播放</h2><p>本机保留最近 {history.length} 首歌曲</p></div></div>
                    {renderSongs(history, '播放历史为空', '开始播放歌曲后，最近播放记录会显示在这里。')}
                  </>
                )}

                {view === 'playlists' && (
                  <>
                    <div className="desktop-section-heading"><div><h2>{selectedPlaylist?.name || '本机歌单'}</h2><p>{selectedPlaylist ? `${selectedPlaylist.tracks.length} 首歌曲` : '创建歌单并从搜索结果添加歌曲。'}</p></div>{selectedPlaylist && <button type="button" className="desktop-text-button desktop-danger-text" onClick={() => { deletePlaylist(selectedPlaylist.id); setActivePlaylistId(null); }}><Trash2 aria-hidden="true" />删除歌单</button>}</div>
                    <form className="desktop-create-playlist" onSubmit={handleCreatePlaylist}>
                      <input value={newPlaylistName} onChange={(event) => setNewPlaylistName(event.target.value)} maxLength={50} placeholder="新歌单名称" aria-label="新歌单名称" />
                      <button type="submit" className="desktop-primary-button" disabled={!newPlaylistName.trim()}><Plus aria-hidden="true" />创建歌单</button>
                    </form>
                    {selectedPlaylist ? renderSongs(selectedPlaylist.tracks, '歌单还是空的', '在搜索或收藏列表中用文件夹按钮添加歌曲。', selectedPlaylist.id) : playlists.length ? renderPlaylistList(playlists) : <EmptyState title="创建你的第一个歌单" detail="歌单只保存在本机，不会同步到多人房间。" />}
                  </>
                )}

                {view === 'local' && (
                  <>
                    <div className="desktop-section-heading"><div><h2>本机音频文件</h2><p>仅在当前运行期间使用原文件，不会复制或上传。</p></div><button type="button" className="desktop-primary-button" onClick={() => fileInputRef.current?.click()}><Plus aria-hidden="true" />打开音频文件</button></div>
                    <input ref={fileInputRef} className="desktop-file-input" type="file" accept="audio/*,.mp3,.flac,.m4a,.wav,.aac,.ogg,.opus" multiple onChange={(event) => handleLocalFiles(event.currentTarget.files)} aria-label="选择本地音频文件" />
                    {renderSongs(localTracks, '尚未打开本地文件', '选择电脑中的音频文件后，可以加入当前播放队列。')}
                  </>
                )}

                {view === 'settings' && (
                  <div className="desktop-settings">
                    <section className="desktop-settings-section desktop-update-section">
                      <div className="desktop-update-heading">
                        <div>
                          <h2>软件更新</h2>
                          <p>自动检查 GitHub 上的 Windows 版本，也可以随时手动检查。</p>
                        </div>
                        <span className="desktop-version-label">当前 v{nativeUpdate?.currentVersion || updateInfo?.currentVersion || __APP_VERSION__}</span>
                      </div>
                      <div className="desktop-update-actions">
                        <button type="button" className="desktop-secondary-button" onClick={() => void checkForUpdates(true)} disabled={updateChecking}>
                          {updateChecking ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                          {updateChecking ? '正在检查' : '检查更新'}
                        </button>
                        <button type="button" className="desktop-text-button" onClick={() => setChangelogOpen(true)}>
                          <ScrollText aria-hidden="true" />更新日志
                        </button>
                        <button
                          type="button"
                          className="desktop-text-button"
                          onClick={() => window.open(updateInfo?.releasePageUrl || 'https://github.com/yuchen0x1/JukeboxRoom/releases', '_blank', 'noopener,noreferrer')}
                        >
                          <ExternalLink aria-hidden="true" />GitHub 发布页
                        </button>
                        <button
                          type="button"
                          className="desktop-text-button"
                          onClick={() => window.open(QQ_GROUP_URL, '_blank', 'noopener,noreferrer')}
                          title="加入 QQ 交流群：冷漠网络科技交流群①"
                        >
                          <MessagesSquare aria-hidden="true" />QQ 交流群
                        </button>
                      </div>
                      <p className="desktop-update-feedback" aria-live="polite">
                        {!nativeUpdate && window.desktopUpdater && desktopUpdateState && !desktopUpdateState.supported
                          ? '自动下载安装仅适用于已安装的 Windows 桌面版。'
                          : updateChecking || nativeUpdate?.state === 'checking'
                          ? '正在检查最新版本…'
                          : nativeUpdate?.state === 'error'
                            ? nativeUpdate.error
                            : nativeUpdate?.state === 'not-available'
                              ? '当前已是最新版本。'
                              : nativeUpdateAvailable && nativeLatestVersion
                                ? `发现新版本 v${nativeLatestVersion}。`
                            : updateMessage === 'latest'
                              ? '当前已是最新版本。'
                              : updateMessage === 'failed'
                                ? '暂时无法检测更新，请稍后重试。'
                                : updateInfo
                                  ? `已是最新版本${formatUpdateTime(updateInfo.checkedAt) ? ` · 检查于 ${formatUpdateTime(updateInfo.checkedAt)}` : ''}`
                                  : '尚未取得版本信息。'}
                        {updateInfo?.stale && !nativeUpdate && ' 当前显示缓存的检测结果。'}
                      </p>
                      {nativeUpdateAvailable && nativeUpdate?.latestVersion && snoozedDesktopVersion !== nativeUpdate.latestVersion ? (
                        <div className="desktop-update-available">
                          <div className="desktop-update-release-heading">
                            <strong>JukeboxRoom v{nativeUpdate.latestVersion}</strong>
                            {nativeUpdate.releaseDate && <span>{formatUpdateTime(nativeUpdate.releaseDate)}</span>}
                          </div>
                          {nativeUpdate.total > 0 && nativeUpdate.state !== 'downloading' && <p>安装包大小：{formatUpdateBytes(nativeUpdate.total)}</p>}
                          {nativeUpdate.releaseNotes && <p className="whitespace-pre-line">{releaseNotesToPlainText(nativeUpdate.releaseNotes)}</p>}
                          {nativeUpdate.state === 'downloading' && (
                            <div className="desktop-native-download-progress" role="status" aria-live="polite">
                              <div className="desktop-native-download-progress-track"><span style={{ width: `${nativeUpdate.percent}%` }} /></div>
                              <small>{nativeUpdate.percent.toFixed(1)}% · {formatUpdateBytes(nativeUpdate.transferred)} / {formatUpdateBytes(nativeUpdate.total)}{nativeUpdate.bytesPerSecond > 0 ? ` · ${formatUpdateBytes(nativeUpdate.bytesPerSecond)}/s` : ''}{formatUpdateTimeRemaining(nativeUpdate.total, nativeUpdate.transferred, nativeUpdate.bytesPerSecond) ? ` · ${formatUpdateTimeRemaining(nativeUpdate.total, nativeUpdate.transferred, nativeUpdate.bytesPerSecond)}` : ''}</small>
                              <button type="button" className="desktop-text-button" onClick={() => void cancelDesktopUpdateDownload()}>取消下载</button>
                            </div>
                          )}
                          {nativeUpdate.state === 'downloaded' ? (
                            <button type="button" className="desktop-primary-button" onClick={() => void installDesktopUpdate()} disabled={desktopUpdateAction !== null}>
                              {desktopUpdateAction === 'install' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}退出并安装更新
                            </button>
                          ) : (
                            <button type="button" className="desktop-primary-button" onClick={() => void downloadDesktopUpdate()} disabled={desktopUpdateAction !== null || nativeUpdate.state === 'downloading'}>
                              {desktopUpdateAction === 'download' || nativeUpdate.state === 'downloading' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}{nativeUpdate.state === 'error' ? '重试下载' : '下载并安装'}
                            </button>
                          )}
                          <button type="button" className="desktop-text-button" onClick={() => setSnoozedDesktopVersion(nativeUpdate.latestVersion || '')}>稍后提醒</button>
                        </div>
                      ) : !nativeUpdate && updateInfo?.updateAvailable && updateInfo.latestVersion && (
                        <div className="desktop-update-available">
                          <div className="desktop-update-release-heading">
                            <strong>JukeboxRoom v{updateInfo.latestVersion}</strong>
                            {updateInfo.publishedAt && <span>{formatUpdateTime(updateInfo.publishedAt)}</span>}
                          </div>
                          {updateInfo.releaseNotes && <p className="whitespace-pre-line">{releaseNotesToPlainText(updateInfo.releaseNotes)}</p>}
                          <button
                            type="button"
                            className="desktop-primary-button"
                            onClick={() => {
                              const url = updateInfo.assets.desktop?.url || updateInfo.releaseUrl || updateInfo.releasePageUrl;
                              if (url) window.open(url, '_blank', 'noopener,noreferrer');
                            }}
                          >
                            {updateInfo.assets.desktop ? <Download aria-hidden="true" /> : <ExternalLink aria-hidden="true" />}
                            {updateInfo.assets.desktop ? '下载 Windows 安装包' : '打开 GitHub 发布页'}
                          </button>
                        </div>
                      )}
                    </section>
                    <section className="desktop-settings-section">
                      <h2>默认搜索音源</h2>
                      <p>只搜索桌面版可独立解析的公开音源。会员歌曲仍受平台账号权限限制。</p>
                      <div className="desktop-source-options">
                        {SOURCE_OPTIONS.map((option) => (
                          <button type="button" key={option.id} className={`desktop-source-option${sourceFilter === option.id ? ' is-selected' : ''}`} onClick={() => setSourceFilter(option.id)}>
                            <span><Radio aria-hidden="true" /></span><strong>{option.label}</strong>{sourceFilter === option.id && <Check aria-hidden="true" />}
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="desktop-settings-section">
                      <h2>播放质量</h2>
                      <p>质量设置仅影响这台电脑的音源解析请求。</p>
                      <label className="desktop-setting-select"><span>默认音质</span><select value={playbackQuality} onChange={(event) => setPlaybackQuality(event.target.value)}><option value="standard">标准</option><option value="higher">较高</option><option value="exhigh">高品质</option><option value="lossless">无损</option><option value="hires">Hi-Res</option></select></label>
                    </section>
                    <section className="desktop-settings-section">
                      <h2>音源状态</h2>
                      <p>平台公开接口的可用性会随上游策略变化。</p>
                      {capabilityError && <p className="desktop-settings-error">{capabilityError}</p>}
                      <div className="desktop-capability-list">
                        {(['netease', 'tencent', 'kugou', 'qishui', 'migu'] as const).map((source) => {
                          const sourceCapability = capabilities?.sources[source];
                          const label = SOURCE_OPTIONS.find((option) => option.id === source)?.label || source;
                          const available = sourceCapability?.playback;
                          return <div className="desktop-capability-row" key={source}><span className={`desktop-status-dot${available ? '' : ' is-muted'}`} /><span>{label}</span><small>{sourceCapability ? available ? '搜索与播放可用' : '搜索可用，播放需配置' : '读取中'}</small></div>;
                        })}
                      </div>
                      {capabilities && !capabilities.sources.netease.playback && <div className="desktop-config-callout"><p>未配置 Meting API 时，可先登录网易云账号播放账号有权限的歌曲；也可以配置 Meting API 或切换到其他可用音源。</p><button type="button" className="desktop-secondary-button" onClick={() => setSourceLoginOpen(true)}>登录音乐平台账号</button><button type="button" className="desktop-secondary-button" onClick={() => void openMusicConfig()}>打开音源配置</button><button type="button" className="desktop-text-button" onClick={() => void restartApp()}>保存后重启应用</button></div>}
                    </section>
                    <section className="desktop-settings-section">
                      <h2>音乐平台账号</h2>
                      <p>扫码登录网易云、QQ 音乐、酷狗或汽水音乐；咪咕音乐使用手机号验证码试验性登录。账号用于平台授权播放；歌曲搜索来自公开曲库，不会读取私人歌单。</p>
                      <div className="desktop-account-list">
                        {(['netease', 'tencent', 'kugou', 'qishui', 'migu'] as const).map((source) => {
                          const label = SOURCE_OPTIONS.find((option) => option.id === source)?.label || source;
                          const loggedIn = sourceLogins[source];
                          return (
                            <div className="desktop-account-row" key={source}>
                              <span className={`desktop-status-dot${loggedIn ? '' : ' is-muted'}`} />
                              <span className="desktop-account-name">{label}</span>
                              <small className={loggedIn ? 'is-connected' : ''}>{loggedIn ? '已登录' : '未登录'}</small>
                            </div>
                          );
                        })}
                      </div>
                      {accountError && <p className="desktop-settings-error">{accountError}</p>}
                      <button type="button" className="desktop-secondary-button desktop-account-manage" onClick={() => setSourceLoginOpen(true)}>
                        <LogIn aria-hidden="true" />{Object.values(sourceLogins).some(Boolean) ? '管理音乐账号' : '登录音乐账号'}
                      </button>
                    </section>
                    <section className="desktop-settings-section">
                      <h2>本机数据</h2>
                      <p>收藏、最近播放、歌单、音量、音质、播放队列、最近搜索和房间数据保存在当前 Windows 用户配置中。卸载应用不会自动删除，需要时可从这里手动清理。</p>
                      <div className="desktop-config-callout">
                        <p>清理前请先备份需要保留的歌单或收藏。</p>
                        <button type="button" className="desktop-secondary-button" onClick={() => void openDataDir()}>打开数据目录</button>
                        <button type="button" className="desktop-text-button" onClick={() => void clearLocalData()}>清空本地数据</button>
                      </div>
                    </section>
                  </div>
                )}
              </div>
            </section>

            {rightPanelOpen && (
              <aside className="desktop-side-panel" aria-label="歌曲侧栏">
                <div className="desktop-side-panel-header">
                  <div className="desktop-panel-tabs" role="tablist" aria-label="歌曲信息面板">
                    <button type="button" className={rightPanelTab === 'lyrics' ? 'is-active' : ''} onClick={() => setRightPanelTab('lyrics')} role="tab" aria-selected={rightPanelTab === 'lyrics'} title="歌词"><Mic2 aria-hidden="true" /></button>
                    <button type="button" className={rightPanelTab === 'queue' ? 'is-active' : ''} onClick={() => setRightPanelTab('queue')} role="tab" aria-selected={rightPanelTab === 'queue'} title="播放队列"><ListMusic aria-hidden="true" /></button>
                    <button type="button" className={rightPanelTab === 'details' ? 'is-active' : ''} onClick={() => setRightPanelTab('details')} role="tab" aria-selected={rightPanelTab === 'details'} title="歌曲详情"><Info aria-hidden="true" /></button>
                  </div>
                  <button type="button" className="desktop-icon-button" onClick={() => setRightPanelOpen(false)} title="收起侧栏" aria-label="收起侧栏"><X aria-hidden="true" /></button>
                </div>
                {rightPanelTab === 'lyrics' && (
                  <div className="desktop-lyrics-panel">
                    {current ? <><div className="desktop-lyrics-track"><Cover song={current} size="medium" /><div><strong>{current.name}</strong><span>{current.artist}</span></div></div>{current.isLocal ? <EmptyState title="本地文件暂不支持歌词" detail="本地歌词读取未启用。" /> : <Lyrics lines={lyricLines} currentTime={currentTime} onSeek={(time) => { useDesktopMusicStore.getState().seekTo(time); getSharedAudio().currentTime = time; }} variant="side" scrollable />}</> : <EmptyState title="歌词会显示在这里" detail="播放歌曲后查看同步歌词和当前歌曲信息。" />}
                  </div>
                )}
                {rightPanelTab === 'queue' && (
                  <div className="desktop-queue-panel">
                    <div className="desktop-queue-heading"><div><strong>播放队列</strong><small>{queue.length} 首待播</small></div><button type="button" className="desktop-text-button desktop-danger-text" onClick={clearQueue} disabled={!queue.length}><Trash2 aria-hidden="true" />清空</button></div>
                    {current && <div className="desktop-queue-current"><span>正在播放</span><strong>{current.name}</strong><small>{current.artist}</small></div>}
                    {queue.length ? queue.map((track, index) => (
                      <QueueRow key={track.trackKey} track={track} index={index} favorites={favorites} playlists={playlists} onPlay={playTrack} onQueue={addToQueue} onFavorite={toggleFavorite} onAddPlaylist={handleAddPlaylist} onRemove={() => removeFromQueue(track.trackKey)} current={false} />
                    )) : <EmptyState title="队列为空" detail="在搜索结果中点击添加按钮，歌曲会加入待播列表。" />}
                  </div>
                )}
                {rightPanelTab === 'details' && (
                  <div className="desktop-detail-panel">
                    {current ? <><Cover song={current} size="medium" /><h2>{current.name}</h2><p>{current.artist}</p><dl><div><dt>音源</dt><dd>{current.isLocal ? '本地文件' : getSourceLabel(current.source)}</dd></div><div><dt>专辑</dt><dd>{current.album || '未知专辑'}</dd></div><div><dt>时长</dt><dd>{songDuration(current)}</dd></div><div><dt>文件</dt><dd>{current.isLocal ? current.fileName : '在线音源'}</dd></div></dl></> : <EmptyState title="没有正在播放的歌曲" detail="开始播放后查看歌曲详情。" />}
                  </div>
                )}
              </aside>
            )}
            {!rightPanelOpen && <button type="button" className="desktop-open-panel" onClick={() => setRightPanelOpen(true)} title="展开侧栏" aria-label="展开歌词、队列和详情"><ListMusic aria-hidden="true" /></button>}
          </div>
          <DesktopAudioPlayer
            onOpenPanel={(tab) => { setRightPanelTab(tab); setRightPanelOpen(true); }}
            onOpenQueue={openQueue}
            onSearchCurrent={searchCurrentVersion}
          />
        </main>
      </div>
      <RoomSourceLoginModal
        open={sourceLoginOpen}
        mode="desktop"
        roomId=""
        sourceLogins={sourceLogins}
        onClose={() => setSourceLoginOpen(false)}
        onSaveCredential={saveDesktopCredential}
        onRemoveCredential={removeDesktopCredential}
        onCredentialChange={async () => {
          try {
            await refreshSourceLogins();
          } catch (error) {
            setAccountError(error instanceof Error ? error.message : '音乐账号状态不可用');
          }
        }}
      />
      <Modal
        open={changelogOpen}
        onClose={() => setChangelogOpen(false)}
        ariaLabelledBy="changelog-title"
        containerClassName="fixed inset-0 flex items-center justify-center p-3 sm:p-6"
        panelClassName="glass-surface glass-surface--modal relative h-[min(82vh,48rem)] w-full max-w-2xl animate-fade-in overflow-hidden rounded-2xl"
      >
        <ChangelogViewer onClose={() => setChangelogOpen(false)} />
      </Modal>
    </div>
  );
}
