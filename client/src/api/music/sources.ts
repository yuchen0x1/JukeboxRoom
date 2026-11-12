import type { MusicProviderMeta, MusicProvider } from './types';
import { neteaseProvider } from './providers/meting';
import { tencentProvider } from './providers/tencent';
import { kugouProvider } from './providers/kugou';
import { qishuiProvider } from './providers/qishui';
import { miguProvider } from './providers/migu';
import type { MusicSource } from '../../types';

export const providers: Record<MusicSource, MusicProvider> = {
  netease: neteaseProvider,
  tencent: tencentProvider,
  kugou: kugouProvider,
  qishui: qishuiProvider,
  migu: miguProvider,
};

export function getAllSources(): MusicProviderMeta[] {
  return Object.values(providers).map((p) => ({
    id: p.id,
    name: p.name,
    shortName: p.shortName,
    color: p.color,
    supportsSearch: p.supportsSearch,
    supportsIdLookup: p.supportsIdLookup,
    description: p.description,
  }));
}
