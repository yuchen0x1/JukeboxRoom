import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildRobotsTxt, buildSitemapXml, resolveDevSiteOrigin } from '../server/seoFiles.js';

const appVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }).version;

/**
 * 按 npm 包边界匹配，避免子串误伤。
 * `id.includes('three')` 会命中 use-sync-external-store / react-use-measure 等包名，
 * 把 zustand 依赖链拖进 three-vendor。这里只匹配 node_modules/<包名>/；
 * 传入 @react-three 这类 scope 时按整个 scope 目录匹配。
 */
function isPackage(id: string, packages: string[]): boolean {
  const normalized = id.replace(/\\/g, '/');
  return packages.some((name) => normalized.includes(`/node_modules/${name}/`));
}

/**
 * 给 public/sw.js 里的 `__SW_VERSION__` 注入构建指纹。
 *
 * 构建产物使用稳定文件名（assets/[name].js），Service Worker 若用固定缓存名，
 * 发版后离线用户可能拿到「新 index.html + 旧 chunk」的组合。缓存名必须随构建
 * 内容变化，同时保持相同输入可复现：指纹取所有 assets 的文件名与内容哈希，而不是
 * 构建时间（仅用体积会漏掉同尺寸改动）。
 */
function swCacheVersionPlugin() {
  const distDir = new URL('./dist', import.meta.url);
  const swPath = new URL('./dist/sw.js', import.meta.url);

  function buildFingerprint(): string {
    const assetsDir = new URL('./dist/assets/', import.meta.url);
    if (!existsSync(assetsDir)) return 'dev';
    const hash = createHash('sha256');
    const files = readdirSync(assetsDir).sort();
    for (const file of files) {
      const full = new URL(`./dist/assets/${file}`, import.meta.url);
      hash.update(file);
      hash.update(readFileSync(full));
    }
    return hash.digest('hex').slice(0, 12);
  }

  return {
    name: 'jukeboxroom-sw-cache-version',
    apply: 'build' as const,
    closeBundle() {
      if (!existsSync(swPath)) return;
      const source = readFileSync(swPath, 'utf8');
      if (!source.includes('__SW_VERSION__')) {
        throw new Error('sw.js 缺少 __SW_VERSION__ 占位符，无法注入缓存版本');
      }
      const version = `${appVersion}-${buildFingerprint()}`;
      const output = source.replaceAll('__SW_VERSION__', version);
      writeFileSync(swPath, output);
      // distDir 仅用于错误提示的可读路径
      console.log(`[sw] cache version: ${version} (${distDir.pathname})`);
    },
  };
}

function changelogAsset() {
  const changelogPath = new URL('../CHANGELOG.md', import.meta.url);
  return {
    name: 'jukeboxroom-changelog',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/changelog.md') {
          next();
          return;
        }
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.end(readFileSync(changelogPath, 'utf-8'));
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'changelog.md',
        source: readFileSync(changelogPath, 'utf-8'),
      });
    },
  };
}

function seoDevMiddleware() {
  return {
    name: 'openmusic-seo-dev',
    enforce: 'pre' as const,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0];
        if (pathname !== '/sitemap.xml' && pathname !== '/robots.txt') {
          next();
          return;
        }

        const origin = resolveDevSiteOrigin(req);
        const body = pathname === '/robots.txt' ? buildRobotsTxt(origin) : buildSitemapXml(origin);
        res.setHeader('Content-Type', pathname === '/robots.txt' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8');
        res.end(body);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), changelogAsset(), seoDevMiddleware(), swCacheVersionPlugin()],
  define: {
    // 客户端展示用版本号；更新对比以服务端 /api/update 的 currentVersion 为准
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // 固定资源名，部署覆盖同路径即可；配合服务端 no-cache，避免 EO 缓存 hash 文件名导致每次清缓存
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
        /**
         * 分桶必须是「包边界」匹配，不能用 id.includes('three')。
         * 后者会把 node_modules/use-sync-external-store、node_modules/react-use-measure
         * 等名字里带 "three" 的间接依赖一起塞进 three-vendor，导致 roomStore（zustand）
         * → react.js → three-vendor 形成静态闭环，首页/房间页/TV 页被迫下载 900KB 的
         * Three.js。@react-three/fiber 也依赖 zustand 与 use-sync-external-store，
         * 因此这些包必须显式归到 react-vendor，否则仍会被打进 three-vendor。
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (isPackage(id, ['zustand', 'use-sync-external-store', 'react-use-measure', 'suspend-react', 'its-fine'])) {
            return 'react-vendor';
          }
          if (isPackage(id, ['three', '@react-three'])) {
            return 'three-vendor';
          }
          if (isPackage(id, ['socket.io-client', 'engine.io-client'])) {
            return 'socket-vendor';
          }
          if (isPackage(id, ['lucide-react'])) {
            return 'icons-vendor';
          }
          if (
            id.includes('react-dom')
            || id.includes('react-router')
            || /[/\\]react[/\\]/.test(id)
          ) {
            return 'react-vendor';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/wx-proxy': 'http://localhost:4000',
      '/cgi-bin': 'http://localhost:4000',
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
      },
    },
  },
});
