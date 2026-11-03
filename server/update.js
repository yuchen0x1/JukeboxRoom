import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPrivateHostname, resolveValidatedHttpUrl } from './outboundUrl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY = 'yuchen0x1/JukeboxRoom';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_STALE_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8000;
export const CHANNEL_GITHUB = 'github';

/** 允许的 GitHub 官方域名：API、网页、Release 资产直链及其重定向 CDN。 */
const GITHUB_ALLOWED_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com',
]);

function readCurrentVersion() {
  for (const packagePath of [path.join(__dirname, '../package.json'), path.join(__dirname, 'package.json')]) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      return String(process.env.APP_VERSION || packageJson.version || '0.0.0').trim();
    } catch {
      // Try the deployment package's server/package.json next.
    }
  }
  return String(process.env.APP_VERSION || '0.0.0').trim();
}

export const CURRENT_VERSION = readCurrentVersion();

export function parseVersion(value) {
  const match = String(value || '').trim().replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)];
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '') || null;
}

function getRepository() {
  const configured = String(process.env.UPDATE_REPOSITORY || DEFAULT_REPOSITORY).trim();
  return /^[\w.-]+\/[\w.-]+$/.test(configured) ? configured : DEFAULT_REPOSITORY;
}

function getGithubApiUrl() {
  const configured = String(process.env.UPDATE_RELEASE_API_URL || '').trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' && GITHUB_ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return url.toString();
    } catch {
      // Fall through to the fixed official GitHub endpoint.
    }
  }
  return `https://api.github.com/repos/${getRepository()}/releases/latest`;
}

function getGithubReleasePageUrl() {
  return `https://github.com/${getRepository()}/releases`;
}

/** 匿名调用 GitHub API 会受速率限制（HTTP 403），此时回退到无需鉴权的 releases.atom 订阅源。 */
function getGithubReleaseAtomUrl() {
  return `https://github.com/${getRepository()}/releases.atom`;
}

function parseGithubUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''));
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || isPrivateHostname(host)) return null;
    if (!GITHUB_ALLOWED_HOSTS.has(host)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function guardGithubUrl(rawUrl, { resolveDns = true } = {}) {
  const parsed = parseGithubUrl(rawUrl);
  if (!parsed) return null;
  if (!resolveDns) return parsed.toString();
  const validated = await resolveValidatedHttpUrl(parsed.toString());
  return validated ? validated.parsed.toString() : null;
}

export function isAllowedReleaseRedirectUrl(rawUrl) {
  const parsed = parseGithubUrl(rawUrl);
  return Boolean(parsed && GITHUB_ALLOWED_HOSTS.has(parsed.hostname.toLowerCase()));
}

function buildReleasePageUrl() {
  return getGithubReleasePageUrl();
}

function pickAsset(assets, pattern) {
  const asset = assets.find((item) => pattern.test(String(item?.name || '')) && isAllowedReleaseRedirectUrl(item?.browser_download_url));
  if (!asset?.browser_download_url) return null;
  return {
    name: String(asset.name),
    url: String(asset.browser_download_url),
    size: Number.isFinite(Number(asset.size)) ? Number(asset.size) : null,
  };
}

export function normalizeRelease(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  return {
    latestVersion: normalizeVersion(release?.tag_name),
    releaseName: String(release?.name || '').trim() || null,
    releaseUrl: typeof release?.html_url === 'string' && isAllowedReleaseRedirectUrl(release.html_url)
      ? release.html_url
      : null,
    publishedAt: release?.published_at || release?.created_at || null,
    releaseNotes: String(release?.body || '').trim().slice(0, 20_000),
    assets: {
      desktop: pickAsset(assets, /^jukeboxroom-desktop-setup-.*\.exe$/i),
      android: pickAsset(assets, /^openmusic-android-.*\.apk$/i) || pickAsset(assets, /\.apk$/i),
      ios: pickAsset(assets, /^openmusic-ios-.*\.ipa$/i) || pickAsset(assets, /\.ipa$/i),
    },
  };
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripTags(value) {
  return decodeEntities(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function adaptGithubRelease(release) {
  if (!release || typeof release !== 'object') return release;
  const tag = String(release.tag_name || '').trim();
  if (!release.html_url && /^[\w.-]+$/.test(tag)) {
    return { ...release, html_url: `https://github.com/${getRepository()}/releases/tag/${tag}` };
  }
  return release;
}

/** 解析 GitHub releases.atom 订阅源，取最新一条 Release。 */
function parseGithubReleaseAtom(body) {
  const source = String(body || '');
  const entry = source.match(/<entry>([\s\S]*?)<\/entry>/i)?.[1];
  if (!entry) return null;
  const link = entry.match(/<link[^>]*href=['"]([^'"]+)['"]/i)?.[1] || '';
  const tag = link.match(/\/releases\/tag\/([^/?#"']+)/i)?.[1]
    || entry.match(/<id[^>]*>([^<]+)<\/id>/i)?.[1]?.match(/\/releases\/tag\/([^/?#"']+)/i)?.[1];
  if (!tag) return null;
  const title = stripTags(entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || `JukeboxRoom ${tag}`;
  const publishedAt = entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1]?.trim() || null;
  const content = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1];
  return {
    tag_name: tag,
    name: title,
    html_url: `https://github.com/${getRepository()}/releases/tag/${tag}`,
    published_at: publishedAt,
    body: content ? stripTags(content) : '',
    assets: [],
  };
}

// 兼容旧调用方，但更新通道固定为 GitHub。
export function resetChannelCache() {}

const CHANGELOG_CACHE_TTL_MS = 10 * 60 * 1000;
let changelogCache = null;

function getGithubReleasesListUrl() {
  return `https://api.github.com/repos/${getRepository()}/releases?per_page=15`;
}

/**
 * 拉取最近发布说明，供应用内「更新日志」动态展示（不再依赖随包内置的静态文件）。
 * 失败时返回空数组，由前端回退到静态 changelog.md。
 */
export async function fetchRecentReleaseNotes() {
  if (changelogCache && changelogCache.expiresAt > Date.now()) return changelogCache.value;
  try {
    if (typeof globalThis.fetch !== 'function') throw new Error('当前 Node.js 环境不支持 fetch');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const safeUrl = await guardGithubUrl(getGithubReleasesListUrl(), { resolveDns: true });
      if (!safeUrl) throw new Error('GitHub 更新源地址未通过安全校验');
      const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'JukeboxRoom-update-checker',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      if (String(process.env.UPDATE_GITHUB_TOKEN || '').trim()) headers.Authorization = `Bearer ${process.env.UPDATE_GITHUB_TOKEN}`;
      const response = await globalThis.fetch(safeUrl, { headers, signal: controller.signal });
      if (!response.ok) throw new Error(`GitHub 更新源返回 HTTP ${response.status}`);
      const list = await response.json();
      const releases = (Array.isArray(list) ? list : [])
        .filter((item) => item && !item.draft)
        .map((item) => {
          const version = String(item.tag_name || '').replace(/^v/, '').trim();
          const date = String(item.published_at || '').slice(0, 10);
          const body = String(item.body || '');
          return {
            version,
            name: String(item.name || '').trim(),
            date,
            // 首个标题行改写为带日期的统一格式，客户端解析器可直接复用
            body: body.replace(/^##\s+.*$/m, `## ${version}${date ? ` - ${date}` : ''}`),
          };
        })
        .filter((item) => /^\d+\.\d+\.\d+/.test(item.version) && item.body);
      changelogCache = { value: releases, expiresAt: Date.now() + CHANGELOG_CACHE_TTL_MS };
      return releases;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return changelogCache ? changelogCache.value : [];
  }
}

export async function resolveChannel() {
  return CHANNEL_GITHUB;
}

export function createUpdateService({
  currentVersion = CURRENT_VERSION,
  fetchImpl = globalThis.fetch,
  githubApiUrl = getGithubApiUrl(),
  githubToken = String(process.env.UPDATE_GITHUB_TOKEN || '').trim(),
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  staleCacheTtlMs = DEFAULT_STALE_CACHE_TTL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let cached = null;
  let inFlight = null;
  const resolveDns = fetchImpl === globalThis.fetch;

  async function getUpdateInfo() {
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (inFlight) return inFlight;
    if (typeof fetchImpl !== 'function') throw new Error('当前 Node.js 环境不支持 fetch');

    inFlight = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const safeUrl = await guardGithubUrl(githubApiUrl, { resolveDns });
        if (!safeUrl) throw new Error('GitHub 更新源地址未通过安全校验');
        const headers = {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'JukeboxRoom-update-checker',
          'X-GitHub-Api-Version': '2022-11-28',
        };
        if (githubToken) headers.Authorization = `Bearer ${githubToken}`;
        const response = await fetchImpl(safeUrl, { headers, signal: controller.signal });
        let release;
        if (response.ok) {
          release = adaptGithubRelease(await response.json());
        } else {
          const atomUrl = await guardGithubUrl(getGithubReleaseAtomUrl(), { resolveDns });
          if (!atomUrl) throw new Error(`GitHub 更新源返回 HTTP ${response.status}`);
          const atomResponse = await fetchImpl(atomUrl, {
            headers: { ...headers, Accept: 'application/atom+xml' },
            signal: controller.signal,
          });
          if (!atomResponse.ok) throw new Error(`GitHub 更新源返回 HTTP ${response.status}`);
          release = parseGithubReleaseAtom(await atomResponse.text());
          if (!release) throw new Error('GitHub Release 订阅源未找到最新版本');
        }
        const normalized = normalizeRelease(release);
        const value = {
          ok: true,
          channel: CHANNEL_GITHUB,
          releasePageUrl: buildReleasePageUrl(),
          currentVersion: normalizeVersion(currentVersion),
          ...normalized,
          updateAvailable: Boolean(normalized.latestVersion && compareVersions(normalized.latestVersion, currentVersion) > 0),
          checkedAt: new Date().toISOString(),
        };
        cached = { value, expiresAt: Date.now() + cacheTtlMs };
        return value;
      } catch (error) {
        if (cached && cached.expiresAt + staleCacheTtlMs > Date.now()) return { ...cached.value, stale: true };
        throw error;
      } finally {
        clearTimeout(timer);
        inFlight = null;
      }
    })();
    return inFlight;
  }

  return { getUpdateInfo };
}

export const updateService = createUpdateService();
