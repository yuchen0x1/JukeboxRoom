import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminLogin, registerUser, setAuthSession, getAdminToken } from '../api/auth';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  // 已登录则直接跳后台
  useEffect(() => {
    if (getAdminToken()) {
      navigate('/admin', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      if (mode === 'register') {
        await registerUser(username.trim(), password);
        setMode('login');
        setPassword('');
        setNotice('注册成功，请使用新账号登录。普通账号没有管理后台权限。');
      } else {
        const session = await adminLogin(username.trim(), password);
        if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
          throw new Error('该账号不是管理员，无法进入管理后台');
        }
        setAuthSession(session);
        navigate('/admin', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (mode === 'register' ? '注册失败，请重试' : '登录失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cyber-grid-background flex h-dvh w-full items-center justify-center bg-[#0b0f14] px-4">
      <div className="glass-surface glass-surface--modal relative w-full max-w-sm animate-fade-in rounded-2xl p-8">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-accent)] to-transparent" />
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-primary-bg)] text-xl font-black text-[var(--color-accent)] shadow-[0_0_24px_rgba(101,230,207,0.35)]">
            JR
          </div>
          <h1 className="text-lg font-bold tracking-widest text-[var(--color-text)]">{mode === 'login' ? '管理后台' : '创建账号'}</h1>
          <p className="mt-1 font-mono text-[11px] tracking-widest text-[var(--color-text-muted)]">ADMIN CONSOLE · {mode === 'login' ? '登录' : '注册'}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs text-[var(--color-text-muted)]">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              maxLength={32}
              placeholder="管理员账号"
              className="glass-input w-full rounded-lg border px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]/50 focus:border-[var(--color-accent)]/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-[var(--color-text-muted)]">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              placeholder="••••••••"
              className="glass-input w-full rounded-lg border px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]/50 focus:border-[var(--color-accent)]/50 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-[var(--color-danger-soft)]">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
              {notice}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[var(--color-accent)]/90 to-[var(--color-accent)] font-semibold text-[#06121a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (mode === 'login' ? '登录中...' : '注册中...') : (mode === 'login' ? '登 录' : '创 建 账 号')}
          </button>

          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNotice(''); }}
            className="text-center text-xs text-[var(--color-text-muted)] transition hover:text-[var(--color-accent)]"
          >
            {mode === 'login' ? '没有账号？注册普通账号' : '已有账号？返回登录'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-[var(--color-text-muted)]">
          <Link to="/" className="hover:text-[var(--color-accent)]">← 返回首页</Link>
        </div>
      </div>
    </div>
  );
}