import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import UpdateNotice from './components/UpdateNotice';

const Home = lazy(() => import('./pages/Home'));
const Room = lazy(() => import('./pages/Room'));
const TvDisplay = lazy(() => import('./pages/TvDisplay'));
const Login = lazy(() => import('./pages/Login'));

function RouteFallback() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center bg-netease-dark text-netease-muted">
      <div className="flex items-center gap-2 text-sm">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-netease-muted/30 border-t-netease-red" />
        加载中...
      </div>
    </div>
  );
}

/** Switch theme and persist to localStorage. Exported for use by theme toggle UI. */
export function setTheme(theme: 'light' | 'dark' | 'auto') {
  localStorage.setItem('theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
}

/** Read current theme setting without triggering re-render. */
export function getTheme(): 'light' | 'dark' | 'auto' {
  return (localStorage.getItem('theme') as 'light' | 'dark' | 'auto') ?? 'auto';
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleAuthExpired = () => {
      if (location.pathname === '/login') return;
      navigate('/login', {
        replace: true,
        state: { reason: 'session-expired' },
      });
    };
    window.addEventListener('openmusic:auth-expired', handleAuthExpired);
    return () => window.removeEventListener('openmusic:auth-expired', handleAuthExpired);
  }, [location.pathname, navigate]);

  return (
    <div className="h-full">
      <UpdateNotice />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/room/:roomId" element={<Room />} />
          <Route path="/tv/:roomId" element={<TvDisplay />} />
        </Routes>
      </Suspense>
    </div>
  );
}
