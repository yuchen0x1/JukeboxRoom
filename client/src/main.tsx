import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import './index.css';
import './styles/glass.css';

// Theme initialization: set data-theme before first render to avoid flash.
// 未显式选择时强制深色——跟随系统的 light 主题会把房间渲染成灰白玻璃，观感很差。
(function initTheme() {
  let saved: string | null = null;
  try { saved = localStorage.getItem('theme'); } catch { /* Restricted WebView/private storage. */ }
  const theme = saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
})();
import { applyPageSeo } from './lib/seo';
import { isDesktopRuntime } from './lib/desktopRuntime';
import { isAndroidRuntime } from './lib/mobileApi';

applyPageSeo();
const isDesktop = isDesktopRuntime();
const isAndroid = isAndroidRuntime();
if (isDesktop) {
  document.title = 'JukeboxRoom - 个人音乐播放器';
} else if (!isAndroid) {
  void import('./lib/debugTools').then(({ installOpenMusicDebug }) => installOpenMusicDebug());
  void import('./lib/visibilitySync').then(({ installVisibilitySync }) => installVisibilitySync());
  void import('./lib/sessionBootstrap').then(({ ensureSessionBootstrap }) => (
    ensureSessionBootstrap().then(() => import('./hooks/useSocket'))
  )).then(({ warmUpSocketSession }) => warmUpSocketSession());
}

async function mountApplication() {
  if (isDesktop || isAndroid) {
    const { hydrateDesktopMusicState } = await import('./stores/desktopMusicStore');
    await hydrateDesktopMusicState();
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppErrorBoundary>
    </StrictMode>,
  );
}

void mountApplication();

// PWA（F1）：生产构建下注册 Service Worker，提供离线壳层与静态资源缓存。
if (!isDesktop && !isAndroid && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 注册失败不应影响主流程（如非 HTTPS / 不支持）。
    });
  });
}
