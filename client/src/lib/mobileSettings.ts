export const DEFAULT_MOBILE_METING_URL = 'https://api.injahow.cn/meting/';
const STORAGE_KEY = 'jukeboxroom:mobile-meting-url:v1';

export function normalizeMobileMetingUrl(value: string): string {
  if (!value.trim()) return DEFAULT_MOBILE_METING_URL;
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('请输入完整的 HTTPS 音源服务地址'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('音源地址须使用 HTTPS，且不包含账号、密码、查询参数或片段');
  }
  return url.toString();
}

export function getMobileMetingUrl(): string {
  try { return normalizeMobileMetingUrl(localStorage.getItem(STORAGE_KEY) || ''); }
  catch { return DEFAULT_MOBILE_METING_URL; }
}

export function saveMobileMetingUrl(value: string): string {
  const normalized = normalizeMobileMetingUrl(value);
  try { localStorage.setItem(STORAGE_KEY, normalized); }
  catch { throw new Error('无法保存音源设置，请检查本机存储空间'); }
  return normalized;
}
