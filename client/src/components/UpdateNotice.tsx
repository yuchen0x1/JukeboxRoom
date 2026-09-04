import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, RefreshCw, Sparkles, X } from 'lucide-react';
import { fetchUpdateInfo, type UpdateInfo } from '../api/update';

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const DISMISSED_VERSION_KEY = 'openmusic-update-dismissed-v1';

function formatReleaseDate(value: string | null) {
  if (!value) return '';
  try { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(value)); } catch { return ''; }
}

async function refreshWebApp() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      let reloaded = false;
      const reload = () => { if (!reloaded) { reloaded = true; window.location.reload(); } };
      navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
      window.setTimeout(reload, 1500);
      return;
    }
  } catch { /* Fall back to a normal reload below. */ }
  window.location.reload();
}

function DownloadLink({ label, asset }: { label: string; asset: UpdateInfo['assets']['desktop'] }) {
  if (!asset) return null;
  return <a href={asset.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-xs text-white/75 transition-colors hover:bg-white/10 hover:text-white"><Download className="h-3.5 w-3.5" />{label}</a>;
}

export default function UpdateNotice() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const checking = useRef(false);

  const checkForUpdates = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      const next = await fetchUpdateInfo();
      if (!next?.updateAvailable || !next.latestVersion) return;
      let dismissedVersion = '';
      try { dismissedVersion = sessionStorage.getItem(DISMISSED_VERSION_KEY) || ''; } catch { /* ignore */ }
      setUpdate(next);
      setDismissed(dismissedVersion === next.latestVersion);
    } finally { checking.current = false; }
  }, []);

  useEffect(() => {
    void checkForUpdates();
    const timer = window.setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS);
    const onFocus = () => void checkForUpdates();
    const onVisibility = () => { if (document.visibilityState === 'visible') void checkForUpdates(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibility); };
  }, [checkForUpdates]);

  if (!update || dismissed || !update.latestVersion) return null;
  const releaseDate = formatReleaseDate(update.publishedAt);
  return (
    <aside role="status" aria-live="polite" className="fixed bottom-4 right-4 z-[100] w-[min(calc(100vw-2rem),28rem)] rounded-2xl border border-emerald-300/20 bg-slate-950/90 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-emerald-400/15 p-2 text-emerald-300"><Sparkles className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div><p className="text-sm font-semibold">发现新版本 v{update.latestVersion}</p><p className="mt-1 text-xs text-white/50">当前 v{update.currentVersion || '未知'}{releaseDate ? ` · ${releaseDate}` : ''}</p></div>
            <button type="button" aria-label="稍后提醒" onClick={() => { try { sessionStorage.setItem(DISMISSED_VERSION_KEY, update.latestVersion || ''); } catch { /* ignore */ } setDismissed(true); }} className="rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          {update.releaseNotes && <p className="mt-2 max-h-10 overflow-hidden whitespace-pre-line text-xs leading-5 text-white/65">{update.releaseNotes}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void refreshWebApp()} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-300"><RefreshCw className="h-3.5 w-3.5" />刷新网站</button>
            <DownloadLink label="电脑版" asset={update.assets.desktop} />
            <DownloadLink label="Android" asset={update.assets.android} />
            <DownloadLink label="iOS" asset={update.assets.ios} />
            {update.releaseUrl && <a href={update.releaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-1 py-1.5 text-xs text-white/45 transition-colors hover:text-white/80">发布页<ExternalLink className="h-3.5 w-3.5" /></a>}
          </div>
        </div>
      </div>
    </aside>
  );
}
