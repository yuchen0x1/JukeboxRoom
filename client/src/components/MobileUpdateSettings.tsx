import { useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Download, RefreshCw, ScrollText } from 'lucide-react';
import { fetchMobileReleases, selectAndroidUpdate } from '../api/mobileUpdates';
import { openExternalUrl } from '../lib/mobileApi';
import ChangelogViewer from './ChangelogViewer';

export default function MobileUpdateSettings() {
  const [version, setVersion] = useState(__APP_VERSION__);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('按 Android 实际发布的安装包检查更新。');
  const [update, setUpdate] = useState<ReturnType<typeof selectAndroidUpdate>>(null);
  const [showHistory, setShowHistory] = useState(false);
  const active = useRef(false);
  const checkingRef = useRef(false);
  useEffect(() => {
    active.current = true;
    void App.getInfo().then((info) => { if (active.current) setVersion(info.version); }).catch(() => undefined);
    return () => { active.current = false; };
  }, []);

  const check = async () => {
    if (checkingRef.current) return;
    checkingRef.current = true; setChecking(true); setUpdate(null);
    try {
      const next = selectAndroidUpdate(await fetchMobileReleases(), version);
      if (!active.current) return;
      setUpdate(next);
      setMessage(!next ? '暂未找到 Android 正式下载资产，可到发布页查看。' : next.updateAvailable
        ? `发现 Android v${next.version}。安装前请核对签名与现有版本兼容，并备份本机数据。`
        : `当前没有更高版本的 Android 安装包；最新可下载版本为 v${next.version}。`);
    } catch (error) {
      if (active.current) setMessage(error instanceof Error ? error.message : '更新检查失败，请稍后重试');
    } finally {
      checkingRef.current = false;
      if (active.current) setChecking(false);
    }
  };

  return (
    <section className="android-settings-section">
      <h2>版本与更新</h2>
      <p className="android-settings-note">当前 Android 版本 v{version}</p>
      <button type="button" className="android-setting-row" onClick={() => void check()} disabled={checking}>
        <span><RefreshCw className={checking ? 'is-spinning' : ''} aria-hidden="true" />{checking ? '正在检查…' : '检查 Android 更新'}</span>
      </button>
      <p className="android-settings-note" role="status">{message}</p>
      {update?.updateAvailable && <button type="button" className="android-setting-row" onClick={() => void openExternalUrl(update.downloadUrl)}><span><Download aria-hidden="true" />下载 Android v{update.version}</span></button>}
      <button type="button" className="android-setting-row" onClick={() => setShowHistory(true)}><span><ScrollText aria-hidden="true" />更新日志</span></button>
      {showHistory && <div className="android-dialog-scrim"><section className="android-changelog-dialog" role="dialog" aria-modal="true" aria-labelledby="changelog-title"><ChangelogViewer onClose={() => setShowHistory(false)} /></section></div>}
    </section>
  );
}
