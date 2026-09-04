import { FormEvent, useState } from 'react';
import { ArrowRight, KeyRound, Loader2, Music2, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { login, register } from '../api/auth';
import GlassSurface from '../components/GlassSurface';
import { usePageSeo } from '../lib/seo';

type Mode = 'login' | 'register';

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  usePageSeo({
    title: mode === 'login' ? '登录 · OpenMusic' : '注册 · OpenMusic',
    description: '登录 OpenMusic，管理你的音乐房间与个人体验。',
    path: '/login',
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername || password.length < 6) {
      setError('请输入用户名，并使用至少 6 位密码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (mode === 'login') {
        await login(cleanUsername, password);
      } else {
        await register(cleanUsername, password);
        await login(cleanUsername, password);
      }
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '认证失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="ambient-stage relative min-h-full overflow-hidden px-4 py-8 text-[var(--om-text)] sm:px-6">
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,430px)] lg:gap-16">
          <section className="hidden lg:block">
            <div className="mb-6 flex items-center gap-3 text-sm text-[var(--om-text-muted)]">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--om-glass-border)] bg-[rgba(var(--om-accent-rgb),0.12)] text-[var(--om-accent)]">
                <Music2 className="h-5 w-5" />
              </span>
              OpenMusic / Social Listening
            </div>
            <h1 className="max-w-xl text-5xl font-semibold leading-[1.08] text-white">
              让每一首歌，
              <span className="block text-[var(--om-accent)]">都有一起听的人。</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-8 text-[var(--om-text-muted)]">
              进入房间、同步播放、实时聊天。把音乐变成一个有温度的共享空间。
            </p>
            <div className="mt-10 flex items-center gap-3 text-sm text-[var(--om-text-subtle)]">
              <ShieldCheck className="h-4 w-4 text-[var(--om-accent)]" />
              房间身份与会话分开管理
            </div>
          </section>

          <GlassSurface variant="modal" className="w-full rounded-[28px] p-6 sm:p-8">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-[var(--om-accent)]">OpenMusic Account</p>
                <h2 className="text-2xl font-semibold text-white">{mode === 'login' ? '欢迎回来' : '创建账户'}</h2>
                <p className="mt-2 text-sm text-[var(--om-text-muted)]">{mode === 'login' ? '登录后继续你的音乐房间。' : '注册后即可使用账户能力。'}</p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--om-glass-border)] bg-white/[0.04] text-[var(--om-accent)]">
                {mode === 'login' ? <KeyRound className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
              </span>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-[var(--om-text-muted)]">用户名</span>
                <span className="relative block">
                  <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--om-text-subtle)]" />
                  <input value={username} onChange={(event) => setUsername(event.target.value)} className="glass-input h-12 w-full rounded-xl pl-10 pr-4 text-sm" autoComplete="username" maxLength={32} />
                </span>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-[var(--om-text-muted)]">密码</span>
                <span className="relative block">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--om-text-subtle)]" />
                  <input value={password} onChange={(event) => setPassword(event.target.value)} className="glass-input h-12 w-full rounded-xl pl-10 pr-4 text-sm" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                </span>
              </label>

              {error && <p className="rounded-xl border border-[rgba(255,107,122,0.24)] bg-[rgba(255,107,122,0.1)] px-3.5 py-3 text-sm text-[#ff9aa5]">{error}</p>}

              <button type="submit" disabled={loading} className="glass-button-primary glass-interactive flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {mode === 'login' ? '登录 OpenMusic' : '创建账户'}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-between gap-3 text-xs text-[var(--om-text-subtle)]">
              <span>{mode === 'login' ? '还没有账户？' : '已经有账户？'}</span>
              <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} className="glass-focus font-medium text-[var(--om-accent)] hover:text-white">
                {mode === 'login' ? '立即注册' : '返回登录'}
              </button>
            </div>
            <button type="button" onClick={() => navigate('/')} className="mt-5 w-full text-center text-xs text-[var(--om-text-subtle)] transition-colors hover:text-white">先以访客身份进入房间大厅</button>
          </GlassSurface>
        </div>
      </div>
    </main>
  );
}
