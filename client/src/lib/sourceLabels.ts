import type { MusicSource } from '../types';
import type { PlaylistPlatform } from '../api/music/playlist';

/** 用户可见的音源简称（避免第三方品牌名称） */
export const SOURCE_SHORT_LABELS: Record<MusicSource, string> = {
  netease: '网易云',
  tencent: 'QQ音乐',
  kugou: '酷狗音乐',
  qishui: '汽水音乐',
  migu: '咪咕音乐',
};

export const SOURCE_COLORS: Record<MusicSource, string> = {
  netease: 'var(--color-danger)',
  tencent: 'var(--color-primary-hover)',
  kugou: '#2688ee',
  qishui: '#f5a623',
  migu: '#20c4f4',
};

export const PLAYLIST_PLATFORM_LABELS: Record<PlaylistPlatform, string> = {
  netease: '网易云',
  qq: 'QQ音乐',
};

export function getSourceShortLabel(source?: MusicSource): string {
  if (!source) return SOURCE_SHORT_LABELS.netease;
  return SOURCE_SHORT_LABELS[source] ?? SOURCE_SHORT_LABELS.netease;
}
