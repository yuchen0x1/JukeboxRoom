/**
 * 歌词逐字高亮（F2: 歌词逐字高亮）
 *
 * 标准 LRC 只提供「每行」时间戳，没有逐字时间戳。这里用相邻两行的时间差
 * 估算当前行的演唱时长，按播放进度在行内做字符级（逐字）高亮，达到卡拉OK效果。
 *
 * 纯逻辑层，便于单元测试（不依赖 React / 音频）。
 */

export interface KaraokeLine {
  time: number;
  text: string;
}

/** 当前激活行内的播放进度，0~1。 */
export function lineProgress(
  currentTime: number,
  lines: KaraokeLine[],
  activeIndex: number,
): number {
  if (activeIndex < 0 || activeIndex >= lines.length) return 0;
  const start = lines[activeIndex].time;
  const end =
    activeIndex + 1 < lines.length
      ? lines[activeIndex + 1].time
      : start + 5000;
  if (currentTime <= start) return 0;
  if (currentTime >= end || end <= start) return 1;
  return (currentTime - start) / (end - start);
}

/** 依据进度把一行文本切分为「已唱」与「未唱」两部分。 */
export function karaokeSplit(
  text: string,
  progress: number,
): { done: string; rest: string } {
  const clamped = Math.max(0, Math.min(1, progress));
  const cut = Math.round(clamped * text.length);
  return { done: text.slice(0, cut), rest: text.slice(cut) };
}
