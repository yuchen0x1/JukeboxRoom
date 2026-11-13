import type { QueueItem } from '../types';

export type QueueViewSong = QueueItem & { isCurrent: boolean; position: number };

export function isMyQueueSong(song: QueueItem, userId: string | null, nickname: string): boolean {
  if (!userId) return false;
  return song.requestedById ? song.requestedById === userId : Boolean(nickname && song.requestedBy === nickname);
}

export function filterQueueSongs(
  songs: QueueViewSong[], query: string, onlyMine: boolean, userId: string | null, nickname: string,
): QueueViewSong[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return songs.filter((song) => {
    if (onlyMine && !isMyQueueSong(song, userId, nickname)) return false;
    const text = [song.name, song.artist, song.album, song.requestedBy].filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function selectableQueueIds(songs: QueueViewSong[], canManage: boolean, userId: string | null, nickname: string): string[] {
  return songs.filter((song) => !song.isCurrent && (canManage || isMyQueueSong(song, userId, nickname)))
    .map((song) => song.queueId);
}
