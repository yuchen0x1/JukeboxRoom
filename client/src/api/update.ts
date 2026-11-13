import { getAdminToken } from './auth';
import { ApiError, fetchWithTimeout } from './http';

export interface UpdateAsset {
  name: string;
  url: string;
  size: number | null;
}

export interface UpdateInfo {
  ok: boolean;
  stale?: boolean;
  channel?: 'github';
  releasePageUrl?: string;
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseName: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  releaseNotes: string;
  assets: { desktop: UpdateAsset | null; android: UpdateAsset | null; ios: UpdateAsset | null };
  checkedAt: string;
}

export async function fetchUpdateInfo(signal?: AbortSignal): Promise<UpdateInfo | null> {
  try {
    const response = await fetch(`/api/update?ts=${Date.now()}`, { cache: 'no-store', signal });
    if (!response.ok) return null;
    const data = await response.json() as UpdateInfo;
    if (!data?.ok || !data.assets || typeof data.updateAvailable !== 'boolean') return null;
    return data;
  } catch {
    return null;
  }
}


export interface SelfUpdateState {
  supported: boolean;
  phase: 'idle' | 'checking' | 'running' | 'restarting' | 'restart-required' | 'failed';
  error?: string | null;
}

async function selfUpdateRequest(path: string, method: 'GET' | 'POST', signal?: AbortSignal) {
  const token = getAdminToken();
  if (!token) throw new ApiError('请先以管理员身份登录', { status: 401 });
  const response = await fetchWithTimeout(path, { method, signal, cache: 'no-store', headers: { Authorization: `Bearer ${token}` } }, 15000);
  const body = await response.json().catch(() => null) as (SelfUpdateState & { ok?: boolean; started?: boolean; already?: boolean }) | null;
  if (!response.ok || body?.ok !== true) {
    throw new ApiError(body?.error || '服务器未接受更新请求', { status: response.status });
  }
  return body;
}

export async function fetchSelfUpdateState(signal?: AbortSignal): Promise<SelfUpdateState> {
  return selfUpdateRequest('/api/update/apply/status', 'GET', signal);
}

export async function startServerUpdate(signal?: AbortSignal): Promise<void> {
  const result = await selfUpdateRequest('/api/update/apply', 'POST', signal);
  if (!result.started && !result.already) throw new Error('服务器未启动更新，请稍后重试');
}
