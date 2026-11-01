import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPrivateHostname, resolveValidatedHttpUrl } from './outboundUrl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY = 'yuchen0x1/JukeboxRoom';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_STALE_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8000;
export const CHANNEL_GITEE = 'gitee';
const GITEE_ALLOWED_HOSTS = new Set(['gitee.com']);

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

function getGiteeApiUrl() {
  const configured = String(process.env.UPDATE_RELEASE_API_URL || '').trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' && url.hostname === 'gitee.com') return url.toString();
    } catch {
      // Fall through to the fixed official Gitee endpoint.
    }
  }
  return `https://gitee.com/api/v5/repos/${getRepository()}/releases/latest`;
}

function getGiteeReleasePageUrl() {
  return `https://gitee.com/${getRepository()}/releases`;
}

function parseGiteeUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''));
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || host !== 'gitee.com' || isPrivateHostname(host)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function guardGiteeUrl(rawUrl, { resolveDns = true } = {}) {
  const parsed = parseGiteeUrl(rawUrl);
  if (!parsed) return null;
  if (!resolveDns) return parsed.toString();
  const validated = await resolveValidatedHttpUrl(parsed.toString());
  return validated ? validated.parsed.toString() : null;
}

export function isAllowedReleaseRedirectUrl(rawUrl) {
  const parsed = parseGiteeUrl(rawUrl);
  return Boolean(parsed && GITEE_ALLOWED_HOSTS.has(parsed.hostname.toLowerCase()));
}

function buildReleasePageUrl() {
  return getGiteeReleasePageUrl();
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
      desktop: pickAsset(assets, /^openmusic-desktop-.*\.zip$/i) || pickAsset(assets, /desktop.*\.zip$/i),
      android: pickAsset(assets, /^openmusic-android-.*\.apk$/i) || pickAsset(assets, /\.apk$/i),
      ios: pickAsset(assets, /^openmusic-ios-.*\.ipa$/i) || pickAsset(assets, /\.ipa$/i),
    },
  };
}

function adaptGiteeRelease(release) {
  if (!release || typeof release !== 'object') return release;
  const tag = String(release.tag_name || '').trim();
  if (!release.html_url && /^[\w.-]+$/.test(tag)) {
    return { ...release, html_url: `https://gitee.com/${getRepository()}/releases/tag/${tag}` };
  }
  return release;
}

function parseGiteeReleasePage(body) {
  const source = String(body || '');
  if (source.trim().startsWith('{')) {
    try {
      const payload = JSON.parse(source);
      const item = Array.isArray(payload.releases) ? payload.releases[0] : null;
      const release = item?.release;
      const tag = item?.tag?.name;
      if (release && tag) {
        const assets = Array.isArray(release.attach_files) ? release.attach_files.map((asset) => ({
          name: asset.name || asset.file_name,
          browser_download_url: asset.browser_download_url || asset.download_url || asset.url,
          size: asset.size,
        })) : [];
        return {
          tag_name: tag,
          name: release.title || `OpenMusic ${tag}`,
          html_url: `https://gitee.com${release.path || `/${getRepository()}/releases/tag/${tag}`}`,
          published_at: release.created_at,
          body: release.description || '',
          assets,
        };
      }
    } catch {
      // Fall through to the HTML parser for older Gitee responses.
    }
  }
  const tag = source.match(/class=['"]releases-sidebar-item['"][^>]*data-tag=['"](v?[\w.-]+)['"]/i)?.[1]
    || source.match(/class=['"]release-tag-item['"][^>]*data-tag=['"](v?[\w.-]+)['"]/i)?.[1];
  if (!tag) return null;
  const title = source.match(/class=['"]title['"][^>]*href=['"][^"']*\/releases\/tag\/[\w.-]+['"][^>]*>([\s\S]*?)<\/a>/i)?.[1]
    ?.replace(/<[^>]+>/g, '').trim();
  const note = source.match(/<textarea[^>]*class=['"]content['"][^>]*>([\s\S]*?)<\/textarea>/i)?.[1]
    ?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  return {
    tag_name: tag,
    name: title || `OpenMusic ${tag}`,
    html_url: `https://gitee.com/${getRepository()}/releases/tag/${tag.replace(/^v/i, 'v')}`,
    body: note || '',
    assets: [],
  };
}

// 兼容旧调用方，但更新通道固定为国内 Gitee。
export function resetChannelCache() {}

export async function resolveChannel() {
  return CHANNEL_GITEE;
}

export function createUpdateService({
  currentVersion = CURRENT_VERSION,
  fetchImpl = globalThis.fetch,
  giteeApiUrl = getGiteeApiUrl(),
  giteeToken = String(process.env.UPDATE_GITEE_TOKEN || '').trim(),
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
        const safeUrl = await guardGiteeUrl(giteeApiUrl, { resolveDns });
        if (!safeUrl) throw new Error('Gitee 更新源地址未通过安全校验');
        const headers = { Accept: 'application/json', 'User-Agent': 'OpenMusic-update-checker' };
        if (giteeToken) headers.Authorization = `token ${giteeToken}`;
        const response = await fetchImpl(safeUrl, { headers, signal: controller.signal });
        let release;
        if (response.ok) {
          release = adaptGiteeRelease(await response.json());
        } else {
          const pageUrl = await guardGiteeUrl(getGiteeReleasePageUrl(), { resolveDns });
          if (!pageUrl) throw new Error(`Gitee 更新源返回 HTTP ${response.status}`);
          const pageResponse = await fetchImpl(pageUrl, { headers, signal: controller.signal });
          if (!pageResponse.ok) throw new Error(`Gitee 更新源返回 HTTP ${response.status}`);
          release = parseGiteeReleasePage(await pageResponse.text());
          if (!release) throw new Error('Gitee Release 页面未找到最新版本');
        }
        const normalized = normalizeRelease(release);
        const value = {
          ok: true,
          channel: CHANNEL_GITEE,
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
