import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import {
  AudioLines,
  ChevronDown,
  ChevronLeft,
  Disc3,
  ExternalLink,
  Heart,
  History,
  ListMusic,
  ListPlus,
  LoaderCircle,
  MessagesSquare,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Repeat,
  Repeat1,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  WifiOff,
  X,
} from 'lucide-react';
import type { LyricLine, MusicSource, SearchResult, Song } from '../types';
import { formatDuration, getSourceLabel, parseLrc } from '../api/music';
import { getAndroidLyrics, getAndroidSongUrl, getAndroidTopSongs, searchAndroidSongsPage } from '../api/androidMusic';
import Lyrics from './Lyrics';
import { useDesktopMusicStore } from '../stores/desktopMusicStore';
import { NativeMedia, type NativeMediaState } from '../lib/androidMedia';
import { openExternalUrl, resolveMobileApiUrl } from '../lib/mobileApi';
import { getMobileMetingUrl, saveMobileMetingUrl } from '../lib/mobileSettings';
import { acceptsNativeState, nativeQueueId } from '../lib/nativePlayback';
import { resizeCoverUrl } from '../lib/coverUrl';
import MobileUpdateSettings from './MobileUpdateSettings';
import './androidMusic.css';

type MainTab = 'discover' | 'search' | 'favorites' | 'history' | 'playlists' | 'settings';
type PlayerPanel = 'player' | 'lyrics' | 'queue' | null;

const QQ_GROUP_URL = 'https://qm.qq.com/q/ktfryAk4Y8';

const SOURCE_FILTERS: Array<{ id: 'all' | MusicSource; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'netease', label: '网易云' },
  { id: 'tencent', label: 'QQ音乐' },
];

const TAB_ITEMS: Array<{ id: MainTab; label: string; Icon: typeof Radio }> = [
  { id: 'discover', label: '发现', Icon: Radio },
  { id: 'search', label: '搜索', Icon: Search },
  { id: 'favorites', label: '收藏', Icon: Heart },
  { id: 'history', label: '最近', Icon: History },
  { id: 'playlists', label: '歌单', Icon: ListMusic },
];

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function AndroidCover({ song, large = false }: { song: Song; large?: boolean }) {
  const coverUrl = resolveMobileApiUrl(resizeCoverUrl(song.pic || '', large ? 'full' : 'thumb'));
  return (
    <span className={`android-cover${large ? ' android-cover--large' : ''}`}>
      {coverUrl && <img src={coverUrl} alt="" loading={large ? 'eager' : 'lazy'} onError={(event) => { event.currentTarget.style.opacity = '0'; }} />}
      <Disc3 aria-hidden="true" />
    </span>
  );
}

function EmptyState({ icon: Icon = Music2, title, detail, action }: {
  icon?: typeof Music2;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="android-empty-state">
      <span><Icon aria-hidden="true" /></span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action}
    </div>
  );
}

function AndroidNativeAudioEngine() {
  const current = useDesktopMusicStore((state) => state.current);
  const playbackQuality = useDesktopMusicStore((state) => state.playbackQuality);
  const isPlaying = useDesktopMusicStore((state) => state.isPlaying);
  const loadedTrackKey = useRef<string | null>(null);
  const endedQueueId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let stateListener: { remove: () => Promise<void> } | undefined;
    let transportListener: { remove: () => Promise<void> } | undefined;

    const applyState = (payload: NativeMediaState) => {
      const store = useDesktopMusicStore.getState();
      if (!active || !acceptsNativeState(payload, store.current)) return;
      if (payload.status === 'playing') endedQueueId.current = null;
      if (payload.status === 'loading') store.setTrackLoading(true);
      else if (payload.status === 'error') {
        store.setTrackLoading(false);
        store.setPlaying(false);
        store.setPlaybackError(payload.error || '系统播放器遇到错误，请重试或切换音源。');
      } else {
        store.setTrackLoading(false);
        if (payload.status === 'playing' || payload.status === 'paused') store.setPlaying(payload.status === 'playing');
        if (payload.status === 'ended') {
          if (endedQueueId.current === payload.queueId) return;
          endedQueueId.current = payload.queueId || null;
          if (store.repeatMode === 'one') {
            void NativeMedia.seekTo({ position: 0 }).then(() => NativeMedia.play()).catch(() => undefined);
          } else {
            store.playNextTrack(true);
          }
        }
      }
      if (payload.positionMs >= 0) store.setCurrentTime(payload.positionMs / 1000);
      if (payload.durationMs > 0) store.setDuration(payload.durationMs / 1000);
    };

    void NativeMedia.addListener('state', applyState).then((handle) => {
      stateListener = handle;
      if (!active) void handle.remove();
    }).catch(() => undefined);
    void NativeMedia.addListener('transport', ({ action, queueId }) => {
      const store = useDesktopMusicStore.getState();
      if (!active || !store.current || queueId !== nativeQueueId(store.current)) return;
      if (action === 'next') {
        store.playNextTrack();
      } else if (store.currentTime > 3) {
        store.seekTo(0);
        void NativeMedia.seekTo({ position: 0 }).catch(() => undefined);
      } else {
        store.playPreviousTrack();
      }
    }).then((handle) => {
      transportListener = handle;
      if (!active) void handle.remove();
    }).catch(() => undefined);

    const poll = window.setInterval(() => {
      if (!useDesktopMusicStore.getState().isPlaying) return;
      void NativeMedia.getState().then(applyState).catch(() => undefined);
    }, 900);

    void NativeMedia.getState().then(applyState).catch(() => undefined);

    return () => {
      active = false;
      window.clearInterval(poll);
      if (stateListener) void stateListener.remove();
      if (transportListener) void transportListener.remove();
    };
  }, []);

  useEffect(() => {
    if (!current) {
      loadedTrackKey.current = null;
      void NativeMedia.stop().catch(() => undefined);
      useDesktopMusicStore.getState().setTrackLoading(false);
      return;
    }

    let active = true;
    const requestId = current.requestId;
    const trackKey = nativeQueueId(current);
    const store = useDesktopMusicStore.getState();
    store.setTrackLoading(true);
    store.setPlaybackError('');
    // Stop the previous recording while resolving the newly selected track.
    void NativeMedia.pause().catch(() => undefined);

    void getAndroidSongUrl(current, playbackQuality).then(async (url) => {
      if (!active || useDesktopMusicStore.getState().current?.requestId !== requestId) return;
      const latest = useDesktopMusicStore.getState();
      await NativeMedia.load({
        url: resolveMobileApiUrl(url),
        queueId: trackKey,
        title: current.name,
        artist: current.artist,
        album: current.album,
        artworkUrl: resolveMobileApiUrl(resizeCoverUrl(current.pic || '', 'medium')),
        position: Math.max(0, latest.currentTime * 1000),
        autoplay: latest.isPlaying,
      });
      if (!active || useDesktopMusicStore.getState().current?.requestId !== requestId) return;
      loadedTrackKey.current = trackKey;
    }).catch((error: unknown) => {
      if (!active || useDesktopMusicStore.getState().current?.requestId !== requestId) return;
      const message = error instanceof Error ? error.message : '无法获取这首歌的播放地址';
      useDesktopMusicStore.getState().setTrackLoading(false);
      useDesktopMusicStore.getState().setPlaying(false);
      useDesktopMusicStore.getState().setPlaybackError(message);
    });

    return () => { active = false; };
  }, [current?.requestId, current?.trackKey, playbackQuality]);

  useEffect(() => {
    if (!current || loadedTrackKey.current !== nativeQueueId(current)) return;
    const action = useDesktopMusicStore.getState().isPlaying ? NativeMedia.play() : NativeMedia.pause();
    void action.catch(() => undefined);
  }, [current?.trackKey, current?.requestId, isPlaying]);

  useEffect(() => {
    void NativeMedia.setVolume({ volume: useDesktopMusicStore.getState().volume }).catch(() => undefined);
    return useDesktopMusicStore.subscribe((state, previous) => {
      if (state.volume !== previous.volume) {
        void NativeMedia.setVolume({ volume: state.volume }).catch(() => undefined);
      }
    });
  }, []);

  return null;
}

export default function AndroidMusicApp() {
  const [tab, setTab] = useState<MainTab>('discover');
  const [panel, setPanel] = useState<PlayerPanel>(null);
  const [searchInput, setSearchInput] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchWarnings, setSearchWarnings] = useState<string[]>([]);
  const searchSequence = useRef(0);
  const submittedQuery = useRef('');
  const [metingInput, setMetingInput] = useState(getMobileMetingUrl);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [featuredSongs, setFeaturedSongs] = useState<SearchResult[]>([]);
  const [featuredError, setFeaturedError] = useState('');
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const [featuredRetry, setFeaturedRetry] = useState(0);
  const [playlistName, setPlaylistName] = useState('');
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [playlistTarget, setPlaylistTarget] = useState<Song | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);

  const current = useDesktopMusicStore((state) => state.current);
  const isPlaying = useDesktopMusicStore((state) => state.isPlaying);
  const trackLoading = useDesktopMusicStore((state) => state.trackLoading);
  const playbackError = useDesktopMusicStore((state) => state.playbackError);
  const currentTime = useDesktopMusicStore((state) => state.currentTime);
  const duration = useDesktopMusicStore((state) => state.duration);
  const volume = useDesktopMusicStore((state) => state.volume);
  const playbackQuality = useDesktopMusicStore((state) => state.playbackQuality);
  const queue = useDesktopMusicStore((state) => state.queue);
  const favorites = useDesktopMusicStore((state) => state.favorites);
  const history = useDesktopMusicStore((state) => state.history);
  const playlists = useDesktopMusicStore((state) => state.playlists);
  const sourceFilter = useDesktopMusicStore((state) => state.sourceFilter);
  const repeatMode = useDesktopMusicStore((state) => state.repeatMode);
  const shuffle = useDesktopMusicStore((state) => state.shuffle);
  const togglePlaying = useDesktopMusicStore((state) => state.togglePlaying);
  const playTrack = useDesktopMusicStore((state) => state.playTrack);
  const playNextTrack = useDesktopMusicStore((state) => state.playNextTrack);
  const playPreviousTrack = useDesktopMusicStore((state) => state.playPreviousTrack);
  const toggleFavorite = useDesktopMusicStore((state) => state.toggleFavorite);
  const addToQueue = useDesktopMusicStore((state) => state.addToQueue);
  const removeFromQueue = useDesktopMusicStore((state) => state.removeFromQueue);
  const clearQueue = useDesktopMusicStore((state) => state.clearQueue);
  const createPlaylist = useDesktopMusicStore((state) => state.createPlaylist);
  const deletePlaylist = useDesktopMusicStore((state) => state.deletePlaylist);
  const addTrackToPlaylist = useDesktopMusicStore((state) => state.addTrackToPlaylist);
  const setSourceFilter = useDesktopMusicStore((state) => state.setSourceFilter);
  const setPlaybackQuality = useDesktopMusicStore((state) => state.setPlaybackQuality);
  const setVolume = useDesktopMusicStore((state) => state.setVolume);
  const setRepeatMode = useDesktopMusicStore((state) => state.setRepeatMode);
  const toggleShuffle = useDesktopMusicStore((state) => state.toggleShuffle);
  const seekTo = useDesktopMusicStore((state) => state.seekTo);
  const retryCurrent = useDesktopMusicStore((state) => state.retryCurrent);

  const activePlaylist = playlists.find((playlist) => playlist.id === activePlaylistId) || null;
  const navigation = useRef({ panel, playlistTarget, activePlaylistId, tab });
  navigation.current = { panel, playlistTarget, activePlaylistId, tab };
  useEffect(() => {
    let active = true;
    let handle: { remove: () => Promise<void> } | undefined;
    void CapacitorApp.addListener('backButton', () => {
      const state = navigation.current;
      if (state.playlistTarget) setPlaylistTarget(null);
      else if (state.panel) setPanel(null);
      else if (state.activePlaylistId) setActivePlaylistId(null);
      else if (state.tab !== 'discover') setTab('discover');
      else void CapacitorApp.minimizeApp();
    }).then((listener) => { handle = listener; if (!active) void listener.remove(); }).catch(() => undefined);
    return () => { active = false; searchSequence.current += 1; if (handle) void handle.remove(); };
  }, []);
  const isFavorite = useCallback((song: Song) => favorites.some((item) => (
    item.id === song.id && item.source === song.source
  )), [favorites]);

  useEffect(() => {
    let active = true;
    setFeaturedLoading(true);
    void getAndroidTopSongs(30).then((songs) => {
      if (active) {
        setFeaturedSongs(songs);
        setFeaturedError('');
      }
    }).catch((error: unknown) => {
      if (active) setFeaturedError(error instanceof Error ? error.message : '暂时无法读取音乐榜单');
    }).finally(() => {
      if (active) setFeaturedLoading(false);
    });
    return () => { active = false; };
  }, [featuredRetry]);

  useEffect(() => {
    if (!current || current.isLocal) {
      setLyrics([]);
      return;
    }
    let active = true;
    setLyrics([]);
    void getAndroidLyrics(current).then((lrc) => {
      if (active) setLyrics(parseLrc(lrc));
    }).catch(() => {
      if (active) setLyrics([]);
    });
    return () => { active = false; };
  }, [current?.id, current?.source, current?.name, current?.lrc]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panel) setPanel(null);
      if (event.code !== 'Space' || event.isComposing) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!current || trackLoading) return;
      event.preventDefault();
      togglePlaying();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, panel, togglePlaying, trackLoading]);

  const executeSearch = async (query: string, source: 'all' | MusicSource, page = 1) => {
    if (!query) return;
    const sequence = ++searchSequence.current;
    submittedQuery.current = query;
    setTab('search');
    setSearching(true);
    setSearchError('');
    setSearchWarnings([]);
    if (page === 1) { setResults([]); setSearchPage(0); setHasMore(false); }
    try {
      useDesktopMusicStore.getState().addRecentSearch(query);
      const result = await searchAndroidSongsPage(query, source, page);
      if (sequence !== searchSequence.current) return;
      setResults((previous) => {
        const merged = page === 1 ? result.songs : [...previous, ...result.songs];
        return merged.filter((song, index) => merged.findIndex((item) => item.id === song.id && item.source === song.source) === index);
      });
      setSearchPage(page);
      setHasMore(result.hasMore);
      setSearchWarnings(result.warnings);
      if (!result.songs.length && page === 1) setSearchError('没有找到歌曲，请更换关键词后重试。');
    } catch (error) {
      if (sequence !== searchSequence.current) return;
      setSearchError(error instanceof Error ? error.message : '搜索失败，请稍后重试。');
    } finally {
      if (sequence === searchSequence.current) setSearching(false);
    }
  };

  const runSearch = (event?: FormEvent) => {
    event?.preventDefault();
    void executeSearch(searchInput.trim(), sourceFilter);
  };

  useEffect(() => {
    if (sourceFilter !== 'all' && sourceFilter !== 'netease' && sourceFilter !== 'tencent') {
      setSourceFilter('all');
    }
  }, [sourceFilter, setSourceFilter]);

  const togglePlayback = () => {
    if (!current) return;
    if (trackLoading && !isPlaying) return;
    togglePlaying();
  };

  const handleSeek = (value: number) => {
    seekTo(value);
    void NativeMedia.seekTo({ position: Math.round(value * 1000) }).catch(() => undefined);
  };

  const playSong = (song: Song) => {
    playTrack(song);
    setPanel('player');
  };

  const addSong = (song: Song) => addToQueue(song);

  const createNewPlaylist = () => {
    const createdId = createPlaylist(playlistName);
    if (!createdId) return;
    setPlaylistName('');
    setActivePlaylistId(createdId);
  };

  const addToPlaylist = (playlistId: string) => {
    if (!playlistTarget) return;
    addTrackToPlaylist(playlistId, playlistTarget);
    setPlaylistTarget(null);
  };

  const playPlaylist = (songs: Song[]) => {
    if (!songs.length) return;
    useDesktopMusicStore.getState().clearQueue();
    for (const song of songs.slice(1)) useDesktopMusicStore.getState().addToQueue(song);
    playTrack(songs[0]);
    setPanel('player');
  };

  const handleRepeat = () => {
    setRepeatMode(repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off');
  };

  const tabTitle: Record<MainTab, string> = {
    discover: '发现音乐',
    search: '音乐搜索',
    favorites: '我的收藏',
    history: '最近播放',
    playlists: activePlaylist?.name || '我的歌单',
    settings: '设置',
  };

  const renderSongList = (songs: Song[], emptyTitle: string, emptyDetail: string) => (
    songs.length ? (
      <div className="android-song-list">
        {songs.map((song, index) => (
          <article className="android-song-row" key={`${song.source}:${song.id}:${index}`}>
            <button type="button" className="android-song-main" onClick={() => playSong(song)}>
              <AndroidCover song={song} />
              <span className="android-song-copy">
                <strong>{song.name}</strong>
                <small>{song.artist}<i>{getSourceLabel(song.source)}</i></small>
              </span>
            </button>
            <div className="android-song-actions">
              <button type="button" className={`android-icon-button${isFavorite(song) ? ' is-favorite' : ''}`} onClick={() => toggleFavorite(song)} aria-label={isFavorite(song) ? '取消收藏' : '收藏歌曲'}>
                <Heart aria-hidden="true" fill={isFavorite(song) ? 'currentColor' : 'none'} />
              </button>
              <button type="button" className="android-icon-button" onClick={() => setPlaylistTarget(song)} aria-label="添加到歌单"><ListPlus aria-hidden="true" /></button>
              <button type="button" className="android-icon-button" onClick={() => addSong(song)} aria-label="加入播放队列"><Plus aria-hidden="true" /></button>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <EmptyState title={emptyTitle} detail={emptyDetail} />
    )
  );

  const renderSettings = () => (
    <div className="android-settings-view">
      <section className="android-settings-section">
        <h2>播放</h2>
        <label className="android-setting-row"><span><Volume2 aria-hidden="true" />音量</span><input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="音量" /></label>
        <label className="android-setting-row"><span><AudioLines aria-hidden="true" />音质</span><select value={playbackQuality} onChange={(event) => setPlaybackQuality(event.target.value)}><option value="standard">标准</option><option value="higher">较高</option><option value="exhigh">高品质</option><option value="lossless">无损</option><option value="hires">Hi-Res</option></select></label>
        <p className="android-settings-note">收藏、歌单、播放队列和最近播放保存在本机。</p>
      </section>
      <section className="android-settings-section">
        <h2>音源服务</h2>
        <form onSubmit={(event) => {
          event.preventDefault();
          try { setMetingInput(saveMobileMetingUrl(metingInput)); setSettingsMessage('音源服务已保存，榜单会重新加载。'); setFeaturedRetry((value) => value + 1); }
          catch (error) { setSettingsMessage(error instanceof Error ? error.message : '无法保存设置'); }
        }}>
          <label className="android-settings-note" htmlFor="mobile-meting-url">Meting 服务地址（HTTPS）</label>
          <div className="android-create-playlist"><input id="mobile-meting-url" type="url" value={metingInput} onChange={(event) => setMetingInput(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /><button type="submit">保存</button></div>
        </form>
        <p className="android-settings-note">用于网易云播放解析、热榜与歌词。可填写自己的服务地址；搜索仍直接连接音乐平台。</p>
        {settingsMessage && <p className="android-settings-note" role="status">{settingsMessage}</p>}
      </section>
      <MobileUpdateSettings />
      <section className="android-settings-section">
        <h2>关于与交流</h2>
        <button type="button" className="android-setting-row" onClick={() => void openExternalUrl(QQ_GROUP_URL)}>
          <span><MessagesSquare aria-hidden="true" />QQ 交流群</span>
          <span>冷漠网络科技交流群①</span>
        </button>
        <button type="button" className="android-setting-row" onClick={() => void openExternalUrl('https://github.com/yuchen0x1/JukeboxRoom/releases')}>
          <span><ExternalLink aria-hidden="true" />GitHub 发布页</span>
          <span>获取最新版本</span>
        </button>
        <p className="android-settings-note">点歌、播放或账号问题欢迎进群反馈。</p>
      </section>
    </div>
  );

  return (
    <div className="android-music-app">
      <AndroidNativeAudioEngine />
      <header className="android-app-header">
        <div className="android-brand-mark"><Disc3 aria-hidden="true" /></div>
        <div className="android-brand-title"><strong>JukeboxRoom</strong><span>{tabTitle[tab]}</span></div>
        <button type="button" className="android-icon-button" onClick={() => setTab('settings')} aria-label="设置"><Settings aria-hidden="true" /></button>
      </header>

      <main className="android-main-scroll">
        {tab === 'discover' && (
          <div className="android-page android-discover-page">
            <section className="android-discover-intro">
              <div className="android-intro-orbit"><Disc3 aria-hidden="true" /></div>
              <div><h1>把喜欢的歌，<br />留给此刻。</h1><p>搜索、播放，按自己的节奏听。</p></div>
            </section>
            <form className="android-search-box" onSubmit={runSearch}>
              <Search aria-hidden="true" />
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="歌曲、歌手" aria-label="搜索歌曲或歌手" />
              <button type="submit" aria-label="搜索"><ChevronLeft className="android-search-arrow" aria-hidden="true" /></button>
            </form>
            <section className="android-music-section">
              <div className="android-section-heading"><div><h2>网易云热榜</h2><p>来自网易云公开榜单</p></div><span className="android-section-live"><i />在线榜单</span></div>
              {featuredLoading ? <div className="android-loading"><LoaderCircle className="is-spinning" />正在载入榜单</div> : featuredSongs.length ? renderSongList(featuredSongs, '', '') : (
                <EmptyState icon={featuredError ? WifiOff : Music2} title={featuredError ? '榜单暂不可用' : '暂无榜单内容'} detail={featuredError || '当前没有返回歌曲。'} action={featuredError ? <button type="button" className="android-secondary-button" onClick={() => setFeaturedRetry((value) => value + 1)}>重新加载</button> : undefined} />
              )}
            </section>
          </div>
        )}

        {tab === 'search' && (
          <div className="android-page">
            <form className="android-search-box android-search-box--page" onSubmit={runSearch}>
              <Search aria-hidden="true" />
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索歌曲、歌手或专辑" aria-label="搜索歌曲、歌手或专辑" />
              {searchInput && <button type="button" className="android-clear-search" onClick={() => { searchSequence.current += 1; submittedQuery.current = ''; setSearching(false); setSearchInput(''); setResults([]); setSearchError(''); setSearchWarnings([]); setHasMore(false); setSearchPage(0); }} aria-label="清除搜索"><X aria-hidden="true" /></button>}
              <button type="submit" className="android-submit-search" aria-label="开始搜索"><Search aria-hidden="true" /></button>
            </form>
            <div className="android-source-filter" role="group" aria-label="搜索音源">
              {SOURCE_FILTERS.map((filter) => <button type="button" key={filter.id} aria-pressed={sourceFilter === filter.id} className={sourceFilter === filter.id ? 'is-active' : ''} onClick={() => { setSourceFilter(filter.id); if (submittedQuery.current) void executeSearch(submittedQuery.current, filter.id); }}>{filter.label}</button>)}
            </div>
            <section className="android-music-section android-search-results">
              <div className="android-section-heading"><div><h2>{results.length ? '搜索结果' : '搜索音乐'}</h2><p>{searching ? '正在查询所选音源' : results.length ? `${results.length} 首歌曲` : '跨音源查找歌曲'}</p></div>{searching && <LoaderCircle className="is-spinning android-inline-loader" />}</div>
              {searchWarnings.map((warning) => <p key={warning} className="android-settings-note" role="status">{warning}</p>)}
              {searching && !results.length ? <div className="android-loading"><LoaderCircle className="is-spinning" />正在搜索音乐</div> : results.length ? renderSongList(results, '', '') : searchError ? <EmptyState icon={WifiOff} title="没有可显示的结果" detail={searchError} /> : <EmptyState icon={Search} title="搜一首想听的歌" detail="支持按歌曲名、歌手名或专辑名搜索。" />}
              {results.length > 0 && searchError && <p className="android-playback-error" role="alert">{searchError}</p>}
              {hasMore && <button type="button" className="android-primary-button" disabled={searching} onClick={() => void executeSearch(submittedQuery.current, sourceFilter, searchPage + 1)}>{searching ? '正在加载…' : '加载更多歌曲'}</button>}
            </section>
          </div>
        )}

        {tab === 'favorites' && <div className="android-page"><section className="android-music-section"><div className="android-section-heading"><div><h2>我的收藏</h2><p>{favorites.length} 首已收藏</p></div></div>{renderSongList(favorites, '还没有收藏歌曲', '播放时点按爱心，歌曲就会保存在这里。')}</section></div>}

        {tab === 'history' && <div className="android-page"><section className="android-music-section"><div className="android-section-heading"><div><h2>最近播放</h2><p>这台设备上的播放记录</p></div></div>{renderSongList(history, '最近还没有播放记录', '开始播放后，歌曲会出现在这里。')}</section></div>}

        {tab === 'playlists' && (
          <div className="android-page">
            <section className="android-music-section">
              <div className="android-section-heading"><div><h2>{activePlaylist?.name || '我的歌单'}</h2><p>{activePlaylist ? `${activePlaylist.tracks.length} 首歌曲` : '创建只属于自己的音乐清单'}</p></div>{activePlaylist && <button type="button" className="android-text-button" onClick={() => setActivePlaylistId(null)}><ChevronDown aria-hidden="true" />全部歌单</button>}</div>
              {activePlaylist ? (
                <>
                  {activePlaylist.tracks.length > 0 && <button type="button" className="android-play-all-button" onClick={() => playPlaylist(activePlaylist.tracks)}><Play fill="currentColor" aria-hidden="true" />播放全部</button>}
                  {renderSongList(activePlaylist.tracks, '这个歌单还是空的', '从搜索结果的歌曲菜单添加音乐。')}
                </>
              ) : (
                <>
                  <form className="android-create-playlist" onSubmit={(event) => { event.preventDefault(); createNewPlaylist(); }}><input value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} placeholder="新歌单名称" aria-label="新歌单名称" maxLength={40} /><button type="submit" disabled={!playlistName.trim()} aria-label="创建歌单"><Plus aria-hidden="true" /></button></form>
                  {playlists.length ? <div className="android-playlist-list">{playlists.map((playlist) => <div className="android-playlist-row" key={playlist.id}><button type="button" onClick={() => setActivePlaylistId(playlist.id)}><span><ListMusic aria-hidden="true" /></span><span><strong>{playlist.name}</strong><small>{playlist.tracks.length} 首歌曲</small></span></button><button type="button" className="android-icon-button" onClick={() => deletePlaylist(playlist.id)} aria-label={`删除歌单 ${playlist.name}`}><Trash2 aria-hidden="true" /></button></div>)}</div> : <EmptyState icon={ListMusic} title="创建第一个歌单" detail="按心情收集喜欢的音乐。" />}
                </>
              )}
            </section>
          </div>
        )}

        {tab === 'settings' && <div className="android-page">{renderSettings()}</div>}
      </main>

      {current && (
        <section className="android-mini-player" aria-label="当前播放">
          <div className="android-mini-progress"><span style={{ width: `${duration > 0 ? Math.min(100, currentTime / duration * 100) : 0}%` }} /></div>
          <button type="button" className="android-mini-main" onClick={() => setPanel('player')}>
            <AndroidCover song={current} />
            <span className="android-song-copy"><strong>{current.name}</strong><small>{current.artist}</small></span>
          </button>
          <button type="button" className="android-mini-control" onClick={(event) => { event.stopPropagation(); togglePlayback(); }} aria-label={isPlaying ? '暂停' : '播放'}>
            {trackLoading && !isPlaying ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : isPlaying ? <Pause fill="currentColor" aria-hidden="true" /> : <Play fill="currentColor" aria-hidden="true" />}
          </button>
          <button type="button" className="android-mini-queue" onClick={() => setPanel('queue')} aria-label="打开播放队列"><ListMusic aria-hidden="true" /></button>
        </section>
      )}

      <nav className="android-bottom-nav" aria-label="音乐导航">
        {TAB_ITEMS.map(({ id, label, Icon }) => <button type="button" key={id} className={tab === id ? 'is-active' : ''} onClick={() => { setTab(id); setActivePlaylistId(null); }} aria-current={tab === id ? 'page' : undefined}><Icon aria-hidden="true" /><span>{label}</span></button>)}
      </nav>

      {panel && (
        <div className="android-player-sheet" role="dialog" aria-modal="true" aria-label={panel === 'player' ? '正在播放' : panel === 'lyrics' ? '歌词' : '播放队列'}>
          <header className="android-sheet-header">
            <button type="button" className="android-icon-button" onClick={() => setPanel(null)} aria-label="收起播放器"><ChevronDown aria-hidden="true" /></button>
            <div><strong>{panel === 'player' ? '正在播放' : panel === 'lyrics' ? '歌词' : '播放队列'}</strong><span>{panel === 'lyrics' || panel === 'queue' ? current?.name || 'JukeboxRoom' : '个人音乐空间'}</span></div>
            <button type="button" className="android-icon-button" onClick={() => setPanel(panel === 'queue' ? 'lyrics' : 'queue')} aria-label={panel === 'queue' ? '打开歌词' : '打开播放队列'}>{panel === 'queue' ? <AudioLines aria-hidden="true" /> : <ListMusic aria-hidden="true" />}</button>
          </header>

          {panel === 'player' && (
            <div className="android-full-player">
              {current ? (
                <>
                  <div className="android-now-playing-cover"><AndroidCover song={current} large /></div>
                  <div className="android-now-playing-info"><div><strong>{current.name}</strong><span>{current.artist}{current.album ? ` · ${current.album}` : ''}</span></div><button type="button" className={`android-icon-button${isFavorite(current) ? ' is-favorite' : ''}`} onClick={() => toggleFavorite(current)} aria-label={isFavorite(current) ? '取消收藏' : '收藏歌曲'}><Heart fill={isFavorite(current) ? 'currentColor' : 'none'} aria-hidden="true" /></button></div>
                  {playbackError && <div className="android-playback-error" role="alert"><p>{playbackError}</p><button type="button" onClick={retryCurrent}><RefreshCw aria-hidden="true" />重试</button><button type="button" onClick={() => playNextTrack()}><SkipForward aria-hidden="true" />下一首</button></div>}
                  <div className="android-progress-control"><input type="range" min="0" max={Math.max(duration, 0.1)} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={(event) => handleSeek(Number(event.target.value))} aria-label="播放进度" /><div><span>{formatTime(currentTime)}</span><span>{formatDuration(duration)}</span></div></div>
                  <div className="android-transport-controls">
                    <button type="button" className={shuffle ? 'is-active' : ''} onClick={toggleShuffle} aria-label={shuffle ? '关闭随机播放' : '开启随机播放'}><Shuffle aria-hidden="true" /></button>
                    <button type="button" onClick={() => { if (currentTime > 3) handleSeek(0); else playPreviousTrack(); }} aria-label="上一首"><SkipBack fill="currentColor" aria-hidden="true" /></button>
                    <button type="button" className="android-big-play" onClick={togglePlayback} aria-label={isPlaying ? '暂停' : '播放'}>{isPlaying ? <Pause fill="currentColor" aria-hidden="true" /> : <Play fill="currentColor" aria-hidden="true" />}</button>
                    <button type="button" onClick={() => playNextTrack()} aria-label="下一首"><SkipForward fill="currentColor" aria-hidden="true" /></button>
                    <button type="button" className={repeatMode !== 'off' ? 'is-active' : ''} onClick={handleRepeat} aria-label={repeatMode === 'one' ? '单曲循环' : repeatMode === 'all' ? '列表循环' : '顺序播放'}>{repeatMode === 'one' ? <Repeat1 aria-hidden="true" /> : <Repeat aria-hidden="true" />}</button>
                  </div>
                  <div className="android-player-shortcuts"><button type="button" onClick={() => setPanel('lyrics')}><AudioLines aria-hidden="true" />同步歌词</button><button type="button" onClick={() => setPanel('queue')}><ListMusic aria-hidden="true" />播放队列 <small>{queue.length}</small></button></div>
                  <label className="android-volume-row"><Volume2 aria-hidden="true" /><input type="range" min="0" max="1" step="0.01" value={useDesktopMusicStore.getState().volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="音量" /></label>
                </>
              ) : <EmptyState title="还没有正在播放的歌曲" detail="从发现或搜索页面选一首歌开始播放。" />}
            </div>
          )}

          {panel === 'lyrics' && (
            <div className="android-lyrics-view">
              {current ? <><div className="android-lyrics-meta"><AndroidCover song={current} /><span><strong>{current.name}</strong><small>{current.artist}</small></span></div><Lyrics lines={lyrics} currentTime={currentTime} onSeek={handleSeek} variant="side" scrollable /></> : <EmptyState icon={AudioLines} title="歌词会显示在这里" detail="开始播放歌曲后查看同步歌词。" />}
            </div>
          )}

          {panel === 'queue' && (
            <div className="android-queue-view">
              <div className="android-queue-heading"><div><strong>接下来播放</strong><small>{queue.length} 首待播</small></div><button type="button" className="android-text-button" onClick={clearQueue} disabled={!queue.length}><Trash2 aria-hidden="true" />清空</button></div>
              {current && <div className="android-queue-current"><span>正在播放</span><strong>{current.name}</strong><small>{current.artist}</small></div>}
              {queue.length ? queue.map((track, index) => <article className="android-song-row" key={track.trackKey}><button type="button" className="android-song-main" onClick={() => useDesktopMusicStore.getState().playQueueAt(index)}><AndroidCover song={track} /><span className="android-song-copy"><strong>{track.name}</strong><small>{track.artist}<i>{getSourceLabel(track.source)}</i></small></span></button><button type="button" className="android-icon-button" onClick={() => removeFromQueue(track.trackKey)} aria-label={`从队列移除 ${track.name}`}><X aria-hidden="true" /></button></article>) : <EmptyState icon={ListMusic} title="队列为空" detail="在歌曲旁点按加号，加入接下来播放的歌曲。" />}
            </div>
          )}
        </div>
      )}

      {playlistTarget && (
        <div className="android-dialog-scrim" role="presentation" onClick={() => setPlaylistTarget(null)}>
          <section className="android-playlist-dialog" role="dialog" aria-modal="true" aria-label="添加到歌单" onClick={(event) => event.stopPropagation()}>
            <header><div><strong>添加到歌单</strong><span>{playlistTarget.name}</span></div><button type="button" className="android-icon-button" onClick={() => setPlaylistTarget(null)} aria-label="关闭"><X aria-hidden="true" /></button></header>
            {playlists.length ? <div className="android-playlist-options">{playlists.map((playlist) => <button type="button" key={playlist.id} onClick={() => addToPlaylist(playlist.id)}><ListMusic aria-hidden="true" /><span>{playlist.name}</span><small>{playlist.tracks.length} 首</small></button>)}</div> : <EmptyState icon={ListMusic} title="还没有歌单" detail="创建一个歌单后再添加这首歌。" />}
            <button type="button" className="android-primary-button" onClick={() => { setPlaylistTarget(null); setTab('playlists'); setActivePlaylistId(null); }}><Plus aria-hidden="true" />创建歌单</button>
          </section>
        </div>
      )}
    </div>
  );
}
