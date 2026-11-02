import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Music, Users, Radio, ArrowRight, Lock, ListMusic,
  Loader2, RefreshCw, Plus, Hash, X, Disc3, Sparkles, History, ScrollText,
} from 'lucide-react';
import { createRoom, checkRoom, listRooms } from '../api/meting';
import { useRoomStore } from '../stores/roomStore';
import { useSocket } from '../hooks/useSocket';
import type { RoomSummary } from '../types';
import { createRandomNickname } from '../lib/randomNickname';
import { usePageSeo } from '../lib/seo';
import { partitionRoomsByRecent } from '../lib/recentRooms';
import { areRoomListsEqual } from '../lib/roomListCompare';
import Tooltip from '../components/Tooltip';
import VersionStatus from '../components/VersionStatus';
import BaseModal from '../components/Modal';
import ChangelogViewer from '../components/ChangelogViewer';

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

const repoLinkCls = 'flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white';

function PlayingBars() {
  return (
    <span className="inline-flex items-end gap-[3px] h-3.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-[var(--om-accent)] animate-pulse"
          style={{
            height: `${8 + (i % 2) * 6}px`,
            animationDelay: `${i * 0.15}s`,
            animationDuration: '0.8s',
          }}
        />
      ))}
    </span>
  );
}

const RoomCard = memo(function RoomCard({
  room,
  onJoin,
  isRecent,
}: {
  room: RoomSummary;
  onJoin: (room: RoomSummary) => void;
  isRecent?: boolean;
}) {
  const isActive = room.isPlaying && room.currentSong;

  return (
    <button
      type="button"
      onClick={() => onJoin(room)}
      className={`group relative w-full overflow-hidden rounded-2xl border bg-[var(--om-glass-panel)] p-4 text-left transition-[background,border-color,transform] duration-150 hover:-translate-y-px hover:bg-[var(--om-glass-elevated)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--om-accent-rgb),0.5)] sm:p-5 ${
        isActive
          ? 'border-[rgba(var(--om-accent-rgb),0.3)]'
          : 'border-[var(--om-glass-border)] hover:border-[var(--om-glass-border-strong)]'
      }`}
    >
      {isActive && <span className="absolute inset-y-4 left-0 w-0.5 rounded-r-full bg-[var(--om-accent)]" />}
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${isActive ? 'border-[rgba(var(--om-accent-rgb),0.2)] bg-[rgba(var(--om-accent-rgb),0.08)] text-[var(--om-accent)]' : 'border-white/[0.07] bg-white/[0.035] text-white/40'}`}>
          <Disc3 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {isRecent && <History className="h-3.5 w-3.5 flex-shrink-0 text-sky-300" aria-label="最近访问" />}
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white transition-colors group-hover:text-[var(--om-accent)]">
              {room.name}
            </h3>
            {(room.hasPassword || room.isLocked) && (
              <Tooltip content={room.hasPassword ? '需要密码' : '房间已上锁'}>
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-amber-400/[0.08] text-amber-300">
                  <Lock className="h-3.5 w-3.5" />
                </span>
              </Tooltip>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-white/40">
            <span className="font-mono">#{room.id}</span>
            <span className="h-1 w-1 rounded-full bg-white/25" />
            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{room.userCount} 人</span>
          </div>
        </div>
      </div>

      <div className="mt-4 min-h-[3.25rem] border-t border-white/[0.06] pt-3">
        {room.currentSong ? (
          <div className="flex min-w-0 items-center gap-2.5">
            {room.isPlaying ? <PlayingBars /> : <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-white/30" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-5 text-white/90">{room.currentSong.name}</p>
              <p className="mt-0.5 truncate text-xs text-white/45">{room.currentSong.artist}</p>
            </div>
            <span className={`flex-shrink-0 text-[11px] ${room.isPlaying ? 'text-[var(--om-accent)]' : 'text-white/40'}`}>
              {room.isPlaying ? '正在播放' : '已暂停'}
            </span>
          </div>
        ) : (
          <div className="flex h-11 items-center gap-2.5 text-sm text-white/40">
            <Radio className="h-4 w-4" />
            <span>等待点播</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-white/45"><ListMusic className="h-3.5 w-3.5" />队列 {room.queueLength} 首</span>
        <span className="flex items-center gap-1 font-medium text-[var(--om-accent)]">
          进入房间<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
});

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <BaseModal
      open
      onClose={onClose}
      ariaLabelledBy="home-dialog-title"
      containerClassName="fixed inset-0 flex items-center justify-center p-4"
      panelClassName="glass-surface glass-surface--modal relative w-full max-w-sm animate-fade-in rounded-2xl p-6"
    >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="home-dialog-title" className="text-lg font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="关闭"
            title="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
    </BaseModal>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const nickname = useRoomStore((s) => s.nickname);
  const setNickname = useRoomStore((s) => s.setNickname);
  const { leaveRoom } = useSocket();

  usePageSeo({
    title: '一起听歌 · 房间大厅',
    description: '创建或加入点歌房间，和好友一起听歌、多人实时同步播放；支持多音源搜索点歌与歌词跟唱。',
    path: '/',
  });

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [createRoomName, setCreateRoomName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [passwordTarget, setPasswordTarget] = useState<RoomSummary | null>(null);
  const [cardPassword, setCardPassword] = useState('');

  const fetchRooms = useCallback(async (silent = false) => {
    if (!silent) setRoomsLoading(true);
    try {
      const data = await listRooms();
      setRooms((prev) => (areRoomListsEqual(prev, data) ? prev : data));
      setError((prev) => (prev === '加载房间列表失败' ? '' : prev));
    } catch {
      if (!silent) setError('加载房间列表失败');
    } finally {
      if (!silent) setRoomsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (useRoomStore.getState().room) {
      leaveRoom();
    }
  }, [leaveRoom]);

  useEffect(() => {
    fetchRooms();
    const timer = setInterval(() => fetchRooms(true), 5000);
    return () => clearInterval(timer);
  }, [fetchRooms]);

  const ensureNickname = () => {
    const trimmed = nickname.trim();
    if (trimmed) return trimmed;
    const generated = createRandomNickname();
    setNickname(generated);
    return generated;
  };

  const goToRoom = (roomId: string, password?: string) => {
    navigate(`/room/${roomId}`, { state: password ? { password } : undefined });
  };

  const handleCreate = async () => {
    ensureNickname();
    setActionLoading(true);
    setError('');
    try {
      const room = await createRoom(createRoomName, createPassword);
      setShowCreate(false);
      setCreateRoomName('');
      setCreatePassword('');
      goToRoom(room.id, createPassword.trim() || undefined);
    } catch {
      setError('创建房间失败，请重试');
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinByCode = async () => {
    ensureNickname();
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError('请输入房间号');
      return;
    }
    setActionLoading(true);
    setError('');
    try {
      const result = await checkRoom(code);
      if (!result.exists) {
        setError('房间不存在，请检查房间号');
        return;
      }
      if (result.isLocked && !result.hasPassword) {
        setError('房间已上锁，禁止进入');
        return;
      }
      if (result.hasPassword && !joinPassword.trim()) {
        setError('该房间需要密码');
        return;
      }
      setShowJoin(false);
      goToRoom(code, joinPassword.trim() || undefined);
    } catch {
      setError('加入房间失败，请重试');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRoomCardClick = useCallback((room: RoomSummary) => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      const generated = createRandomNickname();
      setNickname(generated);
    }
    setError('');
    if (room.isLocked && !room.hasPassword) {
      setError('房间已上锁，禁止进入');
      return;
    }
    if (room.hasPassword) {
      setPasswordTarget(room);
      setCardPassword('');
    } else {
      navigate(`/room/${room.id}`);
    }
  }, [nickname, navigate, setNickname]);

  const handlePasswordJoin = () => {
    if (!passwordTarget) return;
    ensureNickname();
    if (!cardPassword.trim()) {
      setError('请输入房间密码');
      return;
    }
    const id = passwordTarget.id;
    setPasswordTarget(null);
    goToRoom(id, cardPassword.trim());
  };

  const { recent: recentRooms, others: otherRooms } = useMemo(
    () => partitionRoomsByRecent(rooms),
    [rooms],
  );

  const inputCls = 'glass-input w-full rounded-xl border px-4 py-2.5 text-sm';

  return (
    <div className="ambient-stage h-full flex flex-row relative overflow-hidden">
      <aside className="relative z-20 hidden w-[4.5rem] flex-shrink-0 flex-col border-r border-white/[0.07] bg-[#0d131a] px-2 py-5 md:flex xl:w-60 xl:px-4">
        <div className="mb-8 flex items-center justify-center gap-3 px-1 xl:justify-start xl:px-2">
          <img src="/icons/jukeboxroom-128.png" alt="" className="h-10 w-10 rounded-xl object-cover" width={40} height={40} />
          <div className="hidden min-w-0 xl:block"><p className="truncate text-sm font-semibold text-white">JukeboxRoom</p><p className="mt-0.5 text-[10px] text-white/35">一起听歌</p></div>
        </div>
        <p className="hidden px-3 pb-2 text-[10px] font-medium text-white/35 xl:block">音乐空间</p>
        <button type="button" title="音乐大厅" className="flex h-10 items-center justify-center gap-3 rounded-lg border border-[rgba(var(--om-accent-rgb),0.2)] bg-[rgba(var(--om-accent-rgb),0.08)] px-2 text-sm font-medium text-[var(--om-accent)] xl:justify-start xl:px-3" aria-current="page">
          <Radio className="h-4 w-4 flex-shrink-0" /><span className="hidden xl:inline">音乐大厅</span><span className="hidden rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-white/65 xl:ml-auto xl:inline">{rooms.length}</span>
        </button>
        <div className="mt-8 flex items-center justify-center px-1 pb-2 xl:justify-between xl:px-3">
          <p className="hidden text-[10px] font-medium text-white/35 xl:block">最近访问</p>
          <button type="button" onClick={() => { setError(''); setShowCreate(true); }} className="flex h-7 w-7 items-center justify-center rounded-md text-white/45 transition hover:bg-white/10 hover:text-white" aria-label="创建房间"><Plus className="h-4 w-4" /></button>
        </div>
        <div className="space-y-1">
          {recentRooms.slice(0, 5).map((room) => <button key={room.id} type="button" title={room.name} aria-label={`进入最近访问的房间 ${room.name}`} onClick={() => handleRoomCardClick(room)} className="flex h-9 w-full min-w-0 items-center justify-center gap-2.5 rounded-lg px-2 text-left text-xs text-white/55 transition hover:bg-white/[0.06] hover:text-white xl:justify-start xl:px-3"><span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${room.isPlaying ? 'bg-[var(--om-accent)]' : 'bg-white/25'}`} /><span className="hidden truncate xl:inline">{room.name}</span></button>)}
          {recentRooms.length === 0 && <p className="hidden px-3 py-2 text-xs text-white/30 xl:block">加入房间后会显示在这里</p>}
        </div>
        <div className="mt-auto border-t border-white/[0.07] pt-4">
          <label className="mb-2 hidden px-2 text-[10px] text-white/35 xl:block">当前用户</label>
          <input type="text" value={nickname} onChange={(e) => { setNickname(e.target.value); setError(''); }} placeholder="你的昵称" aria-label="你的昵称" maxLength={20} className="glass-input hidden w-full rounded-lg border px-3 py-2 text-sm xl:block" />
          <div className="flex h-9 items-center justify-center text-xs text-white/40 xl:hidden" title={nickname.trim() || '当前用户'}><Users className="h-4 w-4" aria-hidden /></div>
          <div className="mt-3 hidden items-center justify-between px-2 text-[11px] text-white/35 xl:flex"><span>多人实时同步</span><span>JukeboxRoom</span></div>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="relative z-20 flex-shrink-0 border-b border-white/[0.07] bg-[#101720] safe-top">
        <div className="flex min-h-14 w-full items-center gap-3 px-4 py-2 sm:px-6 xl:px-8">
          <div className="flex min-w-0 items-center gap-3 md:hidden">
            <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-[#080c11]">
              <img
                src="/icons/jukeboxroom-128.png"
                alt="JukeboxRoom 图标"
                className="h-full w-full object-cover"
                width={36}
                height={36}
              />
            </div>
            <span className="truncate text-sm font-semibold text-white">JukeboxRoom</span>
          </div>

          <div className="hidden min-w-0 flex-1 md:block">
            <p className="text-sm font-semibold text-white">音乐大厅</p>
            <p className="mt-0.5 text-[11px] text-white/40">和朋友一起听歌</p>
          </div>

          <div className="hidden min-w-0 md:block xl:hidden">
            <input type="text" value={nickname} onChange={(e) => { setNickname(e.target.value); setError(''); }} placeholder="你的昵称" aria-label="你的昵称" maxLength={20} className="glass-input w-32 rounded-lg border px-2.5 py-2 text-xs" />
          </div>

          <div className="ml-auto flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => { setError(''); setShowJoin(true); }}
              className="glass-button-secondary hidden h-9 items-center gap-1.5 rounded-lg px-3 text-sm sm:flex"
            >
              <Hash className="w-4 h-4" />
              加入房间
            </button>
            <button
              type="button"
              onClick={() => { setError(''); setShowJoin(true); }}
              className="glass-button-secondary flex h-9 w-9 items-center justify-center rounded-lg sm:hidden"
              aria-label="加入房间"
            >
              <Hash className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { setError(''); setShowCreate(true); }}
              className="glass-button-primary flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-[filter,box-shadow] hover:brightness-105"
            >
              <Plus className="w-4 h-4" />
              创建房间
            </button>

            <button
              type="button"
              onClick={() => setShowChangelog(true)}
              className="glass-button-secondary flex h-9 w-9 items-center justify-center rounded-lg sm:w-auto sm:gap-1.5 sm:px-3"
              title="更新日志"
              aria-haspopup="dialog"
            >
              <ScrollText className="w-4 h-4" />
              <span className="hidden text-sm sm:inline">更新日志</span>
            </button>
            <a
              href="https://github.com/yuchen0x1/JukeboxRoom"
              target="_blank"
              rel="noopener noreferrer"
              className={`${repoLinkCls} hidden sm:flex`}
              aria-label="GitHub 仓库"
              title="GitHub 仓库"
            >
              <GithubIcon className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      {/* 中间：房间列表 */}
      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="w-full px-5 py-4 sm:px-8 sm:py-6 xl:px-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-5 border-b border-white/[0.07] pb-4 xl:mb-7 xl:pb-6">
            <div className="flex min-w-0 items-center gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-[var(--om-accent)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--om-accent)]" />
                同步聆听
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                <span className="sr-only">JukeboxRoom 在线点歌 - </span>
                房间大厅
              </h1>
              <p className="mt-2 text-sm text-white/45">选择一个房间加入，或创建你自己的音乐空间</p>
            </div>
            <div className="flex h-14 min-w-32 flex-col justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] px-4">
              <span className="text-lg font-semibold leading-none text-white">{rooms.length}</span>
              <span className="mt-1 text-[11px] text-white/40">在线房间</span>
            </div>
            </div>
            <button
              type="button"
              onClick={() => fetchRooms()}
              disabled={roomsLoading}
              className="glass-button-secondary flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${roomsLoading ? 'animate-spin' : ''}`} />
              刷新房间
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-[rgba(248,113,113,0.24)] bg-[rgba(248,113,113,0.08)] px-4 py-3 text-center text-sm text-[var(--om-danger)]">
              {error}
            </div>
          )}

          {roomsLoading && rooms.length === 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),26rem))] gap-4" aria-label="正在加载房间" aria-busy="true">
              {[0, 1, 2, 3].map((item) => <div key={item} className="h-[10.75rem] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5"><div className="h-4 w-2/5 rounded bg-white/[0.08]" /><div className="mt-8 h-3 w-1/3 rounded bg-white/[0.06]" /><div className="mt-3 h-3 w-3/5 rounded bg-white/[0.06]" /><div className="mt-7 border-t border-white/[0.06] pt-3"><div className="h-3 w-1/4 rounded bg-white/[0.06]" /></div></div>)}
            </div>
          ) : rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-[clamp(1rem,5vh,4rem)]">
              <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-5">
                <Radio className="w-9 h-9 text-white/20" />
              </div>
              <p className="text-lg font-medium text-white/60 mb-2">还没有活跃房间</p>
              <p className="text-sm text-white/35 mb-6">成为第一个创建房间的人吧</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => { setError(''); setShowCreate(true); }} className="glass-button-primary flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-[filter] hover:brightness-105">
                  <Plus className="h-4 w-4" />创建房间
                </button>
                <button type="button" onClick={() => { setError(''); setShowJoin(true); }} className="glass-button-secondary flex h-10 items-center gap-2 rounded-lg px-4 text-sm">
                  <Hash className="h-4 w-4" />加入房间
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {recentRooms.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <History className="w-4 h-4 text-sky-400/80" />
                    <h2 className="text-sm font-medium text-white/70">最近访问</h2>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),32rem))] justify-center gap-4">
                    {recentRooms.map((room) => (
                      <RoomCard key={room.id} room={room} onJoin={handleRoomCardClick} isRecent />
                    ))}
                  </div>
                </section>
              )}
              {otherRooms.length > 0 && (
                <section>
                  {recentRooms.length > 0 && (
                    <h2 className="text-sm font-medium text-white/50 mb-4">全部房间</h2>
                  )}
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),32rem))] justify-center gap-4">
                    {otherRooms.map((room) => (
                      <RoomCard key={room.id} room={room} onJoin={handleRoomCardClick} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      {/* 底栏 */}
      <footer className="relative z-10 flex-shrink-0 border-t border-white/5 py-3 px-4">
        <div className="flex flex-col items-center gap-2.5">
          <div className="flex justify-center gap-6 sm:gap-10 text-white/25 text-xs">
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              多人实时同步
            </span>
            <span className="flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5" />
              四平台曲库
            </span>
          </div>
          <VersionStatus />
          {/* <p className="flex flex-wrap items-center justify-center gap-1 text-xs text-white/35">
            本网站由
            <a
              href="https://www.upyun.com/?utm_source=lianmeng&utm_medium=referral"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex opacity-80 hover:opacity-100 transition-opacity"
              aria-label="又拍云"
            >
              <img src="/又拍云_logo5.png" alt="又拍云" className="h-6 w-auto" />
            </a>
            提供 CDN 加速 / 云存储服务
          </p> */}
        </div>
      </footer>
      </div>

      <BaseModal
        open={showChangelog}
        onClose={() => setShowChangelog(false)}
        ariaLabelledBy="changelog-title"
        containerClassName="fixed inset-0 flex items-center justify-center p-3 sm:p-6"
        panelClassName="glass-surface glass-surface--modal relative w-full max-w-2xl h-[min(82vh,48rem)] overflow-hidden rounded-2xl animate-fade-in"
      >
        <ChangelogViewer onClose={() => setShowChangelog(false)} />
      </BaseModal>

      {showCreate && (
        <Modal title="创建房间" onClose={() => { setShowCreate(false); setCreateRoomName(''); setCreatePassword(''); }}>
          <p className="text-sm text-white/45 mb-4">先给你的房间起个名字，方便大家在大厅里找到</p>
          <label className="block text-xs text-white/50 mb-1.5">房间名称</label>
          <input
            type="text"
            value={createRoomName}
            onChange={(e) => setCreateRoomName(e.target.value)}
            placeholder="例如：周杰伦专场"
            maxLength={30}
            className={`${inputCls} mb-4`}
          />
          <label className="block text-xs text-white/50 mb-1.5">房间密码（可选）</label>
          <input
            type="password"
            value={createPassword}
            onChange={(e) => setCreatePassword(e.target.value)}
            placeholder="留空则无需密码"
            maxLength={32}
            className={`${inputCls} mb-5`}
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={actionLoading}
            className="glass-button-primary glass-interactive w-full flex items-center justify-center gap-2 disabled:opacity-50 font-medium py-3 rounded-xl"
          >
            {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            创建并进入
          </button>
        </Modal>
      )}

      {showJoin && (
        <Modal title="加入房间" onClose={() => { setShowJoin(false); setJoinCode(''); setJoinPassword(''); }}>
          <label className="block text-xs text-white/50 mb-1.5">房间号</label>
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="6 位房间号"
            maxLength={6}
            className={`${inputCls} uppercase tracking-widest mb-4`}
          />
          <label className="block text-xs text-white/50 mb-1.5">密码（如有）</label>
          <input
            type="password"
            value={joinPassword}
            onChange={(e) => setJoinPassword(e.target.value)}
            placeholder="无密码可留空"
            maxLength={32}
            className={`${inputCls} mb-5`}
          />
          <button
            type="button"
            onClick={handleJoinByCode}
            disabled={actionLoading}
            className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white font-medium py-3 rounded-xl border border-white/10 transition-colors"
          >
            {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
            加入房间
          </button>
        </Modal>
      )}

      {passwordTarget && (
        <Modal
          title={`进入 ${passwordTarget.name}`}
          onClose={() => { setPasswordTarget(null); setCardPassword(''); }}
        >
          <div className="flex items-center gap-2 text-amber-400/90 text-sm mb-4">
            <Lock className="w-4 h-4" />
            该房间已设置密码
          </div>
          <input
            type="password"
            value={cardPassword}
            onChange={(e) => setCardPassword(e.target.value)}
            placeholder="输入房间密码"
            maxLength={32}
            className={`${inputCls} mb-5`}
            onKeyDown={(e) => e.key === 'Enter' && handlePasswordJoin()}
            autoFocus
          />
          <button
            type="button"
            onClick={handlePasswordJoin}
            className="glass-button-primary glass-interactive w-full flex items-center justify-center gap-2 font-medium py-3 rounded-xl"
          >
            <ArrowRight className="w-5 h-5" />
            确认进入
          </button>
        </Modal>
      )}
    </div>
  );
}
