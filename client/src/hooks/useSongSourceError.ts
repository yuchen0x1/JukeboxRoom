import { useEffect, useState } from 'react';
import { isTrackSourceError, subscribeSourceErrors } from '../lib/songPreloadCache';
import type { QueueItem } from '../types';

/** 订阅源错误标记变化，用于队列列表重渲染 */
export function useSourceErrorRevision() {
  const [, bump] = useState(0);
  useEffect(() => subscribeSourceErrors(() => bump((v) => v + 1)), []);
}

export function useTrackSourceError(song: Pick<QueueItem, 'queueId' | 'id' | 'source'> | null | undefined): boolean {
  useSourceErrorRevision();
  if (!song) return false;
  return isTrackSourceError(song);
}
