import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildRobotsTxt, buildSitemapXml, resolveDevSiteOrigin } from '../server/seoFiles.js';

const appVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }).version;

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
  plugins: [react(), changelogAsset(), seoDevMiddleware()],
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
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('three') || id.includes('@react-three')) {
            return 'three-vendor';
          }
          if (id.includes('socket.io-client')) {
            return 'socket-vendor';
          }
          if (id.includes('lucide-react')) {
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
