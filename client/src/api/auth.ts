import { fetchWithTimeout } from './http';
import { setAuthToken } from '../lib/authToken';

export interface AuthUser {
  id: string;
  username: string;
  role: string;
}


async function postAuth(path: 'login' | 'register', username: string, password: string) {
  const res = await fetchWithTimeout('/api/auth/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({})) as {
    accessToken?: string;
    user?: AuthUser;
    error?: string;
  };
  if (!res.ok || !data.user) {
    throw new Error(data.error || '认证失败，请稍后重试');
  }
  if (data.accessToken) setAuthToken(data.accessToken);
  return data.user;
}

export function login(username: string, password: string): Promise<AuthUser> {
  return postAuth('login', username, password);
}

export function register(username: string, password: string): Promise<AuthUser> {
  return postAuth('register', username, password);
}
