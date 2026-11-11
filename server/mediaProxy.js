import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

export const DEFAULT_MEDIA_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** 图片/缩略图整包缓冲的上限。超过即中止，避免大图或恶意上游打爆内存。 */
const MAX_BUFFERED_MEDIA_BYTES = 12 * 1024 * 1024;
/** 流式转发单次请求的硬上限（音频）。Range 请求天然较小；整轨下载也不应无限。 */
const MAX_STREAMED_MEDIA_BYTES = 256 * 1024 * 1024;

/** 把上游 node 流读成 Buffer，并在超过上限时中止。 */
function readStreamWithLimit(stream, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    stream.on('data', (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        stream.destroy();
        reject(new Error('媒体响应超过大小上限'));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function hostnameOf(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isKugouHost(host) {
  return Boolean(
    host
    && (host.includes('kugou') || host.includes('kgimg') || /\.kg(cdn|img)?\./i.test(host)),
  );
}

/**
 * 字节/汽水系媒体 CDN：对 Referer 做白名单校验。
 * 实测 Referer=本站地址 → 403，Referer=空或 qishui/douyin → 200，因此必须由代理改成平台 Referer。
 */
function isQishuiCdnHost(host) {
  if (!host) return false;
  return ['365yg.com', 'douyinvod.com', 'douyinpic.com', 'byteicdn.com', 'snssdk.com']
    .some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * 按 CDN 域名选 Referer（酷狗 CDN 对 Referer 不敏感，但其它源可能需要）。
 */
export function refererForMediaUrl(rawUrl) {
  const host = hostnameOf(rawUrl);
  if (isQishuiCdnHost(host)) return 'https://qishui.douyin.com/';
  if (isKugouHost(host)) return 'https://www.kugou.com/';
  if (
    host.includes('gtimg')
    || host.includes('qq.com')
    || host.includes('tencentmusic')
    || host.includes('y.qq')
  ) {
    return 'https://y.qq.com/';
  }
  if (host.includes('126.net') || host.includes('163.com') || host.includes('netease')) {
    return 'https://music.163.com/';
  }
  return 'https://music.163.com/';
}

/**
 * 部分 CDN 可用 https；酷狗 youthandroid 等节点证书不可靠，禁止升协议（升了会 502/反复重试表现为卡顿）。
 */
export function preferHttpsMediaUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url.toLowerCase().startsWith('http://')) return url;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (isKugouHost(host)) return url;
    const canUpgrade =
      host.includes('126.net')
      || host.includes('163.com')
      || host.includes('gtimg')
      || host.includes('qq.com')
      || host.includes('tencentmusic');
    if (!canUpgrade) return url;
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch {
    return url;
  }
}

function normalizeAudioContentType(contentType) {
  if (!contentType) return contentType;
  // 部分浏览器对 audio/x-flac 支持更差
  if (/^audio\/x-flac\b/i.test(contentType)) return 'audio/flac';
  return contentType;
}

function shouldBufferResponse(contentType, options) {
  if (options.forceBuffer) return true;
  if (options.thumbPx > 0) return true;
  if (contentType && /^image\//i.test(contentType)) return true;
  return false;
}

function isAudioStream(contentType, range) {
  if (range) return true;
  return Boolean(contentType && /^(audio|video|application\/octet-stream)\b/i.test(contentType));
}

/**
 * 从上游拉取媒体并返回给客户端。
 * 图片/缩略图整包缓冲；音频 Range 流式转发（勿中途 abort body）。
 */
export async function serveUpstreamMedia(rawUrl, res, fetchWithTimeout, options = {}) {
  let fetchUrl = preferHttpsMediaUrl(rawUrl);
  const headers = {
    'User-Agent': DEFAULT_MEDIA_UA,
    Accept: '*/*',
    // 避免上游错误地压缩音频流
    'Accept-Encoding': 'identity',
    Referer: options.referer || refererForMediaUrl(fetchUrl),
    ...(options.headers || {}),
  };

  const range = String(options.range || '').trim();
  if (range) headers.Range = range;

  let response;
  try {
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      if (options.validateUrl && !(await options.validateUrl(fetchUrl))) {
        if (!res.headersSent) res.status(403).json({ error: '禁止访问内网地址' });
        return false;
      }

      // 不允许 fetch 自动跟随重定向；每一次跳转都必须重新校验目标地址。
      // stream: true —— 音频/视频绝不整包缓冲，否则单个请求即可耗尽进程内存。
      response = await fetchWithTimeout(
        fetchUrl,
        {
          headers: {
            ...headers,
            Referer: options.referer || refererForMediaUrl(fetchUrl),
          },
          redirect: 'manual',
          stream: true,
        },
        options.timeoutMs || 20000,
      );

      if (response.status < 300 || response.status >= 400) break;

      const location = response.headers.get('location');
      if (!location || redirectCount === 3) {
        if (!res.headersSent) res.status(502).json({ error: '上游媒体重定向无效' });
        return false;
      }

      try {
        fetchUrl = new URL(location, fetchUrl).toString();
      } catch {
        if (!res.headersSent) res.status(502).json({ error: '上游媒体重定向无效' });
        return false;
      }
    }
  } catch {
    if (!res.headersSent) res.status(502).json({ error: '媒体代理失败' });
    return false;
  }

  if (!response.ok && response.status !== 206) {
    if (!res.headersSent) res.status(response.status).json({ error: '上游媒体请求失败' });
    return false;
  }

  const rawType = response.headers.get('content-type') || '';
  const contentType = normalizeAudioContentType(rawType);
  const useBuffer = shouldBufferResponse(rawType, options) && !isAudioStream(rawType, range);

  res.set('Cache-Control', 'public, max-age=3600');
  res.set('X-OpenMusic-Proxy', '1');

  if (useBuffer) {
    try {
      const buffer = response.nodeStream
        ? await readStreamWithLimit(response.nodeStream, MAX_BUFFERED_MEDIA_BYTES)
        : Buffer.from(await response.arrayBuffer());
      if (res.writableEnded || res.destroyed) return false;
      if (contentType) res.set('Content-Type', contentType);
      res.status(200).send(buffer);
      return true;
    } catch {
      if (!res.headersSent) res.status(502).json({ error: '媒体代理失败' });
      return false;
    }
  }

  if (contentType) res.set('Content-Type', contentType);
  for (const header of ['accept-ranges', 'content-length', 'content-range']) {
    const value = response.headers.get(header);
    if (value) res.set(header, value);
  }

  // 流式转发：优先使用 node 流（safeFetch({stream:true}) 直接返回上游连接）。
  const nodeStream = response.nodeStream;
  const webBody = response.body;
  if (!nodeStream && !webBody) {
    try {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.status(response.status).send(buffer);
      return true;
    } catch {
      if (!res.headersSent) res.status(502).json({ error: '媒体代理失败' });
      return false;
    }
  }

  const stream = nodeStream || Readable.fromWeb(webBody);
  let clientGone = false;
  res.on('close', () => {
    clientGone = true;
    stream.destroy();
  });

  // 用 Transform 计数而不是额外挂 'data' 监听：后者会把流切到 flowing 模式，
  // 在 pipeline 接管前就可能丢数据。
  let forwarded = 0;
  const byteLimit = new Transform({
    transform(chunk, _encoding, callback) {
      forwarded += chunk.length;
      if (forwarded > MAX_STREAMED_MEDIA_BYTES) {
        callback(new Error('媒体流超过大小上限'));
        return;
      }
      callback(null, chunk);
    },
  });

  res.status(response.status);
  try {
    await pipeline(stream, byteLimit, res);
    return true;
  } catch {
    if (clientGone) return false;
    if (!res.headersSent) res.status(502).end();
    else res.destroy();
    return false;
  }
}

/** @deprecated 使用 serveUpstreamMedia */
export const pipeUpstreamMedia = serveUpstreamMedia;
