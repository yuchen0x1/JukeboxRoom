import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import './index.css';
import './styles/glass.css';

// Theme initialization: set data-theme before first render to avoid flash
(function initTheme() {
  const saved = localStorage.getItem('theme');
  const theme = saved === 'light' || saved === 'dark' ? saved : 'auto';
  document.documentElement.setAttribute('data-theme', theme);
})();
import { installOpenMusicDebug } from './lib/debugTools';
import { installVisibilitySync } from './lib/visibilitySync';
import { applyPageSeo } from './lib/seo';
import { ensureSessionBootstrap } from './lib/sessionBootstrap';
import { warmUpSocketSession } from './hooks/useSocket';

installOpenMusicDebug();
installVisibilitySync();
applyPageSeo();
void ensureSessionBootstrap().then(() => warmUpSocketSession());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
);

// PWA（F1）：生产构建下注册 Service Worker，提供离线壳层与静态资源缓存。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 注册失败不应影响主流程（如非 HTTPS / 不支持）。
    });
  });
}
