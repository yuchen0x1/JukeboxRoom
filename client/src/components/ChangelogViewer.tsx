import { useEffect, useState } from 'react';
import { CalendarDays, Loader2, ScrollText, X } from 'lucide-react';
import { parseChangelog, type ChangelogEntry } from './changelog';

interface Props {
  onClose: () => void;
}

export default function ChangelogViewer({ onClose }: Props) {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      // 动态优先：GitHub Releases 的说明永远最新；静态 changelog.md 作为兜底（离线/接口不可用时）
      let markdown = '';
      try {
        const response = await fetch('/api/update/changelog', { signal: controller.signal });
        if (response.ok) {
          const data = await response.json() as { releases?: Array<{ body?: string }> };
          markdown = (data.releases || []).map((item) => item.body || '').filter(Boolean).join('\n\n');
        }
      } catch {
        // 回退静态文件
      }
      try {
        const staticResponse = await fetch('/changelog.md', { signal: controller.signal, cache: 'force-cache' });
        if (staticResponse.ok) {
          const staticMarkdown = await staticResponse.text();
          markdown = markdown ? `${markdown}\n\n${staticMarkdown}` : staticMarkdown;
        }
      } catch {
        // 只用动态内容
      }
      if (controller.signal.aborted) return;
      if (!markdown.trim()) {
        setFailed(true);
        setLoading(false);
        return;
      }
      const parsed = parseChangelog(markdown);
      const seen = new Set<string>();
      setEntries(parsed.filter((entry) => (seen.has(entry.version) ? false : (seen.add(entry.version), true))));
      setLoading(false);
    })().catch(() => {
      if (!controller.signal.aborted) {
        setFailed(true);
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-xl bg-netease-red/15 p-2 text-netease-red">
            <ScrollText className="h-5 w-5" />
          </span>
          <div>
            <h2 id="changelog-title" className="text-lg font-semibold text-white">更新日志</h2>
            <p className="mt-0.5 text-xs text-white/45">当前 JukeboxRoom 版本更新与历史记录</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="关闭更新日志"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在加载更新日志…
          </div>
        ) : failed || entries.length === 0 ? (
          <div className="py-12 text-center text-sm text-white/45">暂时无法加载更新日志，请稍后重试。</div>
        ) : (
          <div className="space-y-7">
            {entries.map((entry, index) => (
              <section key={`${entry.version}-${entry.date}`}>
                {entry.isLegacy && (index === 0 || !entries[index - 1].isLegacy) && (
                  <h3 className="mb-4 border-t border-white/10 pt-5 text-xs font-semibold uppercase tracking-wider text-white/40">
                    旧项目历史记录
                  </h3>
                )}
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-base font-semibold text-white">v{entry.version}</h3>
                  {entry.date && (
                    <span className="inline-flex items-center gap-1 text-xs text-white/40">
                      <CalendarDays className="h-3.5 w-3.5" />{entry.date}
                    </span>
                  )}
                </div>
                {entry.title && <h4 className="mb-2 text-sm font-medium text-netease-red/90">{entry.title}</h4>}
                {entry.bullets.length > 0 ? (
                  <ul className="space-y-2 border-l border-white/10 pl-4">
                    {entry.bullets.map((bullet, index) => (
                      <li key={`${entry.version}-${index}`} className="text-sm leading-6 text-white/65">{bullet}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm leading-6 text-white/55">此版本暂无详细说明。</p>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end border-t border-white/10 px-5 py-3 sm:px-6">
        <button type="button" onClick={onClose} className="glass-button-secondary rounded-xl px-4 py-2 text-sm">完成</button>
      </div>
    </div>
  );
}
