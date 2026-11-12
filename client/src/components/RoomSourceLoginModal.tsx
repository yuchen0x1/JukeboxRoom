import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, Check, QrCode, RefreshCw, Music2, LogOut } from 'lucide-react';
import { fetchWithTimeout } from '../api/http';
import { useRoomStore } from '../stores/roomStore';
import {
  pollDesktopSourceLogin,
  loginDesktopMigu,
  saveDesktopSourceCookie,
  sendDesktopMiguSmsCode,
  startDesktopSourceLogin,
  type DesktopAccountSource,
} from '../api/desktopMusic';

export interface SourceLoginsState {
  netease?: boolean;
  tencent?: boolean;
  kugou?: boolean;
  qishui?: boolean;
  migu?: boolean;
}

interface RoomSourceLoginModalProps {
  open: boolean;
  roomId: string;
  sourceLogins: SourceLoginsState;
  mode?: 'room' | 'desktop';
  onClose: () => void;
  onCredentialChange?: () => Promise<unknown> | unknown;
  onRemoveCredential?: (source: DesktopAccountSource) => Promise<{ success: boolean; error?: string }>;
  onSaveCredential: (
    source: string,
    credential: { cookie?: string; customUrl?: string } | null,
  ) => Promise<{ success: boolean; error?: string }>;
}

type ScanStatus = 'idle' | 'loading' | 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'failed';

const QR_PLATFORMS: Array<{ id: 'netease' | 'tencent' | 'kugou' | 'qishui'; label: string; hint: string; color: string }> = [
  { id: 'netease', label: '网易云', hint: '使用网易云音乐 App 扫码并确认登录，VIP 歌曲完整播放', color: '#ec4141' },
  { id: 'tencent', label: 'QQ音乐', hint: '使用手机 QQ 扫码并确认登录', color: '#31c27c' },
  { id: 'kugou', label: '酷狗音乐', hint: '使用酷狗音乐 App 扫码并确认登录', color: '#2688ee' },
  { id: 'qishui', label: '汽水音乐', hint: '使用汽水音乐 App 或抖音扫码并确认授权', color: '#f5a623' },
];

export default function RoomSourceLoginModal({
  open,
  roomId,
  sourceLogins,
  mode = 'room',
  onClose,
  onCredentialChange,
  onRemoveCredential,
  onSaveCredential,
}: RoomSourceLoginModalProps) {
  const [scanSource, setScanSource] = useState<'netease' | 'tencent' | 'kugou' | 'qishui' | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [qrImage, setQrImage] = useState('');
  const [scanError, setScanError] = useState('');
  const [showCookieInput, setShowCookieInput] = useState(false);
  const [cookieDraft, setCookieDraft] = useState('');
  const [cookieSaving, setCookieSaving] = useState(false);
  const [removingSource, setRemovingSource] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const [miguPhone, setMiguPhone] = useState('');
  const [miguCode, setMiguCode] = useState('');
  const [miguSmsSending, setMiguSmsSending] = useState(false);
  const [miguLoggingIn, setMiguLoggingIn] = useState(false);
  const [miguSmsRemaining, setMiguSmsRemaining] = useState(0);
  const [enlarged, setEnlarged] = useState(false);
  const pollTimer = useRef<number | null>(null);
  const tickTimer = useRef<number | null>(null);
  const sessionRef = useRef('');
  const expiresAtRef = useRef(0);
  /** 连续轮询失败次数：多次失败要显式报错，不能一直静默等待 */
  const pollFailRef = useRef(0);
  /** 单次轮询未返回前不叠加新请求，避免并发触发上游风控 */
  const pollInFlightRef = useRef(false);

  /** 二维码有效期：QQ 3 分钟，酷狗 2 分钟；到点自动过期需重新获取 */
  const QR_TTL_SEC: Record<string, number> = { netease: 300, tencent: 180, kugou: 120, qishui: 300 };

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    if (tickTimer.current !== null) {
      window.clearInterval(tickTimer.current);
      tickTimer.current = null;
    }
  }, []);

  // 关闭弹窗时停止轮询并重置扫码状态
  useEffect(() => {
    if (!open) {
      stopPolling();
      setScanSource(null);
      setScanStatus('idle');
      setQrImage('');
      setScanError('');
      setCookieDraft('');
      setShowCookieInput(false);
      setEnlarged(false);
      sessionRef.current = '';
      setMiguPhone('');
      setMiguCode('');
      setMiguSmsRemaining(0);
    }
  }, [open, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    if (miguSmsRemaining <= 0) return undefined;
    const timer = window.setInterval(() => setMiguSmsRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [miguSmsRemaining]);

  const sendMiguCode = useCallback(async () => {
    const phone = miguPhone.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setScanError('请输入有效的中国大陆手机号');
      return;
    }
    setMiguSmsSending(true);
    setScanError('');
    try {
      if (mode !== 'desktop') throw new Error('咪咕试验性登录目前仅支持桌面版');
      await sendDesktopMiguSmsCode(phone);
      setMiguSmsRemaining(60);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : '咪咕验证码发送失败');
    } finally {
      setMiguSmsSending(false);
    }
  }, [miguPhone, mode]);

  const loginMigu = useCallback(async () => {
    const phone = miguPhone.trim();
    const code = miguCode.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setScanError('请输入有效的中国大陆手机号');
      return;
    }
    if (!/^\d{4,8}$/.test(code)) {
      setScanError('请输入 4-8 位短信验证码');
      return;
    }
    setMiguLoggingIn(true);
    setScanError('');
    try {
      if (mode !== 'desktop') throw new Error('咪咕试验性登录目前仅支持桌面版');
      await loginDesktopMigu(phone, code);
      const currentRoom = useRoomStore.getState().room;
      if (currentRoom) useRoomStore.getState().setRoom({ ...currentRoom, sourceLogins: { ...currentRoom.sourceLogins, migu: true } });
      setMiguCode('');
      await onCredentialChange?.();
    } catch (error) {
      setScanError(error instanceof Error ? error.message : '咪咕登录失败');
    } finally {
      setMiguLoggingIn(false);
    }
  }, [miguCode, miguPhone, mode, onCredentialChange]);

  const startScan = useCallback(async (source: 'netease' | 'tencent' | 'kugou' | 'qishui') => {
    stopPolling();
    setScanSource(source);
    setScanStatus('loading');
    setScanError('');
    setQrImage('');
    sessionRef.current = '';
    pollFailRef.current = 0;
    try {
      if (mode === 'desktop') {
        const result = await startDesktopSourceLogin(source as DesktopAccountSource);
        sessionRef.current = result.sessionKey;
        setQrImage(result.qrImage);
      } else {
        const res = await fetchWithTimeout(
          '/api/music/source/qr/start',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, source }),
          },
          15000,
        );
        const data = await res.json() as { sessionKey?: string; qrImage?: string; error?: string };
        if (!res.ok || !data.sessionKey || !data.qrImage) throw new Error(data.error || '获取二维码失败');
        sessionRef.current = data.sessionKey;
        setQrImage(data.qrImage);
      }
      setScanStatus('waiting');
      expiresAtRef.current = Date.now() + (QR_TTL_SEC[source] || 120) * 1000;
      setRemainingSec(QR_TTL_SEC[source] || 120);
      tickTimer.current = window.setInterval(() => {
        const left = Math.max(0, Math.ceil((expiresAtRef.current - Date.now()) / 1000));
        setRemainingSec(left);
        if (left <= 0) {
          stopPolling();
          setScanStatus('expired');
        }
      }, 1000);

      pollTimer.current = window.setInterval(async () => {
        const key = sessionRef.current;
        if (!key || pollInFlightRef.current) return;
        pollInFlightRef.current = true;
        try {
          let status: ScanStatus | undefined;
          let message: string | undefined;
          if (mode === 'desktop') {
            const result = await pollDesktopSourceLogin(source as DesktopAccountSource, key);
            status = result.status;
            message = result.message;
          } else {
            const poll = await fetchWithTimeout(
              `/api/music/source/qr/poll?roomId=${encodeURIComponent(roomId)}&source=${source}&session=${encodeURIComponent(key)}`,
              {},
              12000,
            );
            const polled = await poll.json() as { status?: ScanStatus | 'error'; error?: string; message?: string };
            status = polled.status === 'error' ? 'failed' : polled.status;
            message = polled.message || polled.error;
          }
          if (status === 'confirmed') {
            stopPolling();
            // 不依赖 room_update 广播时序：立即把本地房间登录态翻成已登录
            const currentRoom = useRoomStore.getState().room;
            if (currentRoom) {
              useRoomStore.getState().setRoom({
                ...currentRoom,
                sourceLogins: { ...currentRoom.sourceLogins, [source]: true },
              });
            }
            setScanStatus('confirmed');
            await onCredentialChange?.();
            setTimeout(() => {
              setScanSource(null);
              setScanStatus('idle');
            }, 1500);
          } else if (status === 'expired') {
            stopPolling();
            setScanStatus('expired');
          } else if (status === 'scanned') {
            setScanStatus('scanned');
          } else if (status === 'failed') {
            stopPolling();
            setScanStatus('failed');
            setScanError(message || '登录失败，请重新扫码');
          }
          pollFailRef.current = 0;
        } catch {
          // 偶发失败重试；连续失败必须暴露出来，否则界面会永远停在“已扫码”
          pollFailRef.current += 1;
          if (pollFailRef.current >= 3) {
            stopPolling();
            setScanStatus('failed');
            setScanError('登录状态查询失败（服务端或网络异常），请重新获取二维码');
          }
        } finally {
          pollInFlightRef.current = false;
        }
      }, 2500);
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取二维码失败';
      setScanStatus('failed');
      setScanError(message);
      // QQ 扫码被风控拦截时自动展开 Cookie 登录入口
      if (source === 'tencent' && message.includes('Cookie')) {
        setShowCookieInput(true);
      }
    }
  }, [mode, roomId, onCredentialChange, stopPolling]);



  const saveTencentCookie = useCallback(async () => {
    const cookie = cookieDraft.trim();
    if (!cookie) return;
    setCookieSaving(true);
    try {
      let res: { success: boolean; error?: string };
      if (mode === 'desktop') {
        await saveDesktopSourceCookie('tencent', cookie);
        res = { success: true };
      } else {
        res = await onSaveCredential('tencent', { cookie });
      }
      if (res.success) {
        setCookieDraft('');
        setShowCookieInput(false);
        await onCredentialChange?.();
      } else {
        setScanError(res.error || 'Cookie 保存失败');
      }
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Cookie 保存失败');
    } finally {
      setCookieSaving(false);
    }
  }, [cookieDraft, mode, onCredentialChange, onSaveCredential]);

  if (!open) return null;

  const statusBadge = (logged: boolean) =>
    logged ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
        <Check className="w-3 h-3" />已登录
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/40">未登录</span>
    );

  const main = createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="glass-scrim absolute inset-0" onClick={onClose} aria-label="关闭" />
      <div className="relative w-full max-w-md glass-surface glass-surface--modal rounded-2xl shadow-2xl p-6 animate-fade-in max-h-[86vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-white">{mode === 'desktop' ? '音乐平台账号' : '音源登录'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-white/40 mb-5">{mode === 'desktop'
          ? '扫码登录用于调用本人账号的播放权限。搜索仍来自平台公开曲库，不会读取私人歌单；账号会话加密保存在这台电脑，可随时退出。'
          : '登录一次即加密保存在本机，刷新页面、重启程序或更换房间都不用重新扫码；账号只用于解析播放地址，不会读取私人歌单，可随时退出。'}</p>

        {/* 扫码登录平台 */}
        <div className="space-y-3">
          {QR_PLATFORMS.map((platform) => {
            const isCurrent = scanSource === platform.id && ['loading', 'waiting', 'scanned'].includes(scanStatus);
            return (
              <div key={platform.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Music2 className="w-4 h-4 flex-shrink-0" style={{ color: platform.color }} />
                    <span className="text-sm font-medium text-white truncate">{platform.label}</span>
                  </div>
                  {statusBadge(Boolean(sourceLogins[platform.id]))}
                </div>

                {!isCurrent && (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-white/35 leading-4">{platform.hint}</p>
                    <div className="flex-shrink-0 flex items-center gap-1.5">
                      {platform.id === 'tencent' && (
                        <button
                          type="button"
                          onClick={() => setShowCookieInput((v) => !v)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white/50 border border-white/10 transition-colors hover:bg-white/10 hover:text-white"
                          title="部分网络扫码受限时可用 Cookie 方式"
                        >
                          Cookie
                        </button>
                      )}
                      {sourceLogins[platform.id] && (
                        <button
                          type="button"
                          disabled={removingSource === platform.id}
                          onClick={async () => {
                            if (removingSource) return;
                            setRemovingSource(platform.id);
                            try {
                              const result = mode === 'desktop' && onRemoveCredential
                                ? await onRemoveCredential(platform.id as DesktopAccountSource)
                                : await onSaveCredential(platform.id, null);
                              if (result.success) await onCredentialChange?.();
                              else setScanError(result.error || '退出账号失败');
                            } catch (error) {
                              setScanError(error instanceof Error ? error.message : '退出账号失败');
                            } finally {
                              setRemovingSource(null);
                            }
                          }}
                          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-white/45 border border-white/10 transition-colors hover:bg-red-400/10 hover:text-red-300 disabled:opacity-50"
                          title={`退出${platform.label}账号（同时删除本机保存的登录信息）`}
                        >
                          {removingSource === platform.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <LogOut className="w-3.5 h-3.5" />}退出
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void startScan(platform.id)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/10"
                        style={{ borderColor: `${platform.color}55`, color: platform.color }}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        扫码登录
                      </button>
                    </div>
                  </div>
                )}

                {platform.id === 'tencent' && showCookieInput && !isCurrent && (
                  <div className="mt-2.5">
                    <textarea
                      value={cookieDraft}
                      onChange={(e) => setCookieDraft(e.target.value)}
                      rows={2}
                      placeholder="浏览器登录 y.qq.com 后：F12 → 网络(Network) → 刷新页面 → 点第一个请求 → 复制请求头里 Cookie 的完整值粘贴到这里"
                      className="glass-input w-full rounded-xl px-3 py-2 text-[11px] text-white font-mono break-all"
                    />
                    <button
                      type="button"
                      onClick={() => void saveTencentCookie()}
                      disabled={cookieSaving || !cookieDraft.trim()}
                      className="mt-2 glass-button-primary rounded-lg px-4 py-1.5 text-xs font-medium disabled:opacity-50"
                    >
                      {cookieSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '保存 Cookie'}
                    </button>
                  </div>
                )}

                {isCurrent && (
                  <div className="mt-3 flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => qrImage && setEnlarged(true)}
                      title={qrImage ? '点击放大二维码（方便手机扫描）' : undefined}
                      className={`flex-shrink-0 w-40 h-40 rounded-xl flex items-center justify-center overflow-hidden transition-transform ${scanStatus === 'failed' ? 'bg-red-500/10 border border-red-500/30' : 'bg-white hover:scale-[1.03]'}`}
                    >
                      {scanStatus === 'loading' ? (
                        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                      ) : qrImage ? (
                        <img src={qrImage} alt="登录二维码" className="w-full h-full" />
                      ) : (
                        <QrCode className={`w-8 h-8 ${scanStatus === 'failed' ? 'text-red-400' : 'text-slate-400'}`} />
                      )}
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm text-white/80">
                        {scanStatus === 'scanned'
                          ? '已扫码，请在手机上确认登录'
                          : scanStatus === 'failed'
                            ? (scanError || '登录失败，请重试')
                            : scanStatus === 'expired'
                              ? '二维码已过期'
                              : '请使用对应 App 扫码登录'}
                      </p>
                      {scanStatus !== 'expired' && remainingSec > 0 && (
                        <p className="mt-0.5 text-[11px] text-amber-300/80">
                          剩余 {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')} 内有效，超时需重新获取
                        </p>
                      )}
                      {qrImage && scanStatus !== 'failed' && (
                        <p className="mt-1 text-[11px] text-white/35">扫不上？点击二维码放大后再扫</p>
                      )}
                      <p className="mt-1 text-[11px] text-white/35 leading-4">{platform.hint}</p>
                      {(scanStatus === 'expired' || scanStatus === 'failed') && (
                        <button
                          type="button"
                          onClick={() => void startScan(platform.id)}
                          className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                        >
                          <RefreshCw className="w-3 h-3" />重新获取二维码
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {mode === 'desktop' && (
          <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.04] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Music2 className="w-4 h-4 flex-shrink-0 text-cyan-300" />
                <span className="text-sm font-medium text-white truncate">咪咕音乐（实验性）</span>
              </div>
              {statusBadge(Boolean(sourceLogins.migu))}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-white/40">非官方接口试验性接入，手机号和验证码只用于本次登录；登录令牌会加密保存在本机，上游接口变化可能导致功能失效。</p>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <input value={miguPhone} onChange={(event) => setMiguPhone(event.target.value.replace(/\D/g, '').slice(0, 11))} inputMode="tel" autoComplete="tel" placeholder="手机号" className="glass-input rounded-lg px-3 py-2 text-xs text-white" aria-label="咪咕手机号" />
              <button type="button" onClick={() => void sendMiguCode()} disabled={miguSmsSending || miguSmsRemaining > 0} className="rounded-lg border border-cyan-300/30 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-300/10 disabled:opacity-50">
                {miguSmsSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : miguSmsRemaining > 0 ? `${miguSmsRemaining}s 后重发` : '发送验证码'}
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <input value={miguCode} onChange={(event) => setMiguCode(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" placeholder="短信验证码" className="glass-input min-w-0 flex-1 rounded-lg px-3 py-2 text-xs text-white" aria-label="咪咕短信验证码" />
              <button type="button" onClick={() => void loginMigu()} disabled={miguLoggingIn} className="glass-button-primary rounded-lg px-4 py-2 text-xs font-medium disabled:opacity-50">
                {miguLoggingIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '登录并保存'}
              </button>
            </div>
            {sourceLogins.migu && <button type="button" disabled={removingSource === 'migu'} onClick={async () => { setRemovingSource('migu'); try { const result = onRemoveCredential ? await onRemoveCredential('migu') : { success: false, error: '退出失败' }; if (result.success) await onCredentialChange?.(); else setScanError(result.error || '退出咪咕账号失败'); } catch (error) { setScanError(error instanceof Error ? error.message : '退出咪咕账号失败'); } finally { setRemovingSource(null); } }} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/50 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-50"><LogOut className="w-3.5 h-3.5" />退出咪咕账号</button>}
          </div>
        )}

        {scanError && <p className="mt-3 text-xs text-red-400">{scanError}{scanStatus === 'failed' && scanError.includes('Cookie') ? '（已在 QQ 卡片内展开 Cookie 登录入口）' : ''}</p>}
        <p className="mt-4 text-[11px] text-white/25 leading-4">
          登录凭据即本人账号会话，请遵守平台协议自行把握；Cookie 过期后在本面板重新扫码即可。
        </p>
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      {main}
      {enlarged && qrImage && createPortal(
        <div
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-black/90 cursor-zoom-out"
          onClick={() => setEnlarged(false)}
        >
          <img src={qrImage} alt="放大登录二维码" className="w-[min(72vmin,460px)] h-[min(72vmin,460px)] bg-white p-3 rounded-2xl" />
          <p className="text-sm text-white/80">手机对准扫一扫 · 点击任意位置返回</p>
        </div>,
        document.body,
      )}
    </>
  );
}
