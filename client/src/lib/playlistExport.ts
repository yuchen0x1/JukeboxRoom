import type { Song } from '../types';

export function exportSongsToJsonFile(songs: Song[], fileName = 'jukeboxroom-playlist.json'): void {
  const safeName = (fileName || 'jukeboxroom-playlist.json')
    .replace(/[\\/:*?"<>|\r\n]+/g, '_')
    .trim() || 'jukeboxroom-playlist.json';

  const cleanSongs = songs.map((s) => ({
    id: s.id,
    name: s.name,
    artist: s.artist,
    album: s.album,
    source: s.source || 'netease',
    duration: s.duration,
    pic: s.pic,
    lrc: s.lrc,
  }));

  const payload = {
    app: 'JukeboxRoom',
    exportedAt: new Date().toISOString(),
    count: cleanSongs.length,
    songs: cleanSongs,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function parseExportedSongsJson(rawText: string): Song[] {
  try {
    const data = JSON.parse(rawText);
    const list = Array.isArray(data) ? data : Array.isArray(data?.songs) ? data.songs : [];
    return list.map((item: Record<string, unknown>) => ({
      id: String(item.id || ''),
      name: String(item.name || '未知歌曲'),
      artist: String(item.artist || '未知歌手'),
      album: typeof item.album === 'string' ? item.album : '',
      source: (item.source as Song['source']) || 'netease',
      duration: typeof item.duration === 'number' ? item.duration : undefined,
      pic: typeof item.pic === 'string' ? item.pic : undefined,
      lrc: typeof item.lrc === 'string' ? item.lrc : undefined,
    })).filter((s: Song) => Boolean(s.id));
  } catch {
    return [];
  }
}
