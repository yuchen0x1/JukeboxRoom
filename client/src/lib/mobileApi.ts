import { Capacitor } from '@capacitor/core';

const METING_API_ORIGIN = 'https://api.injahow.cn';

export function isAndroidRuntime(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export function resolveMobileApiUrl(value: string): string {
  if (!value.trim() || !isAndroidRuntime()) return value;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin || parsed.pathname !== '/api/meting') return value;
    parsed.pathname = '/meting/';
    parsed.hostname = new URL(METING_API_ORIGIN).hostname;
    parsed.protocol = 'https:';
    parsed.port = '';
    return parsed.toString();
  } catch {
    return value;
  }
}
