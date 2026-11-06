import { describe, expect, it } from 'vitest';
import { EQUALIZER_PRESETS, AudioEqualizerEngine } from './audioEqualizer';
import { parseExportedSongsJson } from './playlistExport';
import { parseLrc } from '../api/music';

describe('AudioEqualizerEngine', () => {
  it('initializes with default flat preset or reads from storage', () => {
    const eq = new AudioEqualizerEngine();
    expect(eq.getPreset()).toBe('flat');
  });

  it('switches preset correctly and verifies gains definition', () => {
    const eq = new AudioEqualizerEngine();
    eq.setPreset('bass_boost');
    expect(eq.getPreset()).toBe('bass_boost');
    expect(EQUALIZER_PRESETS.bass_boost.gains[0]).toBeGreaterThan(0);
  });
});

describe('Playlist export and import', () => {
  it('parses exported playlist json correctly', () => {
    const json = JSON.stringify({
      app: 'JukeboxRoom',
      exportedAt: new Date().toISOString(),
      songs: [
        { id: '123456', name: '晴天', artist: '周杰伦', source: 'netease', duration: 269000 },
        { id: '789012', name: '七里香', artist: '周杰伦', source: 'tencent', duration: 299000 },
      ],
    });

    const parsed = parseExportedSongsJson(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('晴天');
    expect(parsed[1].source).toBe('tencent');
  });

  it('handles invalid json or corrupted structure gracefully', () => {
    expect(parseExportedSongsJson('not json')).toEqual([]);
    expect(parseExportedSongsJson('{}')).toEqual([]);
  });
});

describe('Lyrics bilingual parsing', () => {
  it('merges translation lyrics with timestamps close to original lyrics', () => {
    const originalLrc = `
[00:01.00]Hello world
[00:05.50]Singing a song
`;
    const transLrc = `
[00:01.20]你好世界
[00:05.40]唱一首歌
`;
    const lines = parseLrc(originalLrc, transLrc);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe('Hello world');
    expect(lines[0].translation).toBe('你好世界');
    expect(lines[1].text).toBe('Singing a song');
    expect(lines[1].translation).toBe('唱一首歌');
  });
});
