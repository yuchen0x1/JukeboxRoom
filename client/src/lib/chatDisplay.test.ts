import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types';
import { collapseAdjacentSystemEvents } from './chatDisplay';

function message(id: string, kind: ChatMessage['kind'], text: string, userId = 'system'): ChatMessage {
  return { id, kind, text, userId, nickname: userId, timestamp: Number(id.replace(/\D/g, '')) };
}

describe('collapseAdjacentSystemEvents', () => {
  it('groups only adjacent identical system notices for display', () => {
    const messages = [
      message('system-1', 'system', '房主切歌'),
      message('system-2', 'system', '房主切歌'),
      message('chat-1', 'chat', '收到', 'user-a'),
      message('chat-2', 'chat', '收到', 'user-a'),
      message('request-1', 'song_request', '成员点了一首歌', 'user-b'),
      message('request-2', 'song_request', '成员点了一首歌', 'user-b'),
    ];

    const rows = collapseAdjacentSystemEvents(messages);

    expect(rows.map((row) => row.repeatCount)).toEqual([2, 1, 1, 1, 1]);
    expect(rows.map((row) => row.msg.id)).toEqual(['system-1', 'chat-1', 'chat-2', 'request-1', 'request-2']);
    expect(messages).toHaveLength(6);
  });
});
