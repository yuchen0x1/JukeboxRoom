import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Locale = 'zh-CN' | 'en-US';
export type LocaleSetting = 'auto' | Locale;
const STORAGE_KEY = 'openmusic:locale';

const messages = {
  'zh-CN': {
    language: '语言', auto: '自动', lobby: '音乐大厅', create: '创建房间', join: '加入房间',
    loading: '加载中...', loadingRooms: '正在加载房间', unavailable: '暂时无法连接房间服务',
    retry: '重试', empty: '还没有活跃房间', createFirst: '成为第一个创建房间的人吧',
    roomName: '房间名称', roomCode: '房间号', password: '房间密码', optional: '可选',
    createAndEnter: '创建并进入', joinNow: '加入房间', close: '关闭',
    webUpdateReady: '网页更新已就绪', refreshApp: '立即刷新', later: '稍后',
    webUpdateHint: '刷新时会暂时离开当前房间。',
    webUpdateFailed: '更新暂未激活，请重试。',
  },
  'en-US': {
    language: 'Language', auto: 'Auto', lobby: 'Music lobby', create: 'Create room', join: 'Join room',
    loading: 'Loading...', loadingRooms: 'Loading rooms', unavailable: 'Room service unavailable',
    retry: 'Retry', empty: 'No active rooms', createFirst: 'Be the first to create a room',
    roomName: 'Room name', roomCode: 'Room code', password: 'Room password', optional: 'optional',
    createAndEnter: 'Create and enter', joinNow: 'Join room', close: 'Close',
    webUpdateReady: 'Web update ready', refreshApp: 'Refresh now', later: 'Later',
    webUpdateHint: 'Refreshing briefly disconnects you from the room.',
    webUpdateFailed: 'The update hasn’t activated. Try again.',
  },
} as const;

export function resolveLocale(setting: LocaleSetting, candidates: readonly string[] = []): Locale {
  if (setting === 'zh-CN' || setting === 'en-US') return setting;
  for (const candidate of (candidates.length ? candidates : ['zh-CN'])) {
    const value = String(candidate).toLowerCase();
    if (value === 'en' || value.startsWith('en-')) return 'en-US';
    if (value === 'zh' || value.startsWith('zh-')) return 'zh-CN';
  }
  return 'zh-CN';
}

function readSetting(): LocaleSetting {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'zh-CN' || value === 'en-US' ? value : 'auto';
  } catch { return 'auto'; }
}

type I18nValue = {
  locale: Locale;
  setting: LocaleSetting;
  setSetting: (value: LocaleSetting) => void;
  t: (key: keyof typeof messages['zh-CN']) => string;
};
const I18nContext = createContext<I18nValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [setting, setSetting] = useState<LocaleSetting>(() => readSetting());
  const [locale, setLocale] = useState<Locale>(() => resolveLocale(setting, typeof navigator === 'undefined' ? [] : navigator.languages || [navigator.language]));

  useEffect(() => {
    const next = resolveLocale(setting, navigator.languages || [navigator.language]);
    setLocale(next);
    document.documentElement.lang = next;
    try { localStorage.setItem(STORAGE_KEY, setting); } catch { /* storage unavailable */ }
  }, [setting]);

  const value = useMemo<I18nValue>(() => ({
    locale,
    setting,
    setSetting,
    t: (key) => messages[locale][key],
  }), [locale, setting]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside LocaleProvider');
  return value;
}

export function LanguageSelect() {
  const { setting, setSetting, t } = useI18n();
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-white/50">
      <span>{t('language')}</span>
      <select aria-label={t('language')} value={setting} onChange={(event) => setSetting(event.target.value as LocaleSetting)} className="rounded border border-white/10 bg-black/20 px-1.5 py-1 text-xs text-white/80">
        <option value="auto">{t('auto')}</option>
        <option value="zh-CN">简体中文</option>
        <option value="en-US">English</option>
      </select>
    </label>
  );
}
