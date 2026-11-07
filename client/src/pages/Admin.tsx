import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getStoredUser, adminLogout, getAdminToken, type AdminUser } from '../api/auth';
import {
  fetchAdminUsers, setUserBan, setUserRole, type AdminUserRow,
  fetchAdminRooms, adminAnnounceRoom, adminCloseRoom, type AdminRoomRow,
  fetchAuditLogs, type AuditLogRow,
  fetchAdminTasks, fetchTaskRuns, runTask, cancelTask, type TaskDefinition, type TaskRun,
  fetchLibrarySongs, triggerLibraryScan, type LocalSong,
  fetchAutodjStatus, setAutodjEnabled, type AutodjStatus,
  fetchSystemHealth, type HealthInfo,
} from '../api/admin';

type Tab = 'overview' | 'users' | 'rooms' | 'tasks' | 'audit' | 'library' | 'autodj';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'users', label: '用户' },
  { key: 'rooms', label: '房间' },
  { key: 'tasks', label: '任务' },
  { key: 'audit', label: '审计' },
  { key: 'library', label: '曲库' },
  { key: 'autodj', label: 'AutoDJ' },
];

const ROLE_LABEL: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  moderator: '协管',
  user: '用户',
};

const ROLE_BADGE_CLASS: Record<string, string> = {
  super_admin: 'role-badge role-badge-owner',
  admin: 'role-badge role-badge-admin',
  moderator: 'role-badge role-badge-admin',
  user: 'role-badge role-badge-user',
};

function fmtTime(ts: string | null | undefined): string {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function fmtDuration(ms?: number): string {
  if (!ms || ms <= 0) return '-';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function statusPill(status: string) {
  const map: Record<string, string> = {
    active: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
    banned: 'text-red-300 border-red-400/40 bg-red-400/10',
    running: 'text-cyan-300 border-cyan-400/40 bg-cyan-400/10',
    success: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
    failed: 'text-red-300 border-red-400/40 bg-red-400/10',
    pending: 'text-amber-300 border-amber-400/40 bg-amber-400/10',
    cancelled: 'text-slate-300 border-slate-400/40 bg-slate-400/10',
    queued: 'text-sky-300 border-sky-400/40 bg-sky-400/10',
  };
  const cls = map[status] || 'text-slate-300 border-slate-400/30 bg-slate-400/10';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {status}
    </span>
  );
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`mineradio-glass-card rounded-2xl p-4 ${className}`}>
      <h3 className="mb-3 font-mono text-[11px] font-semibold tracking-widest text-[var(--color-accent)]">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="mineradio-glass-card flex flex-col gap-1 rounded-2xl p-4">
      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${accent ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>{value}</span>
    </div>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const user = getStoredUser() as AdminUser | null;
  const [tab, setTab] = useState<Tab>('overview');
  const [authLoading, setAuthLoading] = useState(true);

  // 未登录则重定向到登录页
  useEffect(() => {
    if (!getAdminToken()) {
      navigate('/admin/login', { replace: true });
      return;
    }
    setAuthLoading(false);
  }, [navigate]);

  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [userStats, setUserStats] = useState({ total: 0 });
  const [roomStats, setRoomStats] = useState({ total: 0 });
  const [taskStats, setTaskStats] = useState({ total: 0, running: 0 });
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [rooms, setRooms] = useState<AdminRoomRow[]>([]);
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [audits, setAudits] = useState<AuditLogRow[]>([]);
  const [songs, setSongs] = useState<LocalSong[]>([]);
  const [autodj, setAutodj] = useState<AutodjStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadHealth = useCallback(async () => {
    try { setHealth(await fetchSystemHealth()); } catch { /* 健康检查失败忽略 */ }
  }, []);
  const loadUsers = useCallback(async () => {
    try {
      const data = await fetchAdminUsers();
      setUsers(data.users);
      setUserStats({ total: data.total });
    } catch (e) { setError(e instanceof Error ? e.message : '加载用户失败'); }
  }, []);
  const loadRooms = useCallback(async () => {
    try {
      const data = await fetchAdminRooms();
      setRooms(data.rooms);
      setRoomStats({ total: data.total });
    } catch (e) { setError(e instanceof Error ? e.message : '加载房间失败'); }
  }, []);
  const loadTasks = useCallback(async () => {
    try {
      const data = await fetchAdminTasks();
      setTasks(data.tasks);
      setTaskStats({ total: data.total, running: data.tasks.filter(t => t.running).length });
      const r = await fetchTaskRuns({ limit: 30 });
      setRuns(r.runs);
    } catch (e) { setError(e instanceof Error ? e.message : '加载任务失败'); }
  }, []);
  const loadAudits = useCallback(async () => {
    try {
      const data = await fetchAuditLogs({ limit: 60 });
      setAudits(data.auditLogs);
    } catch (e) { setError(e instanceof Error ? e.message : '加载审计失败'); }
  }, []);
  const loadLibrary = useCallback(async () => {
    try {
      const data = await fetchLibrarySongs();
      setSongs(data.songs);
    } catch (e) { setError(e instanceof Error ? e.message : '加载曲库失败'); }
  }, []);
  const loadAutodj = useCallback(async () => {
    try { setAutodj(await fetchAutodjStatus()); } catch (e) { setError(e instanceof Error ? e.message : '加载AutoDJ失败'); }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadHealth(), loadUsers(), loadRooms(), loadTasks(), loadAudits(), loadLibrary(), loadAutodj()]);
  }, [loadHealth, loadUsers, loadRooms, loadTasks, loadAudits, loadLibrary, loadAutodj]);

  useEffect(() => {
    if (!getAdminToken()) return;
    void loadAll();
    const timer = setInterval(() => void loadAll(), 20000);
    return () => clearInterval(timer);
  }, [loadAll]);

  const doToggleBan = async (u: AdminUserRow) => {
    setBusy(true); setError('');
    try { await setUserBan(u.id); await loadUsers(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); } finally { setBusy(false); }
  };
  const doChangeRole = async (u: AdminUserRow, role: AdminUserRow['role']) => {
    if (role === u.role || user?.role !== 'super_admin') return;
    if (!window.confirm(`确认将 ${u.username} 的角色调整为「${ROLE_LABEL[role]}」？`)) return;
    setBusy(true); setError('');
    try { await setUserRole(u.id, role); await loadUsers(); } catch (e) { setError(e instanceof Error ? e.message : '角色调整失败'); } finally { setBusy(false); }
  };
  const doAnnounce = async (r: AdminRoomRow) => {
    const text = window.prompt(`向房间「${r.name}」发送公告：`, '');
    if (text === null) return;
    setBusy(true); setError('');
    try { await adminAnnounceRoom(r.id, { enabled: Boolean(text.trim()), text: text.trim() }); } catch (e) { setError(e instanceof Error ? e.message : '公告失败'); } finally { setBusy(false); }
  };
  const doCloseRoom = async (r: AdminRoomRow) => {
    if (!window.confirm(`确认强制关闭房间「${r.name}」(${r.id})？此操作会解散房间。`)) return;
    setBusy(true); setError('');
    try { await adminCloseRoom(r.id); await loadRooms(); } catch (e) { setError(e instanceof Error ? e.message : '关闭失败'); } finally { setBusy(false); }
  };
  const doRunTask = async (name: string) => {
    setBusy(true); setError('');
    try { await runTask(name); await loadTasks(); } catch (e) { setError(e instanceof Error ? e.message : '触发任务失败'); } finally { setBusy(false); }
  };
  const doCancelTask = async (name: string) => {
    setBusy(true); setError('');
    try { await cancelTask(name); await loadTasks(); } catch (e) { setError(e instanceof Error ? e.message : '取消失败'); } finally { setBusy(false); }
  };
  const doScanLibrary = async () => {
    setBusy(true); setError('');
    try { await triggerLibraryScan(); await loadLibrary(); } catch (e) { setError(e instanceof Error ? e.message : '扫描失败'); } finally { setBusy(false); }
  };
  const doToggleAutodj = async () => {
    if (!autodj) return;
    setBusy(true); setError('');
    try { await setAutodjEnabled(!autodj.enabled); await loadAutodj(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); } finally { setBusy(false); }
  };
  const doLogout = async () => {
    await adminLogout();
    navigate('/admin/login', { replace: true });
  };

  if (authLoading) {
    return <div className="flex h-dvh items-center justify-center bg-[#0b0f14] text-sm text-[var(--color-text-muted)]">加载中...</div>;
  }

  return (
    <div className="cyber-grid-background flex h-dvh w-full overflow-hidden bg-[#0b0f14] text-[var(--color-text)]">
      {/* 侧边栏 */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-[var(--color-border)] bg-[#0e141c]/90">
        <div className="flex h-14 items-center gap-2 border-b border-[var(--color-border)] px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-primary-bg)] text-xs font-black text-[var(--color-accent)]">JR</div>
          <span className="font-mono text-xs font-bold tracking-widest">ADMIN</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                tab === t.key
                  ? 'bg-[var(--color-primary-bg)] text-[var(--color-accent)] shadow-[inset_0_0_0_1px_rgba(101,230,207,0.2),0_0_14px_rgba(101,230,207,0.08)]'
                  : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-[var(--color-border)] p-3">
          <div className="mb-2 truncate text-xs text-[var(--color-text-muted)]">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-success)] shadow-[0_0_8px_var(--color-success)]" />
            {user?.username || '未登录'}
          </div>
          <div className="flex gap-2">
            <Link to="/" className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-center text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">首页</Link>
            <button onClick={doLogout} className="flex-1 rounded-lg border border-[var(--color-danger)]/40 px-2 py-1.5 text-xs text-[var(--color-danger-soft)] hover:bg-[var(--color-danger-bg)]">退出</button>
          </div>
        </div>
      </aside>

      {/* 主区 */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5">
          <h1 className="font-mono text-sm font-bold tracking-widest">CONSOLE · {TABS.find(t => t.key === tab)?.label}</h1>
          <span className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
            实时监控中
          </span>
        </header>

        {error && (
          <div className="mx-5 mt-3 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-[var(--color-danger-soft)]">
            {error} <button className="ml-2 underline" onClick={() => setError('')}>关闭</button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'overview' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat label="用户" value={userStats.total} />
                <Stat label="房间" value={roomStats.total} accent />
                <Stat label="任务" value={`${taskStats.running}/${taskStats.total}`} />
                <Stat label="曲库" value={songs.length} />
              </div>
              {health && (
                <Card title="SYSTEM HEALTH">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><span className="text-[var(--color-text-muted)]">状态 </span><span className="text-[var(--color-success)]">{health.status}</span></div>
                    <div><span className="text-[var(--color-text-muted)]">存储 </span>{health.storage}</div>
                    <div><span className="text-[var(--color-text-muted)]">ok </span>{String(health.ok)}</div>
                  </div>
                </Card>
              )}
              <Card title="AUTODJ">
                {autodj ? (
                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <div><span className="text-[var(--color-text-muted)]">启用 </span>{autodj.enabled ? '开' : '关'}</div>
                    <div><span className="text-[var(--color-text-muted)]">队列 </span>{autodj.queueLength} 首</div>
                    <div><span className="text-[var(--color-text-muted)]">活跃时段 </span>{autodj.activeHours.start}:00-{autodj.activeHours.end}:00</div>
                    <div><span className="text-[var(--color-text-muted)]">已生成 </span>{autodj.stats.generated ?? 0}</div>
                  </div>
                ) : <div className="text-xs text-[var(--color-text-muted)]">暂无数据</div>}
              </Card>
            </div>
          )}

          {tab === 'users' && (
            <Card title={`USER MANAGEMENT · ${userStats.total}`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
                      <th className="px-3 py-2">用户名</th>
                      <th className="px-3 py-2">角色</th>
                      <th className="px-3 py-2">状态</th>
                      <th className="px-3 py-2">创建时间</th>
                      <th className="px-3 py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className="border-b border-[var(--color-border)]/60 last:border-0 hover:bg-white/[0.03]">
                        <td className="px-3 py-2 font-medium">{u.username}</td>
                        <td className="px-3 py-2">
                          {user?.role === 'super_admin' && u.id !== user.id ? (
                            <select
                              value={u.role}
                              onChange={(event) => void doChangeRole(u, event.target.value as AdminUserRow['role'])}
                              disabled={busy}
                              className="rounded-md border border-[var(--color-accent)]/30 bg-black/20 px-2 py-1 text-xs text-[var(--color-text)] outline-none"
                            >
                              <option value="super_admin">超级管理员</option>
                              <option value="admin">管理员</option>
                              <option value="moderator">协管</option>
                              <option value="user">用户</option>
                            </select>
                          ) : (
                            <span className={ROLE_BADGE_CLASS[u.role] || 'role-badge'}>{ROLE_LABEL[u.role] || u.role}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{statusPill(u.status)}</td>
                        <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{fmtTime(u.createdAt)}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => doToggleBan(u)}
                            disabled={busy}
                            className={`rounded-lg border px-2.5 py-1 text-xs transition ${u.status === 'banned' ? 'border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10' : 'border-red-400/40 text-red-300 hover:bg-red-400/10'} disabled:opacity-50`}
                          >
                            {u.status === 'banned' ? '解封' : '封禁'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'rooms' && (
            <Card title={`ROOM MANAGEMENT · ${roomStats.total}`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
                      <th className="px-3 py-2">房间号</th>
                      <th className="px-3 py-2">名称</th>
                      <th className="px-3 py-2">在线</th>
                      <th className="px-3 py-2">当前歌曲</th>
                      <th className="px-3 py-2">状态</th>
                      <th className="px-3 py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map(r => (
                      <tr key={r.id} className="border-b border-[var(--color-border)]/60 last:border-0 hover:bg-white/[0.03]">
                        <td className="px-3 py-2 font-mono text-[var(--color-accent)]">{r.id}</td>
                        <td className="px-3 py-2 font-medium">{r.name}{r.hasPassword && <span className="ml-1 text-xs text-amber-300">🔒</span>}</td>
                        <td className="px-3 py-2">{r.userCount} 人</td>
                        <td className="px-3 py-2 max-w-[220px] truncate text-xs text-[var(--color-text-muted)]">
                          {r.currentSong ? `${r.currentSong.name} - ${r.currentSong.artist}` : '未播放'}
                        </td>
                        <td className="px-3 py-2">
                          {r.isPlaying ? statusPill('running') : <span className="text-[10px] text-[var(--color-text-muted)]">停止</span>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button onClick={() => doAnnounce(r)} disabled={busy} className="rounded-lg border border-[var(--color-accent)]/40 px-2.5 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-primary-bg)] disabled:opacity-50">公告</button>
                            <button onClick={() => doCloseRoom(r)} disabled={busy} className="rounded-lg border border-red-400/40 px-2.5 py-1 text-xs text-red-300 hover:bg-red-400/10 disabled:opacity-50">关闭</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'tasks' && (
            <div className="flex flex-col gap-4">
              <Card title={`TASK CENTER · ${taskStats.running} 运行中 / ${taskStats.total}`}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {tasks.map(t => (
                    <div key={t.name} className="mineradio-glass-card rounded-xl p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-semibold">{t.title}</span>
                        {t.running ? statusPill('running') : statusPill('idle')}
                      </div>
                      <p className="mb-2 text-xs text-[var(--color-text-muted)]">{t.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                          最近: {t.latestRun ? `${t.latestRun.status} · ${t.latestRun.progress}%` : '未运行'}
                        </span>
                        <div className="flex gap-2">
                          {t.running
                            ? <button onClick={() => doCancelTask(t.name)} disabled={busy} className="rounded-lg border border-amber-400/40 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-400/10 disabled:opacity-50">取消</button>
                            : <button onClick={() => doRunTask(t.name)} disabled={busy} className="rounded-lg border border-[var(--color-accent)]/40 px-2.5 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-primary-bg)] disabled:opacity-50">运行</button>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="RUN HISTORY">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
                        <th className="px-3 py-2">任务</th>
                        <th className="px-3 py-2">状态</th>
                        <th className="px-3 py-2">进度</th>
                        <th className="px-3 py-2">触发</th>
                        <th className="px-3 py-2">消息</th>
                        <th className="px-3 py-2">时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map(r => (
                        <tr key={r.id} className="border-b border-[var(--color-border)]/60 last:border-0 hover:bg-white/[0.03]">
                          <td className="px-3 py-2 font-medium">{r.name}</td>
                          <td className="px-3 py-2">{statusPill(r.status)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-[var(--color-accent)] transition-all" style={{ width: `${r.progress || 0}%` }} />
                              </div>
                              <span className="text-[10px] text-[var(--color-text-muted)]">{r.progress || 0}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{r.trigger}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate text-xs text-[var(--color-text-muted)]">{r.message}</td>
                          <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{fmtTime(r.createdAt || r.startedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {tab === 'audit' && (
            <Card title="AUDIT LOG">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
                      <th className="px-3 py-2">时间</th>
                      <th className="px-3 py-2">操作者</th>
                      <th className="px-3 py-2">动作</th>
                      <th className="px-3 py-2">资源</th>
                      <th className="px-3 py-2">结果</th>
                      <th className="px-3 py-2">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audits.map((a, i) => (
                      <tr key={i} className="border-b border-[var(--color-border)]/60 last:border-0 hover:bg-white/[0.03]">
                        <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{fmtTime(a.timestamp)}</td>
                        <td className="px-3 py-2 font-medium">{a.actor}</td>
                        <td className="px-3 py-2 font-mono text-xs text-[var(--color-accent)]">{a.action}</td>
                        <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{a.resource}</td>
                        <td className="px-3 py-2">{statusPill(a.result)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-[var(--color-text-muted)]">{a.ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'library' && (
            <Card title={`LOCAL LIBRARY · ${songs.length}`}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-[var(--color-text-muted)]">本地曲库歌曲数量</span>
                <button onClick={doScanLibrary} disabled={busy} className="rounded-lg border border-[var(--color-accent)]/40 px-3 py-1.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-primary-bg)] disabled:opacity-50">
                  {busy ? '扫描中...' : '重新扫描'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
                      <th className="px-3 py-2">标题</th>
                      <th className="px-3 py-2">歌手</th>
                      <th className="px-3 py-2">专辑</th>
                      <th className="px-3 py-2">时长</th>
                    </tr>
                  </thead>
                  <tbody>
                    {songs.map(s => (
                      <tr key={s.id} className="border-b border-[var(--color-border)]/60 last:border-0 hover:bg-white/[0.03]">
                        <td className="px-3 py-2 font-medium">{s.title}</td>
                        <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{s.artist}</td>
                        <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{s.album}</td>
                        <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{fmtDuration(s.duration)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'autodj' && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card title="AUTODJ STATUS">
                {autodj ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">AutoDJ</span>
                      <button
                        onClick={doToggleAutodj}
                        disabled={busy}
                        className={`relative h-6 w-11 rounded-full transition ${autodj.enabled ? 'bg-[var(--color-accent)]' : 'bg-white/15'}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${autodj.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-[var(--color-text-muted)]">活跃时段 </span>{autodj.activeHours.start}:00-{autodj.activeHours.end}:00</div>
                      <div><span className="text-[var(--color-text-muted)]">低水位 </span>{autodj.config.lowWaterMark}</div>
                      <div><span className="text-[var(--color-text-muted)]">避同曲 </span>{autodj.config.avoidSameSong}</div>
                      <div><span className="text-[var(--color-text-muted)]">避同歌手 </span>{autodj.config.avoidSameArtist}</div>
                      <div><span className="text-[var(--color-text-muted)]">队列 </span>{autodj.queueLength} 首</div>
                      <div><span className="text-[var(--color-text-muted)]">已生成/播放 </span>{autodj.stats.generated ?? 0}/{autodj.stats.played ?? 0}</div>
                    </div>
                  </div>
                ) : <div className="text-xs text-[var(--color-text-muted)]">加载中...</div>}
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}