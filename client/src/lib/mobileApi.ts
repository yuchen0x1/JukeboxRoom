import { Capacitor } from '@capacitor/core';
import { getMobileMetingUrl } from './mobileSettings';

export function isAndroidRuntime(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** 用系统浏览器打开外部链接：其余环境 window.open；Android 的 WebView 未实现 window.open 新窗口，走导航交给系统处理 */
export async function openExternalUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('无法打开此链接');
  }
  if (!isAndroidRuntime()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  window.location.assign(url);
}

export function resolveMobileApiUrl(value: string): string {
  if (!value.trim() || !isAndroidRuntime()) return value;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin || parsed.pathname !== '/api/meting') return value;
    const target = new URL(getMobileMetingUrl());
    target.search = parsed.search;
    return target.toString();
  } catch {
    return value;
  }
}
