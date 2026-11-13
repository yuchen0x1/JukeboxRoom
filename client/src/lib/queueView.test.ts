import { describe, expect, it } from 'vitest';
import { filterQueueSongs, isMyQueueSong, selectableQueueIds, type QueueViewSong } from './queueView';

const songs: QueueViewSong[] = [
  { id: '1', queueId: 'now', name: '晴天', artist: '周杰伦', source: 'netease', requestedBy: '小林', requestedById: 'a', addedAt: 1, isCurrent: true, position: 0 },
  { id: '2', queueId: 'next', name: 'Hello', artist: 'Adele', album: '25', source: 'tencent', requestedBy: '小张', requestedById: 'b', addedAt: 2, isCurrent: false, position: 1 },
  { id: '3', queueId: 'last', name: '夜曲', artist: '周杰伦', source: 'netease', requestedBy: '小林', requestedById: 'a', addedAt: 3, isCurrent: false, position: 2 },
];

describe('queue search and selection', () => {
  it('matches name, artist, album and requester, with case-insensitive multi-term search', () => {
    expect(filterQueueSongs(songs, '  HELLO adele  ', false, 'a', '小林').map((s) => s.queueId)).toEqual(['next']);
    expect(filterQueueSongs(songs, '25 小张', false, 'a', '小林')).toHaveLength(1);
    expect(filterQueueSongs(songs, '周杰伦 夜曲', false, 'a', '小林')[0].position).toBe(2);
    expect(filterQueueSongs(songs, '不存在', false, 'a', '小林')).toEqual([]);
    expect(filterQueueSongs(songs, '  ', false, 'a', '小林')).toEqual(songs);
  });
  it('filters mine by stable identity even when two members share a nickname', () => {
    expect(isMyQueueSong(songs[0], 'b', '小林')).toBe(false);
    expect(filterQueueSongs(songs, '', true, 'a', '小林').map((s) => s.queueId)).toEqual(['now', 'last']);
    expect(isMyQueueSong({ ...songs[0], requestedById: undefined }, 'a', '小林')).toBe(true);
    expect(isMyQueueSong(songs[0], null, '小林')).toBe(false);
  });
  it('never selects current or another member’s songs, and preserves server ordering', () => {
    expect(selectableQueueIds(songs, false, 'a', '小林')).toEqual(['last']);
    expect(selectableQueueIds(songs, true, 'a', '小林')).toEqual(['next', 'last']);
    expect(selectableQueueIds(filterQueueSongs(songs, 'Hello', false, 'a', '小林'), true, 'a', '小林')).toEqual(['next']);
    expect(songs.map((s) => s.queueId)).toEqual(['now', 'next', 'last']);
  });
});
