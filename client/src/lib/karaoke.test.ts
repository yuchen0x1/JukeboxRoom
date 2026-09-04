import { describe, it, expect } from 'vitest';
import { karaokeSplit, lineProgress, type KaraokeLine } from './karaoke';

const lines: KaraokeLine[] = [
  { time: 0, text: 'hello world' },
  { time: 2000, text: 'second line' },
  { time: 5000, text: 'third' },
];

describe('lineProgress', () => {
  it('returns 0 before the line starts', () => {
    expect(lineProgress(1000, lines, 1)).toBe(0);
  });

  it('returns 1 after the line ends', () => {
    expect(lineProgress(5000, lines, 1)).toBe(1);
  });

  it('computes linear progress within the line', () => {
    // line 1 starts at 2000, next at 5000 -> duration 3000; at 3500 -> 0.5
    expect(lineProgress(3500, lines, 1)).toBeCloseTo(0.5, 5);
  });

  it('falls back to a 5s window for the last line', () => {
    expect(lineProgress(8000, lines, 2)).toBeCloseTo(0.6, 5);
  });

  it('returns 0 for invalid index', () => {
    expect(lineProgress(100, lines, -1)).toBe(0);
    expect(lineProgress(100, lines, 99)).toBe(0);
  });
});

describe('karaokeSplit', () => {
  it('splits text by progress', () => {
    const result = karaokeSplit('abcdefgh', 0.5);
    expect(result.done).toBe('abcd');
    expect(result.rest).toBe('efgh');
    expect(result.done.length + result.rest.length).toBe(8);
  });

  it('clamps progress to 0..1', () => {
    expect(karaokeSplit('abc', -1).done).toBe('');
    expect(karaokeSplit('abc', 2).rest).toBe('');
  });
});
