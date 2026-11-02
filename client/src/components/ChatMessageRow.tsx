import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { Music2, Reply, Smile } from 'lucide-react';
import type { ChatMessage, ChatReplyRef, RoomMemberTier, RoomUser } from '../types';
import QFaceImage from './QFaceImage';
import SongCover from './SongCover';
import Tooltip from './Tooltip';
import MemberTierBadge from './MemberTierBadge';
import RoleBadge from './RoleBadge';
import { ChatMessageReactions } from './ChatMessageReactions';
import {
  CHAT_PHOTO_CLASS,
  CHAT_STICKER_CLASS,
  formatChatTime,
  isChatStickerMessage,
  tokenizeMentionSegments,
} from '../lib/chatPanelUtils';
import { parseQQFaceTokens, QFaceLoadPriority } from '../lib/qface';

export type ChatRoomMeta = {
  id: string;
  creatorId: string;
  adminIds: string[];
  users: RoomUser[];
  memberTiers?: Record<string, RoomMemberTier>;
  muteAll?: boolean;
};

const AVATAR_TONES = [
  'bg-[#173b3c] text-[#a9ece0]',
  'bg-[#20334b] text-[#b8d3f7]',
  'bg-[#3a2d46] text-[#ddc5ee]',
  'bg-[#3b3829] text-[#ead99c]',
];

function avatarClassFor(userId: string) {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

function renderMessageText(
  messageText: string,
  variant: 'message' | 'reply',
  chatScrollRoot: HTMLDivElement | null,
  nicknames: string[],
) {
  const isReply = variant === 'reply';
  const faceClass = isReply
    ? 'mx-0.5 inline-block h-4 w-auto max-w-5 object-contain align-middle'
    : 'mx-0.5 inline-block h-7 w-auto max-w-8 object-contain align-middle';
  const facePlaceholderClass = isReply
    ? 'mx-0.5 inline-block h-4 w-4 align-middle'
    : 'mx-0.5 inline-block h-7 w-6 align-middle';
  const keyPrefix = isReply ? 'reply' : 'msg';

    return parseQQFaceTokens(messageText).map((part, index) => {
      if (typeof part === 'string') {
        return tokenizeMentionSegments(part, nicknames).map((segment, segIndex) => (
          segment.type === 'mention'
            ? <span key={`${keyPrefix}-mention-${index}-${segIndex}`} className="break-words text-sky-300 [overflow-wrap:anywhere]">{segment.value}</span>
            : <span key={`${keyPrefix}-text-${index}-${segIndex}`} className="break-words [overflow-wrap:anywhere]">{segment.value}</span>
        ));
      }
    return (
      <QFaceImage
        key={`${keyPrefix}-face-${part.id}-${index}`}
        id={part.id}
        priority={QFaceLoadPriority.MESSAGE}
        nearPriority={QFaceLoadPriority.NEAR}
        observeRoot={chatScrollRoot}
        className={faceClass}
        placeholderClassName={facePlaceholderClass}
      />
    );
  });
}

function renderReplyRefContent(
  reply: ChatReplyRef,
  chatScrollRoot: HTMLDivElement | null,
  nicknames: string[],
  alignEnd = false,
) {
  const hasText = reply.text.trim().length > 0;
  const isSticker = isChatStickerMessage(reply.imageUrl, reply.imageKey, reply.asSticker);
  const isPhoto = Boolean(reply.imageUrl && !isSticker);

  return (
    <span className={`inline-flex min-w-0 max-w-full flex-wrap items-center gap-1 ${alignEnd ? 'justify-end' : ''}`}>
      {hasText && renderMessageText(reply.text, 'reply', chatScrollRoot, nicknames)}
      {isSticker && reply.imageUrl && (
        <img
          src={reply.imageUrl}
          alt="表情包"
          loading="lazy"
          className="max-h-8 max-w-[3.5rem] shrink-0 rounded object-contain"
        />
      )}
      {isSticker && !reply.imageUrl && !hasText && <span>[表情包]</span>}
      {isPhoto && !hasText && <span>[图片]</span>}
    </span>
  );
}

export interface ChatMessageRowProps {
  msg: ChatMessage;
  repeatCount?: number;
  room: ChatRoomMeta;
  myUserId: string;
  pureMode: boolean;
  pureImageRevealed: boolean;
  reactionPickerOpen: boolean;
  chatMuted: boolean;
  chatScrollRoot: HTMLDivElement | null;
  chatPanelRef: React.RefObject<HTMLDivElement | null>;
  onReply: (msg: ChatMessage) => void;
  onMentionUser: (user: RoomUser) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onOpenReactionPicker: (messageId: string | null) => void;
  onRevealPureImage: (messageId: string) => void;
  onPreviewImage: (url: string) => void;
  onContentResize?: () => void;
}

function ChatMessageRow({
  msg,
  repeatCount = 1,
  room,
  myUserId,
  pureMode,
  pureImageRevealed,
  reactionPickerOpen,
  chatMuted,
  chatScrollRoot,
  chatPanelRef,
  onReply,
  onMentionUser,
  onToggleReaction,
  onOpenReactionPicker,
  onRevealPureImage,
  onPreviewImage,
  onContentResize,
}: ChatMessageRowProps) {
  const userMap = useMemo(
    () => new Map(room.users.map((user) => [user.id, user])),
    [room.users],
  );
  const nicknames = useMemo(() => room.users.map((user) => user.nickname), [room.users]);

  if (msg.kind === 'welcome') {
    if (pureMode) return null;
    return (
      <WelcomeChatRow msg={msg} onContentResize={onContentResize} />
    );
  }

  if (msg.kind === 'system') {
    return (
      <SystemChatRow msg={msg} repeatCount={repeatCount} onContentResize={onContentResize} />
    );
  }

  if (msg.kind === 'song_request' && msg.song) {
    return <SongRequestChatRow msg={msg} room={room} myUserId={myUserId} onContentResize={onContentResize} />;
  }

  const isMe = msg.userId === myUserId;
  const isRoomCreator = msg.userId === room.creatorId;
  const isRoomAdmin = room.adminIds.includes(msg.userId);
  const userMemberTier = room.memberTiers?.[msg.userId];
  const user = userMap.get(msg.userId);
  const isStickerImage = isChatStickerMessage(msg.imageUrl, msg.imageKey, msg.asSticker);
  const isPureStickerHidden = pureMode && isStickerImage && !pureImageRevealed;
  const isPhotoOnly = Boolean(
    msg.imageUrl && !msg.text && !isStickerImage && (!pureMode || pureImageRevealed),
  );
  const bubbleClass = `min-w-0 max-w-full rounded-2xl text-sm leading-7 break-words [overflow-wrap:anywhere] ${isPhotoOnly ? 'p-1' : 'px-3 py-1.5'} ${isMe ? 'rounded-br-md bg-[rgba(var(--om-accent-rgb),0.14)] text-white' : 'rounded-bl-md bg-sky-400/10 text-white/90'}`;
  const replyBubbleClass = `min-w-0 max-w-full rounded-2xl px-3 py-1.5 text-sm ${isMe ? 'rounded-br-md bg-[rgba(var(--om-accent-rgb),0.14)] text-white' : 'rounded-bl-md bg-sky-400/10 text-white/90'}`;

  const renderReplyPreview = () => {
    if (!msg.replyTo) return null;
    const borderClass = isMe ? 'border-r-2 border-white/20' : 'border-l-2 border-white/20';
    return (
      <div className={`min-w-0 max-w-full rounded-lg bg-black/20 px-2 py-1 text-xs leading-5 text-netease-muted ${borderClass}`}>
        <div className={`flex min-w-0 max-w-full flex-col gap-0.5 ${isMe ? 'items-end text-right' : 'items-start'}`}>
          <span>回复 {msg.replyTo.nickname}：</span>
          {renderReplyRefContent(msg.replyTo, chatScrollRoot, nicknames, isMe)}
        </div>
      </div>
    );
  };

  const renderStickerContent = () => {
    if (!isStickerImage) return null;
    if (!msg.imageUrl) {
      return <span className="text-white/70">[表情包]</span>;
    }
    if (isPureStickerHidden) {
      return (
        <button
          type="button"
          onClick={() => onRevealPureImage(msg.id)}
          className="text-sky-300/90 transition-colors hover:text-sky-200"
          aria-label="加载表情包"
        >
          表情包
        </button>
      );
    }
    return (
      <img
        src={msg.imageUrl}
        alt="表情包"
        loading={onContentResize ? 'eager' : 'lazy'}
        className={CHAT_STICKER_CLASS}
        onLoad={onContentResize}
      />
    );
  };

  const renderPhotoContent = () => {
    if (!msg.imageUrl || isStickerImage) return null;
    if (pureMode && !pureImageRevealed) {
      return (
        <button
          type="button"
          onClick={() => onRevealPureImage(msg.id)}
          className="text-sky-300/90 transition-colors hover:text-sky-200"
          aria-label="加载查看图片"
        >
          图片
        </button>
      );
    }
    if (pureMode && pureImageRevealed) {
      return (
        <div className="overflow-hidden rounded-lg">
          <img
            src={msg.imageUrl}
            alt="聊天图片"
            loading={onContentResize ? 'eager' : 'lazy'}
            className={CHAT_PHOTO_CLASS}
            onLoad={onContentResize}
          />
        </div>
      );
    }
    return (
      <Tooltip content="点击查看大图">
        <button
          type="button"
          onClick={() => onPreviewImage(msg.imageUrl!)}
          className="block cursor-zoom-in overflow-hidden rounded-lg"
          aria-label="查看聊天图片"
        >
          <img
            src={msg.imageUrl}
            alt="聊天图片"
            loading={onContentResize ? 'eager' : 'lazy'}
            className={CHAT_PHOTO_CLASS}
            onLoad={onContentResize}
          />
        </button>
      </Tooltip>
    );
  };

  return (
    <div
      className={`group flex w-full min-w-0 max-w-full flex-col ${isMe ? 'items-end' : 'items-start'}`}
      onContextMenu={(event) => { event.preventDefault(); onReply(msg); }}
    >
      <div className={`mb-1 flex max-w-full min-w-0 items-center gap-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
        <button
          type="button"
          onClick={() => user && onMentionUser(user)}
          className={`max-w-full truncate text-[11px] ${isMe ? 'text-[var(--om-accent)]/85' : 'text-netease-muted'} hover:text-sky-300`}
        >
          {msg.nickname}
        </button>
        {isRoomCreator && <RoleBadge role="owner" />}
        {isRoomAdmin && !isRoomCreator && <RoleBadge role="admin" />}
        {userMemberTier && <MemberTierBadge tier={userMemberTier} />}
        {msg.timestamp > 0 && (
          <Tooltip content={new Date(msg.timestamp).toLocaleString('zh-CN')} side="bottom">
            <time
              dateTime={new Date(msg.timestamp).toISOString()}
              className="text-[11px] text-netease-muted/75 tabular-nums whitespace-nowrap"
            >
              {formatChatTime(msg.timestamp)}
            </time>
          </Tooltip>
        )}
      </div>
      <div className={`flex min-w-0 max-w-full items-end gap-2 ${isMe ? 'flex-row-reverse justify-end' : ''}`}>
        <div
          className={`mb-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.08] text-xs font-semibold ${avatarClassFor(msg.userId)}`}
          title={msg.nickname}
          aria-label={`${msg.nickname} 的头像`}
        >
          {(msg.nickname || '?').trim().slice(0, 1)}
        </div>
        <div className={`flex min-w-0 max-w-[calc(100%-2.5rem)] flex-1 flex-col ${isMe ? 'items-end' : 'items-start'}`}>
          {isStickerImage ? (
            <div className={`flex min-w-0 max-w-full flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
              {msg.replyTo && (
                <div className={replyBubbleClass}>
                  {renderReplyPreview()}
                </div>
              )}
              <div className="min-w-0 max-w-full">
                {renderStickerContent()}
              </div>
            </div>
          ) : (
            <div className={bubbleClass}>
              {msg.replyTo && (
                <div className={`mb-1 ${isPhotoOnly ? 'mx-1 mt-1' : ''}`}>
                  {renderReplyPreview()}
                </div>
              )}
              {renderPhotoContent()}
              {msg.text ? renderMessageText(msg.text, 'message', chatScrollRoot, nicknames) : null}
            </div>
          )}
          <ChatMessageReactions
            reactions={msg.reactions}
            myUserId={myUserId}
            alignEnd={isMe}
            onToggle={(emoji) => onToggleReaction(msg.id, emoji)}
            containerRef={chatPanelRef}
            scrollRoot={chatScrollRoot}
          />
        </div>
        <div
          className={`relative mt-1 flex flex-col gap-0.5 transition-opacity ${
            reactionPickerOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Tooltip content="回复">
            <button type="button" onClick={() => onReply(msg)} className="rounded p-0.5 text-netease-muted hover:bg-white/10 hover:text-white" aria-label="回复">
              <Reply className="h-3 w-3" />
            </button>
          </Tooltip>
          <Tooltip content="点评表情">
            <button
              type="button"
              disabled={chatMuted}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onOpenReactionPicker(reactionPickerOpen ? null : msg.id)}
              className="rounded p-0.5 text-netease-muted hover:bg-white/10 hover:text-white disabled:opacity-40"
              aria-label="点评表情"
            >
              <Smile className="h-3 w-3" />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function SystemChatRow({
  msg,
  repeatCount,
  onContentResize,
}: {
  msg: ChatMessage;
  repeatCount: number;
  onContentResize?: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!onContentResize) return;
    const el = rowRef.current;
    if (!el) return;
    onContentResize();
    const ro = new ResizeObserver(() => onContentResize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [msg.id, msg.text, onContentResize]);

  return (
    <div ref={rowRef} className="flex justify-center px-2 py-0.5">
      <p className="flex max-w-[92%] items-center gap-2 break-words rounded-full bg-white/[0.035] px-3 py-1 text-center text-xs leading-5 text-netease-muted/85 [overflow-wrap:anywhere]">
        {msg.text}
        {repeatCount > 1 && <span className="flex-shrink-0 text-[11px] text-netease-muted/60">×{repeatCount}</span>}
      </p>
    </div>
  );
}

function SongRequestChatRow({
  msg,
  room,
  myUserId,
  onContentResize,
}: {
  msg: ChatMessage;
  room: ChatRoomMeta;
  myUserId: string;
  onContentResize?: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const isMe = msg.userId === myUserId;
  const user = room.users.find((candidate) => candidate.id === msg.userId);
  const isRoomCreator = msg.userId === room.creatorId;
  const isRoomAdmin = room.adminIds.includes(msg.userId);

  useLayoutEffect(() => {
    if (!onContentResize) return;
    const el = rowRef.current;
    if (!el) return;
    onContentResize();
    const observer = new ResizeObserver(() => onContentResize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [msg.id, msg.song?.name, onContentResize]);

  return (
    <div ref={rowRef} className={`flex w-full items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
      {!isMe && (
        <div className={`mb-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.08] text-xs font-semibold ${avatarClassFor(msg.userId)}`} aria-label={`${msg.nickname} 的头像`}>
          {(msg.nickname || '?').trim().slice(0, 1)}
        </div>
      )}
      <article className={`min-w-0 max-w-[calc(100%-2.5rem)] rounded-xl border px-3 py-2 ${isMe ? 'border-[rgba(var(--om-accent-rgb),0.24)] bg-[rgba(var(--om-accent-rgb),0.08)]' : 'border-sky-300/[0.12] bg-sky-300/[0.045]'}`}>
        <div className={`mb-2 flex min-w-0 items-center gap-1.5 ${isMe ? 'justify-end' : ''}`}>
          <span className={`max-w-full truncate text-xs font-medium ${isMe ? 'text-[var(--om-accent)]' : 'text-sky-200/90'}`}>{user?.nickname || msg.nickname}</span>
          {isRoomCreator && <RoleBadge role="owner" />}
          {isRoomAdmin && !isRoomCreator && <RoleBadge role="admin" />}
          <span className="text-[11px] text-netease-muted/75">点了一首歌</span>
          {msg.timestamp > 0 && <time className="ml-auto flex-shrink-0 text-[11px] tabular-nums text-netease-muted/65" dateTime={new Date(msg.timestamp).toISOString()}>{formatChatTime(msg.timestamp)}</time>}
        </div>
        <div className="flex min-w-0 items-center gap-2.5">
          <SongCover song={msg.song!} className="h-10 w-10 flex-shrink-0 rounded-md object-cover" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium leading-5 text-white">{msg.song?.name}</p>
            <p className="truncate text-xs leading-4 text-netease-muted">{msg.song?.artist || '未知歌手'}{msg.song?.album ? ` · ${msg.song.album}` : ''}</p>
          </div>
          <Music2 className={`ml-auto h-4 w-4 flex-shrink-0 ${isMe ? 'text-[var(--om-accent)]/75' : 'text-sky-200/60'}`} />
        </div>
      </article>
      {isMe && (
        <div className={`mb-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.08] text-xs font-semibold ${avatarClassFor(msg.userId)}`} aria-label={`${msg.nickname} 的头像`}>
          {(msg.nickname || '?').trim().slice(0, 1)}
        </div>
      )}
    </div>
  );
}

function WelcomeChatRow({
  msg,
  onContentResize,
}: {
  msg: ChatMessage;
  onContentResize?: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!onContentResize) return;
    const el = rowRef.current;
    if (!el) return;
    onContentResize();
    const ro = new ResizeObserver(() => onContentResize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [msg.id, msg.text, onContentResize]);

  return (
    <div ref={rowRef} className="flex justify-center py-1">
      <div className="welcome-chat-card max-w-[92%] rounded-2xl px-4 py-3 text-center">
        <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
          {msg.memberTier && <MemberTierBadge tier={msg.memberTier} />}
          {msg.targetNickname && (
            <span className="text-sm font-medium text-white">{msg.targetNickname}</span>
          )}
        </div>
        <p className="break-words text-sm leading-6 text-white/95 [overflow-wrap:anywhere]">{msg.text}</p>
        {msg.timestamp > 0 && (
          <p className="mt-2 text-[10px] text-netease-muted/70">{formatChatTime(msg.timestamp)}</p>
        )}
      </div>
    </div>
  );
}

function reactionsKey(reactions: ChatMessage['reactions']) {
  return (reactions || [])
    .map((r) => `${r.emoji}:${r.users.length}`)
    .join(',');
}

export default memo(ChatMessageRow, (prev, next) => (
  prev.msg.id === next.msg.id
  && prev.msg.kind === next.msg.kind
  && prev.repeatCount === next.repeatCount
  && prev.msg.text === next.msg.text
  && prev.msg.imageUrl === next.msg.imageUrl
  && prev.msg.imageKey === next.msg.imageKey
  && prev.msg.asSticker === next.msg.asSticker
  && reactionsKey(prev.msg.reactions) === reactionsKey(next.msg.reactions)
  && prev.pureMode === next.pureMode
  && prev.pureImageRevealed === next.pureImageRevealed
  && prev.reactionPickerOpen === next.reactionPickerOpen
  && prev.chatMuted === next.chatMuted
  && prev.myUserId === next.myUserId
  && prev.room.creatorId === next.room.creatorId
  && prev.room.adminIds === next.room.adminIds
  && prev.room.memberTiers === next.room.memberTiers
  && prev.chatScrollRoot === next.chatScrollRoot
));

export { renderReplyRefContent };
