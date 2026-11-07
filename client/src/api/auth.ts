const TOKEN_KEY = 'jukebox_admin_token';
const REFRESH_KEY = 'jukebox_admin_refresh';

export interface AdminUser {
  id: string;
  username: string;
  role: 'super_admin' | 'admin' | 'moderator' | 'user';
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: number;
  user: AdminUser;
}

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem('jukebox_admin_user');
    return raw ? JSON.parse(raw) as AdminUser : null;
  } catch {
    return null;
  }
}

export function setAuthSession(session: AuthSession): void {
  localStorage.setItem(TOKEN_KEY, session.accessToken);
  localStorage.setItem(REFRESH_KEY, session.refreshToken);
  localStorage.setItem('jukebox_admin_user', JSON.stringify(session.user));
}

export function clearAuthSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem('jukebox_admin_user');
}

export async function adminLogin(username: string, password: string): Promise<AuthSession> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || '用户名或密码错误');
  }
  return data as AuthSession;
}

export async function registerUser(username: string, password: string): Promise<AdminUser> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || '注册失败');
  }
  return (data as { user: AdminUser }).user;
}

export async function adminLogout(): Promise<void> {
  try {
    const refresh = localStorage.getItem(REFRESH_KEY);
    if (refresh) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
    }
  } catch {
    // 登出失败不阻断本地清理
  } finally {
    clearAuthSession();
  }
}

/** 带 Bearer 的 fetch 封装，401 时清空会话 */
export async function adminFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const token = getAdminToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    clearAuthSession();
  }
  return response;
}