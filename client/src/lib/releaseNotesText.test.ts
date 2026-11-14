import { describe, expect, it } from 'vitest';
import { releaseNotesToPlainText } from './releaseNotesText';

describe('releaseNotesToPlainText', () => {
  it('flattens electron-updater style HTML release notes', () => {
    const html = '<h1>JukeboxRoom v0.0.19</h1>\n<p>发布日期：2026-11-14（北京时间） · <a href="https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.18...v0.0.19">与上一版比较</a></p>\n<h2>本版更新</h2>\n<ul>\n<li>修复咪咕短信登录</li>\n<li>规则模式代理下国内音源直连</li>\n</ul>';
    expect(releaseNotesToPlainText(html)).toBe(
      'JukeboxRoom v0.0.19\n发布日期：2026-11-14（北京时间） · 与上一版比较\n本版更新\n· 修复咪咕短信登录\n· 规则模式代理下国内音源直连',
    );
  });

  it('decodes escaped entities emitted by GitHub bodies', () => {
    expect(releaseNotesToPlainText('&lt;插件&gt; &amp; &#39;引号&#39;')).toBe("<插件> & '引号'");
  });

  it('still cleans raw markdown bodies from self-hosted update sources', () => {
    expect(releaseNotesToPlainText('## 0.0.19\n- **修复** [登录](https://example.com)流程')).toBe('0.0.19\n· 修复 登录流程');
  });

  it('drops surrounding whitespace and keeps a single blank-line-free block', () => {
    expect(releaseNotesToPlainText('  第一行\n\n\n第二行  ')).toBe('第一行\n第二行');
    expect(releaseNotesToPlainText('')).toBe('');
  });
});
