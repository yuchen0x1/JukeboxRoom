/* JukeboxRoom PWA Service Worker
 *
 * 缓存策略（修改时请保持以下边界）：
 * - 版本化缓存：缓存名包含构建版本，占位符由 vite 插件在构建时替换为
 *   `<package version>-<assets 指纹>`。构建产物使用稳定文件名（assets/[name].js），
 *   如果缓存名固定不变，发版后离线/弱网场景可能把旧 chunk 与新 index.html 混用，
 *   表现为白屏或运行时错误。
 * - 导航请求 network-first：在线时始终拿最新 index.html，只有网络失败才回退壳层。
 * - 静态资源 network-first + 只缓存成功响应：失败响应（404/500）不进缓存，
 *   避免一次上游抖动被永久固化。
 * - 跳过 /api、/socket.io、/downloads：接口与实时通道必须走网络，安装包体积大，
 *   缓存会迅速占满存储配额。
 * - 跳过 Range 请求：音频/媒体分段请求不能整体缓存。
 */
const CACHE_PREFIX = 'jukeboxroom-shell-';
const CACHE = `${CACHE_PREFIX}__SW_VERSION__`;
const RUNTIME_CACHE = `${CACHE}-runtime`;
const MAX_RUNTIME_ENTRIES = 120;
const MAX_CACHEABLE_BYTES = 4 * 1024 * 1024;

const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/jukeboxroom-32.png',
  '/icons/jukeboxroom-192.png',
  '/icons/jukeboxroom-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // 单个图标缺失不应让整个 SW 安装失败；壳层页面才是离线可用的关键。
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !key.startsWith(CACHE))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function isCacheableRequest(request, url) {
  if (request.method !== 'GET') return false;
  if (request.headers.has('range')) return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname.startsWith('/socket.io/')) return false;
  if (url.pathname.startsWith('/downloads/')) return false;
  return true;
}

function isCacheableResponse(response) {
  if (!response || !response.ok) return false;
  if (response.type !== 'basic' && response.type !== 'default') return false;
  const length = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_CACHEABLE_BYTES) return false;
  return true;
}

async function trimRuntimeCache(cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= MAX_RUNTIME_ENTRIES) return;
    await Promise.all(keys.slice(0, keys.length - MAX_RUNTIME_ENTRIES).map((key) => cache.delete(key)));
  } catch {
    // 清理失败不影响请求处理。
  }
}

async function putRuntime(request, response) {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response);
    await trimRuntimeCache(RUNTIME_CACHE);
  } catch {
    // 存储配额不足或请求不可缓存：静默忽略，不能让缓存写失败影响页面。
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (!isCacheableRequest(request, url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const shell = await caches.match('/index.html', { cacheName: CACHE });
        return shell || Response.error();
      }),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (isCacheableResponse(response)) {
          const copy = response.clone();
          event.waitUntil(putRuntime(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // 同一请求可能命中旧缓存名（升级瞬间），最后再试一次壳层缓存。
        return (await caches.match(request, { cacheName: CACHE })) || Response.error();
      }),
  );
});
