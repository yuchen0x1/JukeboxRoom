/**
 * 把更新说明转成可直接展示的纯文本。
 *
 * electron-updater 对 GitHub Release 下发的 releaseNotes 是转换后的 HTML
 * （<h1>、<p>、<a href>…），自托管更新源则可能是原始 Markdown；
 * 直接放进 React 文本节点会把标签原样显示出来。这里统一压成纯文本，
 * 供更新面板的摘要预览使用（完整内容仍走「更新日志」查看器）。
 */
export function releaseNotesToPlainText(value: string): string {
  if (!value) return '';
  const text = String(value)
    // 块级标签转换行，列表项加符号，随后剥掉全部标签
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:h[1-6]|p|div|li|tr|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '· ')
    .replace(/<[^>]*>/g, '')
    // 常见 HTML 实体（GitHub 的 body 会转义）
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Markdown 兜底：标题、强调、链接只留文字
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^[-*]\s+/gm, '· ')
    .replace(/\*/g, '')
    // 压掉多余空白与空行
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  return text.trim().slice(0, 8_000);
}
