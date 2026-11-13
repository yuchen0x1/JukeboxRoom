import { describe, expect, it } from 'vitest';
import { parseChangelog, releaseNotesMarkdown } from './changelog';

describe('parseChangelog', () => {
  it('keeps one dated version per GitHub Release regardless of body headings', () => {
    const entries = parseChangelog(releaseNotesMarkdown([{ tag_name: 'v0.0.17', published_at: '2026-11-12T21:45:29Z', body: '# JukeboxRoom v0.0.17\n\n## 本版更新\n- 修复播放\n\n## 下载\n- Windows 安装包' }]));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ version: '0.0.17', date: '2026-11-13', bullets: ['修复播放', 'Windows 安装包'] });
  });
  it('parses dated release headings, section titles, and bullets', () => {
    expect(parseChangelog(`# Changelog\n\n## 0.0.4 - 2026-11-02\n\n### 安全与稳定性\n\n- 修复更新检查\n- 改进桌面安装体验\n\n## 0.0.3 - 2026-11-01\n\n- 新增自动更新`)).toEqual([
      {
        version: '0.0.4',
        date: '2026-11-02',
        title: '安全与稳定性',
        bullets: ['修复更新检查', '改进桌面安装体验'],
      },
      {
        version: '0.0.3',
        date: '2026-11-01',
        bullets: ['新增自动更新'],
      },
    ]);
  });

  it('keeps current releases ahead of explicitly separated legacy history', () => {
    const entries = parseChangelog([
      '## 0.0.3 - 2026-11-02',
      '- 当前版本更新',
      '## 0.0.4 - 2026-11-02',
      '- 最新版本更新',
      '## 2.0.2 - 2026-09-05',
      '- 旧项目历史',
    ].join('\n'));

    expect(entries.map(({ version, isLegacy }) => [version, isLegacy])).toEqual([
      ['0.0.4', undefined],
      ['0.0.3', undefined],
      ['2.0.2', true],
    ]);
  });

  it('keeps non-version headings after current and legacy releases', () => {
    const entries = parseChangelog([
      '## 0.0.4 - 2026-11-02',
      '- 当前版本',
      '## 2.0.2 - 2026-09-05',
      '- 旧历史',
      '## Unreleased',
      '- 预发布内容',
    ].join('\n'));

    expect(entries.map(({ version, isLegacy }) => [version, isLegacy])).toEqual([
      ['0.0.4', undefined],
      ['2.0.2', true],
      ['Unreleased', undefined],
    ]);
  });
});
