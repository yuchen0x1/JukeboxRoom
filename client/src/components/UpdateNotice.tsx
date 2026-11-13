import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, Loader2, RefreshCw, Rocket, Sparkles, X } from 'lucide-react';
import { ApiError } from '../api/http';
import { getStoredUser } from '../api/auth';
import { fetchUpdateInfo, fetchSelfUpdateState, startServerUpdate, type UpdateInfo } from '../api/update';

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
  const [applying, setApplying] = useState(false);
  const [canApply, setCanApply] = useState(false);
  const [applyMessage, setApplyMessage] = useState('');
  const checking = useRef(false);
  const applyingRef = useRef(false);
  const applyController = useRef<AbortController | null>(null);
  const pollTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    applyController.current?.abort();
    window.clearTimeout(pollTimer.current);
  }, []);

  /** 一键更新：服务端拉取/构建/自动重启，约 1-3 分钟后页面自动恢复 */
  const applyUpdateNow = useCallback(async () => {
    if (applyingRef.current || !canApply) return;
    if (!window.confirm('更新服务器会重启服务，房间连接可能暂时中断。现在开始更新？')) return;
    applyingRef.current = true;
    const controller = new AbortController();
    applyController.current = controller;
    setApplying(true);
    setApplyMessage('');
    const finish = (message: string) => {
      if (controller.signal.aborted) return;
      applyingRef.current = false;
      setApplying(false);
      setApplyMessage(message);
    };
    try {
      await startServerUpdate(controller.signal);
    } catch (error) {
      finish(error instanceof ApiError ? error.userMessage : error instanceof Error ? error.message : '更新未启动，请稍后重试');
      return;
    }
    let attempts = 0;
    const poll = async () => {
      if (controller.signal.aborted) return;
      attempts += 1;
      if (attempts > 40) { finish('等待更新超时，请在管理后台检查服务器状态。'); return; }
      try {
        const state = await fetchSelfUpdateState(controller.signal);
        if (controller.signal.aborted) return;
        if (state.phase === 'failed') { finish(state.error || '更新失败，请检查服务器日志。'); return; }
        if (state.phase === 'restart-required') { finish('代码已更新，需要管理员手动重启服务后刷新网站。'); return; }
        if (state.phase === 'idle') {
          const info = await fetchUpdateInfo(controller.signal);
          if (controller.signal.aborted) return;
          if (info?.currentVersion && info.currentVersion !== update?.currentVersion) { window.location.reload(); return; }
          finish('服务已恢复，但版本尚未变化，请检查更新状态后再刷新。'); return;
        }
      } catch (error) {
        if (error instanceof ApiError && [401, 403].includes(error.status)) { finish(error.userMessage); return; }
      }
      if (!controller.signal.aborted) pollTimer.current = window.setTimeout(() => void poll(), 5000);
    };
    pollTimer.current = window.setTimeout(() => void poll(), 5000);
  }, [canApply, update?.currentVersion]);

  const checkForUpdates = useCallback(async () => {
    if (checking.current || applyingRef.current) return;
    checking.current = true;
    try {
      const next = await fetchUpdateInfo();
      if (!next?.updateAvailable || !next.latestVersion) { setUpdate(null); setCanApply(false); return; }
      let dismissedVersion = '';
      try { dismissedVersion = sessionStorage.getItem(DISMISSED_VERSION_KEY) || ''; } catch { /* ignore */ }
      setUpdate(next);
      setDismissed(dismissedVersion === next.latestVersion);
      const role = getStoredUser()?.role;
      if (role === 'admin' || role === 'super_admin') {
        const state = await fetchSelfUpdateState().catch(() => null);
        setCanApply(Boolean(state?.supported));
      } else setCanApply(false);
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
          {update.releaseNotes && <p className="mt-2 max-h-10 overflow-hidden whitespace-pre-line text-xs leading-5 text-white/65">{update.releaseNotes.replace(/^#{1,6}\s*/gm, '').replace(/\*/g, '')}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canApply && <button type="button" onClick={() => void applyUpdateNow()} disabled={applying} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-300 disabled:opacity-60">
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              {applying ? '更新中…' : '更新服务器'}
            </button>}
            <button type="button" onClick={() => void refreshWebApp()} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-400/10"><RefreshCw className="h-3.5 w-3.5" />刷新网站</button>
            <DownloadLink label="电脑版" asset={update.assets.desktop} />
            <DownloadLink label="Android" asset={update.assets.android} />
            <DownloadLink label="iOS" asset={update.assets.ios} />
            {update.releaseUrl && <a href={update.releaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-1 py-1.5 text-xs text-white/45 transition-colors hover:text-white/80">发布页<ExternalLink className="h-3.5 w-3.5" /></a>}
          </div>
          {applying && <p className="mt-2 text-[11px] text-amber-300">正在更新服务器（拉取代码 → 重建前端 → 自动重启），约 1-3 分钟，完成后页面自动刷新…</p>}
          {applyMessage && <p role="alert" className="mt-2 text-xs text-amber-300">{applyMessage}</p>}
          <p className="mt-2.5 text-[10px] leading-4 text-white/30">
            本项目基于开源项目 <a href="https://github.com/qq01-hub/openmusic" target="_blank" rel="noopener noreferrer" className="underline decoration-white/20 underline-offset-2 hover:text-white/60">OpenMusic</a>（github.com/qq01-hub/openmusic）二次开发
          </p>
        </div>
      </div>
    </aside>
  );
}
