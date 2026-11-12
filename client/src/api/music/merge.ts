import type { MusicSource, SearchResult } from '../../types';

const SOURCE_PRIORITY: Record<MusicSource, number> = {
  netease: 0,
  tencent: 1,
  kugou: 2,
  qishui: 3,
  migu: 4,
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '').trim();
}

/** 歌手名 + 歌名（跨平台去重键） */
export function trackTitleKey(song: Pick<SearchResult, 'name' | 'artist'>): string {
  return `${normalize(song.name)}|${normalize(song.artist)}`;
}

/** 去除完全相同的条目（同平台同 ID） */
function dedupExact(songs: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return songs.filter((song) => {
    const key = `${song.source}:${song.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 跨平台去重：歌名 + 歌手一致视为同一首
 * 保留优先级：网易云 > QQ音乐 > 酷狗音乐（先丢酷狗音乐，再丢QQ音乐）
 */
function dedupeCrossSource(songs: SearchResult[]): SearchResult[] {
  const best = new Map<string, SearchResult>();

  for (const song of songs) {
    const key = trackTitleKey(song);
    const prev = best.get(key);
    if (!prev || SOURCE_PRIORITY[song.source] < SOURCE_PRIORITY[prev.source]) {
      best.set(key, song);
    }
  }

  const emitted = new Set<string>();
  const result: SearchResult[] = [];

  for (const song of songs) {
    const key = trackTitleKey(song);
    const winner = best.get(key)!;
    if (song.source !== winner.source || song.id !== winner.id) continue;
    if (emitted.has(key)) continue;
    emitted.add(key);
    result.push(song);
  }

  return result;
}

export interface InterleaveOptions {
  /** 跨平台按歌名+歌手去重，优先级：网易云 > QQ音乐 > 酷狗音乐 */
  dedupeCrossSource?: boolean;
  /** 仅保留指定平台结果 */
  sourceOnly?: MusicSource;
  /**
   * 当前可播放的平台（房主已登录或免登录可用）。
   * 可播放平台的结果交替排列在前，不可播放的整组排到最后。
   */
  playableSources?: MusicSource[];
}

/**
 * 网易云、QQ音乐、酷狗音乐结果交替排列；可选跨平台去重
 */
export function interleaveSearchResults(
  groups: Partial<Record<MusicSource, SearchResult[]>>,
  options: InterleaveOptions = {},
): SearchResult[] {
  if (options.sourceOnly) {
    return dedupExact(groups[options.sourceOnly] ?? []);
  }

  const ordered: Array<[MusicSource, SearchResult[]]> = [
    ['netease', dedupExact(groups.netease ?? [])],
    ['tencent', dedupExact(groups.tencent ?? [])],
    ['kugou', dedupExact(groups.kugou ?? [])],
    ['qishui', dedupExact(groups.qishui ?? [])],
  ];
  const playable = options.playableSources;
  const primary = playable ? ordered.filter(([src]) => playable.includes(src)) : ordered;
  const fallback = playable ? ordered.filter(([src]) => !playable.includes(src)) : [];

  const merged: SearchResult[] = [];
  const interleave = (list: Array<[MusicSource, SearchResult[]]>) => {
    const max = list.length ? Math.max(...list.map(([, arr]) => arr.length)) : 0;
    for (let i = 0; i < max; i++) {
      for (const [, arr] of list) {
        if (i < arr.length) merged.push(arr[i]);
      }
    }
  };
  interleave(primary);
  interleave(fallback);

  const deduped = options.dedupeCrossSource ? dedupeCrossSource(merged) : merged;
  if (!playable) return deduped;

  // 去重后再次分区：可播放平台的条目保持在前，不可播放的（含跨平台去重幸存的独家版本）排到最后
  const playableSet = new Set(playable);
  const head = deduped.filter((song) => playableSet.has(song.source));
  const tail = deduped.filter((song) => !playableSet.has(song.source));
  return [...head, ...tail];
}

/** @deprecated 使用 interleaveSearchResults */
export function mergeSearchResults(songs: SearchResult[]): SearchResult[] {
  return dedupExact(songs);
}
export function songKey(song: Pick<SearchResult, 'source' | 'id'>): string {
  return `${song.source}-${song.id}`;
}

/** 歌手名规范化，用于分组标题去重 */
export function artistGroupKey(artist: string): string {
  return normalize(artist);
}
