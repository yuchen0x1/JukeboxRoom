import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchUpdateInfo, type UpdateInfo } from '../api/update';

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

export default function VersionStatus() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<'latest' | 'error' | null>(null);

  const check = useCallback(async (manual = false) => {
    setChecking(true);
    try {
      const next = await fetchUpdateInfo();
      setInfo(next);
      // 「已是最新 / 检测失败」只作为手动点击的反馈，避免每次进页都展示
      if (manual) setNotice(!next ? 'error' : next.updateAvailable ? null : 'latest');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [check]);

  const version = info?.currentVersion || __APP_VERSION__ || '';

  return (
    <p className="flex items-center justify-center gap-2.5 text-xs text-white/35">
      <span>JukeboxRoom{version ? ` v${version}` : ''}</span>
      {info?.updateAvailable && info.latestVersion && (
        <a
          href={info.releaseUrl || info.releasePageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-300/90 transition-colors hover:text-emerald-200"
        >
          发现新版本 v{info.latestVersion}
        </a>
      )}
      {!info?.updateAvailable && notice === 'latest' && <span>已是最新版本</span>}
      {!info?.updateAvailable && notice === 'error' && <span>暂时无法检测更新</span>}
      <button
        type="button"
        onClick={() => void check(true)}
        disabled={checking}
        className="inline-flex items-center gap-1 text-white/45 transition-colors hover:text-white/80 disabled:opacity-50"
      >
        <RefreshCw className={`h-3 w-3${checking ? ' animate-spin' : ''}`} />
        检查更新
      </button>
    </p>
  );
}
