import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
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
 * 预缓存入口和大厅的静态依赖，房间及 3D 模块按需加载。
 */
function swCacheVersionPlugin(): Plugin {
  const distDir = new URL('./dist', import.meta.url);
  const swPath = new URL('./dist/sw.js', import.meta.url);

  let shellAssets: string[] = [];
  let entryFile = '';

  return {
    name: 'jukeboxroom-sw-cache-version',
    apply: 'build' as const,
    generateBundle(_options, bundle) {
      const files = new Set<string>();
      function add(filename: string) {
        if (files.has(filename)) return;
        files.add(filename);
        const item = bundle[filename];
        if (item?.type === 'chunk') item.imports.forEach(add);
      }
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk' && item.isEntry) entryFile = item.fileName;
        if (item.type === 'chunk' && (item.isEntry || item.name === 'Home')) add(item.fileName);
        if (item.type === 'asset' && item.fileName.endsWith('.css')) add(item.fileName);
      }
      shellAssets = [...files].sort().map((file) => `/${file}`);
    },
    closeBundle() {
      if (!existsSync(swPath)) return;
      const source = readFileSync(swPath, 'utf8');
      const index = readFileSync(new URL('./dist/index.html', import.meta.url), 'utf8');
      if (!source.includes('__SW_VERSION__') || !entryFile || !index.includes(`/${entryFile}`)) {
        throw new Error('无法生成与入口页面匹配的 Service Worker');
      }
      const fingerprint = createHash('sha256').update(index).update(source);
      const assets = new URL('./dist/assets/', import.meta.url);
      for (const file of readdirSync(assets).sort()) fingerprint.update(file);
      const version = `${appVersion}-${fingerprint.digest('hex').slice(0, 12)}`;
      const output = source.replace('__SW_VERSION__', version)
        .replace('/*__SHELL_ASSETS__*/', shellAssets.map((asset) => `${JSON.stringify(asset)},`).join('\n  '))
        .replace('__ENTRY_FILE__', `/${entryFile}`);
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
      this.emitFile({
        type: 'asset',
        fileName: 'LICENSE',
        source: readFileSync(new URL('../LICENSE', import.meta.url), 'utf8'),
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
    license: { fileName: 'THIRD-PARTY-LICENSES.md' },
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
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
