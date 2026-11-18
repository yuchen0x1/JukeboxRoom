/* JukeboxRoom PWA Service Worker
 *
 * 缓存策略（修改时请保持以下边界）：
 * 每次部署在独立缓存中验证并准备离线大厅。实时请求直接走网络。
 */
const CACHE_PREFIX = 'jukeboxroom-shell-';
const CACHE = `${CACHE_PREFIX}__SW_VERSION__`;
const RUNTIME_CACHE = `${CACHE}-runtime`;
const MAX_RUNTIME_ENTRIES = 120;
const MAX_CACHEABLE_BYTES = 4 * 1024 * 1024;

const SHELL = [
  /*__SHELL_ASSETS__*/
  '/manifest.webmanifest',
  '/icons/jukeboxroom-32.png',
  '/icons/jukeboxroom-192.png',
  '/icons/jukeboxroom-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const index = await fetch('/index.html', { cache: 'reload' });
    if (!index.ok || !(await index.clone().text()).includes('__ENTRY_FILE__')) {
      throw new Error('The deployed HTML does not match the service worker build');
    }
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })));
    await cache.put('/index.html', index);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

function isCacheableRequest(request, url) {
  if (request.method !== 'GET') return false;
  if (request.headers.has('range')) return false;
  if (url.origin !== self.location.origin) return false;
  if (request.mode === 'navigate') {
    return url.pathname === '/' || /^\/(room|tv)\/[^/]+$/.test(url.pathname);
  }
  return SHELL.includes(url.pathname) || /^\/(assets|icons|qface|vendor)\//.test(url.pathname);
}

function isCacheableResponse(response) {
  if (!response || !response.ok) return false;
  if (response.type !== 'basic' && response.type !== 'default') return false;
  if (response.headers.get('content-type')?.includes('text/html')) return false;
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

  event.respondWith((async () => {
    const shell = await caches.match(request, { cacheName: CACHE });
    if (shell) return shell;
    try {
      const response = await fetch(request);
      if (isCacheableResponse(response)) event.waitUntil(putRuntime(request, response.clone()));
      return response;
    } catch {
      return (await caches.match(request, { cacheName: RUNTIME_CACHE })) || Response.error();
    }
  })());
});
