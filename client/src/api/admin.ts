import { adminFetch } from './auth';

/* ---------- 通用 ---------- */
export async function parseAdminJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { message?: string; error?: string }).message
      || (data as { error?: string }).error
      || `请求失败 (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

/* ---------- 用户管理 ---------- */
export interface AdminUserRow {
  id: string;
  username: string;
  role: 'super_admin' | 'admin' | 'moderator' | 'user';
  status: string;
  createdAt: string;
  bannedAt: string | null;
}

export async function fetchAdminUsers(): Promise<{ users: AdminUserRow[]; total: number }> {
  return parseAdminJson(await adminFetch('/api/admin/users'));
}

export async function setUserBan(id: string): Promise<{ id: string; status: string }> {
  return parseAdminJson(await adminFetch(`/api/admin/users/${id}/ban`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }));
}

export async function setUserRole(
  id: string,
  role: AdminUserRow['role'],
): Promise<{ id: string; role: AdminUserRow['role'] }> {
  return parseAdminJson(await adminFetch(`/api/admin/users/${id}/role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  }));
}

/* ---------- 房间管理 ---------- */
export interface AdminRoomRow {
  id: string;
  name: string;
  hasPassword: boolean;
  isLocked: boolean;
  userCount: number;
  isPlaying: boolean;
  currentSong: { name: string; artist: string } | null;
  queueLength: number;
  createdAt: string;
}

export async function fetchAdminRooms(): Promise<{ rooms: AdminRoomRow[]; total: number }> {
  return parseAdminJson(await adminFetch('/api/admin/rooms'));
}

export async function adminAnnounceRoom(id: string, options: { enabled?: boolean; text?: string }): Promise<unknown> {
  return parseAdminJson(await adminFetch(`/api/admin/rooms/${encodeURIComponent(id)}/announce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  }));
}

export async function adminCloseRoom(id: string): Promise<{ closed: boolean; roomId: string }> {
  return parseAdminJson(await adminFetch(`/api/admin/rooms/${encodeURIComponent(id)}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }));
}

/* ---------- 审计日志 ---------- */
export interface AuditLogRow {
  timestamp: string;
  actor: string;
  action: string;
  resource: string;
  before?: unknown;
  after?: unknown;
  ip: string;
  requestId: string;
  result: string;
}

export async function fetchAuditLogs(params: { actor?: string; action?: string; resource?: string; result?: string; limit?: number } = {}): Promise<{ auditLogs: AuditLogRow[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.actor) qs.set('actor', params.actor);
  if (params.action) qs.set('action', params.action);
  if (params.resource) qs.set('resource', params.resource);
  if (params.result) qs.set('result', params.result);
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return parseAdminJson(await adminFetch(`/api/admin/audit${q ? `?${q}` : ''}`));
}

/* ---------- 任务中心 ---------- */
export interface TaskDefinition {
  name: string;
  title: string;
  description: string;
  defaultIntervalMs: number;
  running: boolean;
  latestRun: TaskRun | null;
}

export interface TaskRun {
  id: string;
  name: string;
  status: string;
  progress: number;
  message: string;
  trigger: string;
  actor: string;
  createdAt?: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: unknown;
}

export async function fetchAdminTasks(): Promise<{ tasks: TaskDefinition[]; total: number }> {
  return parseAdminJson(await adminFetch('/api/admin/tasks'));
}

export async function fetchTaskRuns(params: { name?: string; status?: string; limit?: number } = {}): Promise<{ runs: TaskRun[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.name) qs.set('name', params.name);
  if (params.status) qs.set('status', params.status);
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return parseAdminJson(await adminFetch(`/api/admin/tasks/runs${q ? `?${q}` : ''}`));
}

export async function runTask(name: string): Promise<unknown> {
  return parseAdminJson(await adminFetch(`/api/admin/tasks/${encodeURIComponent(name)}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }));
}

export async function cancelTask(name: string): Promise<{ name: string; cancelled: boolean }> {
  return parseAdminJson(await adminFetch(`/api/admin/tasks/${encodeURIComponent(name)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }));
}

/* ---------- 曲库 ---------- */
export interface LocalSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration?: number;
  size: number;
  source: string;
  deletedAt?: string;
  filePath?: string;
}

export async function fetchLibrarySongs(): Promise<{ songs: LocalSong[]; total: number }> {
  return parseAdminJson(await adminFetch('/api/library/songs'));
}

export async function searchLibrarySongs(query: string): Promise<{ songs: LocalSong[]; total: number }> {
  return parseAdminJson(await adminFetch(`/api/library/search?q=${encodeURIComponent(query)}`));
}

export async function triggerLibraryScan(): Promise<unknown> {
  return parseAdminJson(await adminFetch('/api/library/scan'));
}

/* ---------- AutoDJ ---------- */
export interface AutodjStatus {
  enabled: boolean;
  activeNow: boolean;
  activeHours: { start: number; end: number };
  config: { avoidSameSong: number; avoidSameArtist: number; lowWaterMark: number };
  queueLength: number;
  recentSongIds: string[];
  recentArtists: string[];
  stats: { generated?: number; played?: number };
  lastGeneratedAt: string | null;
  poolProvider: string;
}

export async function fetchAutodjStatus(): Promise<AutodjStatus> {
  return parseAdminJson(await adminFetch('/api/autodj/status'));
}

export async function setAutodjEnabled(enabled: boolean): Promise<{ enabled: boolean }> {
  return parseAdminJson(await adminFetch('/api/autodj/enable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  }));
}

/* ---------- 系统健康 ---------- */
export interface HealthInfo {
  ok: boolean;
  status: string;
  storage: string;
}

export async function fetchSystemHealth(): Promise<HealthInfo> {
  return parseAdminJson(await adminFetch('/api/health'));
}