import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Music, Search } from 'lucide-react';
import { useRoomStore } from '../stores/roomStore';
import { useSocket } from '../hooks/useSocket';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import QueueRow, { QUEUE_ITEM_SIZE, QUEUE_ROW_GAP, QUEUE_ROW_HEIGHT } from './queue/QueueRow';
import type { RoomMemberTier } from '../types';
import { resolveDislikeSkipThreshold } from '../lib/dislikeSkip';
import { getClientId } from '../lib/clientId';
import { filterQueueSongs, selectableQueueIds, type QueueViewSong } from '../lib/queueView';

const VISIBLE_ROWS = 3;
const LIST_HEIGHT = VISIBLE_ROWS * QUEUE_ROW_HEIGHT + (VISIBLE_ROWS - 1) * QUEUE_ROW_GAP;
const VIRTUAL_THRESHOLD = 8;

type QueueRowSong = QueueViewSong;

type RowData = {
  songs: QueueRowSong[];
  memberTiers: Record<string, RoomMemberTier> | undefined;
  mySocketId: string | null;
  nickname: string;
  canControlPlayback: boolean;
  memberJumpEnabled: boolean;
  dislikeSkipThreshold: number;
  currentRef: React.RefObject<HTMLDivElement | null>;
  onLike: (queueId: string) => void;
  onDislike: () => void;
  onJump: (queueId: string) => void;
  onRemove: (queueId: string) => void;
  onBan: (song: QueueRowSong) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  busy: boolean;
  onSelect: (queueId: string) => void;
};

function VirtualQueueRow({ index, style, data }: ListChildComponentProps<RowData>) {
  const song = data.songs[index];
  if (!song) return null;
  const memberTier = song.requestedById ? data.memberTiers?.[song.requestedById] : undefined;
  return (
    <div style={{ ...style, height: QUEUE_ITEM_SIZE, paddingBottom: QUEUE_ROW_GAP }}>
      <QueueRow
        song={song}
        index={song.position}
        memberTier={memberTier}
        mySocketId={data.mySocketId}
        nickname={data.nickname}
        canControlPlayback={data.canControlPlayback}
        memberJumpEnabled={data.memberJumpEnabled}
        dislikeSkipThreshold={data.dislikeSkipThreshold}
        rowRef={song.isCurrent ? data.currentRef : undefined}
        onLike={data.onLike}
        onDislike={song.isCurrent ? data.onDislike : undefined}
        onJump={data.onJump}
        onRemove={data.onRemove}
        onBan={data.onBan}
        selectionMode={data.selectionMode}
        selected={data.selectedIds.has(song.queueId)}
        selectionDisabled={data.busy}
        onSelect={data.onSelect}
      />
    </div>
  );
}

interface Props {
  fillHeight?: boolean;
}

export default function QueuePanel({ fillHeight = false }: Props) {
  const queue = useRoomStore((s) => s.room?.queue);
  const currentSong = useRoomStore((s) => s.room?.current);
  const memberTiers = useRoomStore((s) => s.room?.memberTiers);
  const hasRoom = useRoomStore((s) => Boolean(s.room));
  const roomId = useRoomStore((s) => s.room?.id);
  const nickname = useRoomStore((s) => s.nickname);
  const mySocketId = useRoomStore((s) => s.mySocketId);
  const canControlPlayback = useRoomStore((s) => s.canControlPlayback);
  const memberJumpEnabled = useRoomStore((s) => Boolean(s.room?.memberJumpEnabled));
  const dislikeSkipThreshold = useRoomStore((s) => resolveDislikeSkipThreshold(s.room));
  const { removeSongs, requestJump, toggleQueueLike, toggleCurrentDislike, banRoomSong } = useSocket();
  const [jumpMsg, setJumpMsg] = useState('');
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const mutationInFlight = useRef(false);
  const myUserId = mySocketId || getClientId();
  const currentRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<FixedSizeList>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [virtualListHeight, setVirtualListHeight] = useState(LIST_HEIGHT);

  const allSongs = useMemo<QueueRowSong[]>(() => {
    return [
      ...(currentSong ? [{ ...currentSong, isCurrent: true, position: 0 }] : []),
      ...(queue || []).map((s, index) => ({ ...s, isCurrent: false, position: index + 1 })),
    ];
  }, [queue, currentSong]);

  const visibleSongs = useMemo(() => filterQueueSongs(allSongs, query, onlyMine, myUserId, nickname),
    [allSongs, query, onlyMine, myUserId, nickname]);
  const selectableIds = useMemo(() => selectableQueueIds(visibleSongs, canControlPlayback, myUserId, nickname),
    [visibleSongs, canControlPlayback, myUserId, nickname]);

  useEffect(() => {
    const allowed = new Set(selectableIds);
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => allowed.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectableIds]);

  useEffect(() => {
    setQuery('');
    setOnlyMine(false);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setConfirmIds(null);
    setJumpMsg('');
  }, [roomId]);

  useEffect(() => () => { if (messageTimer.current) clearTimeout(messageTimer.current); }, []);

  const currentKey = currentSong?.queueId || '';
  const useVirtualList = visibleSongs.length >= VIRTUAL_THRESHOLD;
  const prevCurrentKeyRef = useRef(currentKey);

  useEffect(() => {
    if (!fillHeight || !useVirtualList) return;
    const container = listContainerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect.height ?? 0);
      if (next > 0) setVirtualListHeight(next);
    });
    ro.observe(container);
    setVirtualListHeight(Math.floor(container.clientHeight));
    return () => ro.disconnect();
  }, [fillHeight, useVirtualList]);

  // 仅在「当前曲目切换」时跟滚；点赞/插队等队列重排不要拽回顶部
  useEffect(() => {
    const switched = prevCurrentKeyRef.current !== currentKey;
    prevCurrentKeyRef.current = currentKey;
    if (!switched || !currentKey) return;

    if (useVirtualList) {
      const idx = visibleSongs.findIndex((song) => song.isCurrent);
      if (idx >= 0) listRef.current?.scrollToItem(idx, 'smart');
      return;
    }
    currentRef.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [currentKey, visibleSongs, useVirtualList]);

  useEffect(() => { listRef.current?.scrollTo(0); }, [query, onlyMine]);

  const showQueueMessage = useCallback((message: string) => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setJumpMsg(message);
    messageTimer.current = setTimeout(() => setJumpMsg(''), 5000);
  }, []);

  const handleSelect = useCallback((queueId: string) => {
    setConfirmIds(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(queueId)) next.delete(queueId); else next.add(queueId);
      return next;
    });
  }, []);

  const handleRemove = useCallback(async (ids: string[]) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    try {
      const res = await removeSongs(ids);
      if (!res.success) {
        showQueueMessage(res.error || '移除失败，请刷新队列后重试');
        return;
      }
      setSelectedIds(new Set());
      showQueueMessage(`已移除 ${res.removed ?? ids.length} 首待播歌曲`);
    } catch {
      showQueueMessage('移除失败，请检查连接后重试');
    } finally {
      setBusy(false);
      mutationInFlight.current = false;
      setConfirmIds(null);
    }
  }, [removeSongs, showQueueMessage]);

  const handleRemoveOne = useCallback((queueId: string) => { void handleRemove([queueId]); }, [handleRemove]);

  const handleJumpRequest = useCallback(async (queueId: string) => {
    setJumpMsg('');
    const res = await requestJump(queueId);
    if (res.success) {
      showQueueMessage(canControlPlayback ? '已插队到下一首，优先于点赞排序' : '已插队到下一首');
    } else {
      showQueueMessage(res.error || '插队失败');
    }
  }, [canControlPlayback, requestJump, showQueueMessage]);

  const handleLike = useCallback(async (queueId: string) => {
    const res = await toggleQueueLike(queueId);
    if (!res.success && res.error) showQueueMessage(res.error);
  }, [showQueueMessage, toggleQueueLike]);

  const handleDislike = useCallback(async () => {
    const res = await toggleCurrentDislike();
    if (!res.success) {
      showQueueMessage(res.error || '踩歌失败');
      return;
    }
    if (res.skipped) {
      showQueueMessage('踩歌人数已满，已切歌');
      return;
    }
    const count = res.dislikeCount ?? 0;
    const threshold = res.threshold ?? dislikeSkipThreshold;
    showQueueMessage(res.disliked ? `已踩 ${count}/${threshold}` : `已取消踩 ${count}/${threshold}`);
  }, [dislikeSkipThreshold, showQueueMessage, toggleCurrentDislike]);

  const handleBanSong = useCallback(async (song: QueueRowSong) => {
    setJumpMsg('');
    const res = await banRoomSong({
      id: song.id,
      source: song.source || 'netease',
      name: song.name,
      artist: song.artist,
      album: song.album,
      pic: song.pic,
      duration: song.duration,
      url: song.url,
      lrc: song.lrc,
    });
    if (res.success) {
      showQueueMessage('已禁播并移出队列');
    } else {
      showQueueMessage(res.error || '禁播失败');
    }
  }, [banRoomSong, showQueueMessage]);

  const rowData = useMemo<RowData>(() => ({
    songs: visibleSongs,
    memberTiers,
    mySocketId,
    nickname,
    canControlPlayback,
    memberJumpEnabled,
    dislikeSkipThreshold,
    currentRef,
    onLike: handleLike,
    onDislike: handleDislike,
    onJump: handleJumpRequest,
    onRemove: handleRemoveOne,
    onBan: handleBanSong,
    selectionMode,
    selectedIds,
    busy,
    onSelect: handleSelect,
  }), [
    visibleSongs,
    memberTiers,
    mySocketId,
    nickname,
    canControlPlayback,
    memberJumpEnabled,
    dislikeSkipThreshold,
    handleLike,
    handleDislike,
    handleJumpRequest,
    handleRemoveOne,
    handleBanSong,
    selectionMode,
    selectedIds,
    busy,
    handleSelect,
  ]);

  if (!hasRoom) return null;

  const renderPlainRows = () => visibleSongs.map((song) => (
    <QueueRow
      key={song.queueId || `current-${song.id}`}
      song={song}
      index={song.position}
      memberTier={song.requestedById ? memberTiers?.[song.requestedById] : undefined}
      mySocketId={mySocketId}
      nickname={nickname}
      canControlPlayback={canControlPlayback}
      memberJumpEnabled={memberJumpEnabled}
      dislikeSkipThreshold={dislikeSkipThreshold}
      rowRef={song.isCurrent ? currentRef : undefined}
      onLike={handleLike}
      onDislike={song.isCurrent ? handleDislike : undefined}
      onJump={handleJumpRequest}
      onRemove={handleRemoveOne}
      onBan={handleBanSong}
      selectionMode={selectionMode}
      selected={selectedIds.has(song.queueId)}
      selectionDisabled={busy}
      onSelect={handleSelect}
    />
  ));

  return (
    <div className={`flex flex-col ${fillHeight ? 'h-full min-h-0' : ''}`} aria-label="播放队列管理" aria-busy={busy}>
      <div className="mb-2 flex shrink-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-[var(--om-glass-border)] bg-[var(--om-glass-base)] px-2 py-1.5 focus-within:border-[var(--om-accent)]">
            <Search className="h-3.5 w-3.5 shrink-0 text-netease-muted" aria-hidden="true" />
            <input type="search" value={query} disabled={busy} maxLength={120} onChange={(e) => { setQuery(e.target.value); setConfirmIds(null); }}
              placeholder="搜索歌名、歌手、点歌人" aria-label="搜索播放队列"
              className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-netease-muted" />
          </label>
          <button type="button" aria-pressed={onlyMine} disabled={busy} onClick={() => { setOnlyMine(!onlyMine); setConfirmIds(null); }}
            className={`shrink-0 rounded-lg px-2 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--om-accent)] ${onlyMine ? 'bg-[rgba(var(--om-accent-rgb),0.16)] text-[var(--om-accent)]' : 'text-netease-muted hover:bg-white/10'}`}>我的点歌</button>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-xs text-netease-muted">
          <span>{query.trim() || onlyMine ? `${visibleSongs.length} / ${allSongs.length} 首` : `${queue?.length ?? 0} 首待播`}</span>
          {(query || onlyMine) && <button type="button" disabled={busy} onClick={() => { setQuery(''); setOnlyMine(false); setConfirmIds(null); }} className="hover:text-white focus-visible:underline">重置筛选</button>}
          <button type="button" disabled={busy || (!selectionMode && selectableIds.length === 0)} onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()); setConfirmIds(null); }}
            className="ml-auto text-[var(--om-accent)] disabled:opacity-40 focus-visible:underline">{selectionMode ? '退出多选' : '批量管理'}</button>
        </div>
        {selectionMode && <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white/5 px-2 py-1.5 text-xs">
          <button type="button" disabled={busy || selectableIds.length === 0} onClick={() => { setSelectedIds(new Set(selectedIds.size === selectableIds.length ? [] : selectableIds)); setConfirmIds(null); }}
            className="text-netease-muted hover:text-white disabled:opacity-40 focus-visible:underline">{selectedIds.size === selectableIds.length && selectableIds.length > 0 ? '取消全选' : '全选可移除歌曲'}</button>
          <span className="text-netease-muted">已选 {selectedIds.size} 首</span>
          <button type="button" disabled={busy || selectedIds.size === 0} onClick={() => setConfirmIds([...selectedIds])}
            className="ml-auto text-rose-300 disabled:opacity-40 focus-visible:underline">{busy ? '移除中…' : '移除所选'}</button>
        </div>}
        {confirmIds && <div className="rounded-lg border border-rose-300/25 bg-rose-300/5 p-2 text-xs text-white/80">
          <p>移除这 {confirmIds.length} 首待播歌曲？当前播放不会中断。</p>
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" disabled={busy} onClick={() => setConfirmIds(null)} className="p-1 focus-visible:underline">取消</button>
            <button type="button" disabled={busy} onClick={() => { void handleRemove(confirmIds); }} className="rounded-md bg-rose-400/20 px-2 py-1 text-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-300">{busy ? '移除中…' : '确认移除'}</button>
          </div>
        </div>}
      </div>
      {jumpMsg && (
        <p role="status" className="text-xs text-amber-400/80 mb-1.5 px-1 flex-shrink-0">{jumpMsg}</p>
      )}

      {visibleSongs.length === 0 ? (
        <div className={`flex flex-col items-center justify-center text-netease-muted ${fillHeight ? 'flex-1 min-h-0' : ''}`} style={fillHeight ? undefined : { height: LIST_HEIGHT }}>
          <Music className="mb-2 h-7 w-7 opacity-30" />
          <p className="text-center text-xs">{allSongs.length === 0 ? '队列为空，搜索或双击点歌' : '没有匹配的歌曲，试试其他关键词或重置筛选'}</p>
        </div>
      ) : useVirtualList ? (
        <div
          ref={listContainerRef}
          className={`pr-0.5 ${fillHeight ? 'flex-1 min-h-0' : ''}`}
          style={fillHeight ? undefined : { height: LIST_HEIGHT }}
        >
          <FixedSizeList
            ref={listRef}
            height={fillHeight ? virtualListHeight : LIST_HEIGHT}
            width="100%"
            itemCount={visibleSongs.length}
            itemSize={QUEUE_ITEM_SIZE}
            itemData={rowData}
            itemKey={(index, data) => data.songs[index]?.queueId ?? index}
            overscanCount={4}
          >
            {VirtualQueueRow}
          </FixedSizeList>
        </div>
      ) : (
        <div
           className={`glass-scrollbar space-y-1.5 overflow-y-auto pr-0.5 ${fillHeight ? 'flex-1 min-h-0' : ''}`}
          style={fillHeight ? undefined : { height: LIST_HEIGHT }}
        >
          {renderPlainRows()}
        </div>
      )}
    </div>
  );
}
