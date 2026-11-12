const DEFAULT_ALLOWED_MEDIA_HOST_SUFFIXES = Object.freeze([
  // 网易云音乐播放与封面 CDN
  '126.net',
  '163.com',
  'netease.com',
  // QQ 音乐播放与封面 CDN
  'qq.com',
  'gtimg.com',
  'gtimg.cn',
  'tencentmusic.com',
  // 酷狗音乐播放与封面 CDN
  'kugou.com',
  'kugou.net',
  'kugoucdn.com',
  'kugoudata.com',
  'kgimg.com',
  // 汽水/字节系播放 CDN
  '365yg.com',
  'douyinvod.com',
  'douyinpic.com',
  'douyinscdn.com',
  'bytefcdn.com',
  'byteicdn.com',
  'snssdk.com',
  'bytecdn.cn',
  'ibytedtos.com',
  'pstatp.com',
  'bytedance.com',
  'bytetos.com',
  'volcvideo.com',
  'volccdn.com',
  'volces.com',
  'volcengineapi.com',
  'douyin.com',
  'qishui.com',
  'zijieapi.com',
  'zjcdn.com',
  // 咪咕音乐播放与封面 CDN
  'migu.cn',
]);

function normalizeHostname(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\*\./, '')
    .replace(/^\.+|\.+$/g, '');
}

function matchesHostnameSuffix(hostname, suffix) {
  const host = normalizeHostname(hostname);
  const normalizedSuffix = normalizeHostname(suffix);
  return Boolean(
    host
    && normalizedSuffix
    && (host === normalizedSuffix || host.endsWith(`.${normalizedSuffix}`)),
  );
}

/**
 * 解析 MEDIA_PROXY_ALLOWED_HOSTS。
 * 支持逗号、分号或空白分隔；可写 `cdn.example.com` 或 `*.example.com`。
 */
export function parseConfiguredMediaHosts(rawValue = process.env.MEDIA_PROXY_ALLOWED_HOSTS) {
  return String(rawValue || '')
    .split(/[\s,;]+/)
    .map(normalizeHostname)
    .filter(Boolean)
    .filter((host) => host !== '*');
}

export function isAllowedMediaHost(hostname, { extraHosts = parseConfiguredMediaHosts() } = {}) {
  const host = normalizeHostname(hostname);
  if (!host) return false;
  return [
    ...DEFAULT_ALLOWED_MEDIA_HOST_SUFFIXES,
    ...(Array.isArray(extraHosts) ? extraHosts : []),
  ].some((suffix) => matchesHostnameSuffix(host, suffix));
}

export function isAllowedMediaUrl(rawUrl, options = {}) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    return false;
  }
  return isAllowedMediaHost(parsed.hostname, options);
}

export function getDefaultAllowedMediaHostSuffixes() {
  return [...DEFAULT_ALLOWED_MEDIA_HOST_SUFFIXES];
}
