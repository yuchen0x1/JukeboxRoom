// Electron's session ProxyConfig uses comma-separated rules. The command-line
// proxy-bypass switch uses a different semicolon-separated syntax.
const LOCAL_PROXY_BYPASS_RULES = '<local>,localhost,127.0.0.1,[::1]';

/**
 * 国内音源及其 CDN 的域名后缀。这些服务对海外出口限速甚至拒绝访问，
 * 用户开启规则模式系统代理（Clash 等）时，若放行走代理链，会表现为：
 * 封面/歌词加载失败、播放地址解析与音频兜底长时间转圈。
 * 因此在 Electron 会话与内嵌服务端（axios 会读取代理环境变量）里，
 * 这些域名一律强制直连；其余流量（如 GitHub 更新检查）保持系统代理。
 */
const DOMESTIC_MUSIC_DIRECT_SUFFIXES = [
  // 网易云音乐
  '163.com',
  '126.net',
  'netease.com',
  // QQ 音乐
  'qq.com',
  'gtimg.com',
  'tencentmusic.com',
  // 酷狗音乐
  'kugou.com',
  'kgimg.com',
  'kgcdn.com',
  // 咪咕音乐
  'migu.cn',
  'miguvideo.com',
  // 汽水音乐（字节系）
  'douyin.com',
  'douyinpic.com',
  'douyinvod.com',
  'byteicdn.com',
  'snssdk.com',
  '365yg.com',
  'zjcdn.com',
  'zijieapi.com',
];

/**
 * Electron 会话的 proxyBypassRules：本机回环永远直连，国内音源域名直连。
 * Chromium 规则里 `*.suffix` 匹配子域，`suffix` 匹配主机本身，两种都带上。
 */
function buildDesktopProxyBypassRules(suffixes = DOMESTIC_MUSIC_DIRECT_SUFFIXES) {
  const musicRules = suffixes.flatMap((suffix) => [`*.${suffix}`, suffix]);
  return [LOCAL_PROXY_BYPASS_RULES, ...musicRules].join(',');
}

/**
 * 合并 NO_PROXY 环境变量：让内嵌服务端里遵循代理环境变量的 HTTP 客户端
 * （如 axios）对国内音源仍然直连，同时保留用户已有的排除列表。
 */
function mergeDomesticMusicNoProxy(existing) {
  const parts = new Set();
  for (const value of Array.isArray(existing) ? existing : [existing]) {
    for (const entry of String(value || '').split(',')) {
      const trimmed = entry.trim();
      if (trimmed) parts.add(trimmed);
    }
  }
  for (const suffix of DOMESTIC_MUSIC_DIRECT_SUFFIXES) parts.add(suffix);
  return [...parts].join(',');
}

/**
 * Keep the user's system proxy for external requests while ensuring that the
 * embedded local server is always reached directly. Some Windows proxy tools
 * do not add loopback hosts to their bypass list and can otherwise break the
 * renderer's /api/media-proxy requests. Domestic music CDNs are always reached
 * directly so that a rule-mode proxy cannot break playback, covers or lyrics.
 */
async function configureDesktopSessionProxy(electronSession, logger = console) {
  const defaultSession = electronSession?.defaultSession;
  if (!defaultSession || typeof defaultSession.setProxy !== 'function') return false;

  try {
    await defaultSession.setProxy({
      mode: 'system',
      proxyBypassRules: buildDesktopProxyBypassRules(),
    });
    // Drop any connection opened before the proxy policy was applied.
    await defaultSession.closeAllConnections?.();
    return true;
  } catch (error) {
    try {
      logger.warn?.(`[desktop-network] 无法设置本机代理绕过规则：${error?.message || 'unknown error'}`);
    } catch {
      // Logging must not prevent the application from starting.
    }
    return false;
  }
}

module.exports = {
  LOCAL_PROXY_BYPASS_RULES,
  DOMESTIC_MUSIC_DIRECT_SUFFIXES,
  buildDesktopProxyBypassRules,
  mergeDomesticMusicNoProxy,
  configureDesktopSessionProxy,
};
