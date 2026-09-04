import { clearAuthToken, getAuthToken } from '../lib/authToken';

const DEFAULT_TIMEOUT_MS = 10000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(init.headers);
  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', 'Bearer ' + token);
  }

  try {
    const response = await fetch(input, { ...init, headers, signal: controller.signal });
    const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    if (response.status === 401 && token && !requestUrl.includes('/api/auth/')) {
      clearAuthToken();
      window.dispatchEvent(new CustomEvent('openmusic:auth-expired'));
    }
    return response;
  } finally {
    window.clearTimeout(timer);
  }
}
