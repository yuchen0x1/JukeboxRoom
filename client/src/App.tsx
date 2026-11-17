import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import DesktopTitleBar from './components/DesktopTitleBar';
import UpdateNotice from './components/UpdateNotice';
import { isAndroidRuntime } from './lib/mobileApi';
import { LanguageSelect, LocaleProvider, useI18n } from './lib/i18n';

const Home = lazy(() => import('./pages/Home'));
const Room = lazy(() => import('./pages/Room'));
const TvDisplay = lazy(() => import('./pages/TvDisplay'));
const Admin = lazy(() => import('./pages/Admin'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const DesktopMusicApp = lazy(() => import('./components/DesktopMusicApp'));
const AndroidMusicApp = lazy(() => import('./components/AndroidMusicApp'));

function RouteFallback() {
  const { t } = useI18n();
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center bg-netease-dark text-netease-muted">
      <div className="flex items-center gap-2 text-sm">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-netease-muted/30 border-t-netease-red" />
        {t('loading')}
      </div>
    </div>
  );
}

/** Switch theme and persist to localStorage. Exported for use by theme toggle UI. */
export function setTheme(theme: 'light' | 'dark' | 'auto') {
  try { localStorage.setItem('theme', theme); } catch { /* The theme can still apply for this session. */ }
  document.documentElement.setAttribute('data-theme', theme);
}

/** Read current theme setting without triggering re-render. */
export function getTheme(): 'light' | 'dark' | 'auto' {
  try {
    const theme = localStorage.getItem('theme');
    return theme === 'light' || theme === 'auto' ? theme : 'dark';
  } catch { return 'dark'; }
}

function AppContent() {
  const isDesktop = Boolean(window.jukeboxWindow);
  const isAndroid = isAndroidRuntime();

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#0b0f14]">
      <div className="pointer-events-none fixed right-3 top-2 z-[100] sm:right-4">
        <div className="pointer-events-auto"><LanguageSelect /></div>
      </div>
      {isDesktop && <DesktopTitleBar />}
      <div className="min-h-0 flex-1 overflow-hidden">
        {!isDesktop && !isAndroid && <UpdateNotice />}
        <Suspense fallback={<RouteFallback />}>
          {isDesktop ? (
            <DesktopMusicApp />
          ) : isAndroid ? (
            <AndroidMusicApp />
          ) : (
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/room/:roomId" element={<Room />} />
              <Route path="/tv/:roomId" element={<TvDisplay />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/login" element={<AdminLogin />} />
            </Routes>
          )}
        </Suspense>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LocaleProvider>
      <AppContent />
    </LocaleProvider>
  );
}
