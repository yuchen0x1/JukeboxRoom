import type { MusicSource } from '../types';
import type { PlaylistPlatform } from '../api/music/playlist';

/** 用户可见的音源简称（避免第三方品牌名称） */
export const SOURCE_SHORT_LABELS: Record<MusicSource, string> = {
  netease: '红点',
  tencent: '绿点',
  kugou: '蓝点',
};

export const SOURCE_COLORS: Record<MusicSource, string> = {
  netease: 'var(--color-danger)',
  tencent: 'var(--color-primary-hover)',
  kugou: '#2688ee',
};

export const PLAYLIST_PLATFORM_LABELS: Record<PlaylistPlatform, string> = {
  netease: '红点',
  qq: '绿点',
};

export function getSourceShortLabel(source?: MusicSource): string {
  if (!source) return SOURCE_SHORT_LABELS.netease;
  return SOURCE_SHORT_LABELS[source] ?? SOURCE_SHORT_LABELS.netease;
}
