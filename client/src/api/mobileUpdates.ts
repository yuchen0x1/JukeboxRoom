import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { fetchWithTimeout } from './http';

const REPOSITORY = 'https://github.com/yuchen0x1/JukeboxRoom';
const RELEASE_API = 'https://api.github.com/repos/yuchen0x1/JukeboxRoom/releases?per_page=100';

export interface MobileRelease {
  tag_name: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string;
  body?: string;
  assets?: Array<{ name: string; browser_download_url: string }>;
}

export async function fetchMobileReleases(signal?: AbortSignal): Promise<MobileRelease[]> {
  let data: unknown;
  if (Capacitor.getPlatform() === 'android') {
    const response = await CapacitorHttp.get({ url: RELEASE_API, connectTimeout: 10000, readTimeout: 12000,
      headers: { Accept: 'application/vnd.github+json' }, responseType: 'json' });
    if (response.status < 200 || response.status >= 300) throw new Error('无法检查更新，请稍后重试或打开 GitHub 发布页');
    data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  } else {
    const response = await fetchWithTimeout(RELEASE_API, { signal, cache: 'no-store' });
    if (!response.ok) throw new Error('无法检查更新，请稍后重试或打开 GitHub 发布页');
    data = await response.json();
  }
  if (!Array.isArray(data)) throw new Error('更新服务返回了无法识别的数据');
  return data.filter((item): item is MobileRelease => Boolean(item && typeof item.tag_name === 'string' && !item.draft && !item.prerelease));
}

function compareVersions(left: string, right: string): number {
  const a = left.replace(/^v/, '').split('.').map(Number);
  const b = right.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i += 1) { if (a[i] !== b[i]) return a[i] - b[i]; }
  return 0;
}

export function selectAndroidUpdate(releases: MobileRelease[], currentVersion: string) {
  const candidates = releases.flatMap((release) => {
    if (release.draft || release.prerelease || !/^v?0\.\d+\.\d+$/.test(release.tag_name)) return [];
    const asset = release.assets?.find((item) => {
      if (!/^(?:jukeboxroom|openmusic)-android-.*\.apk$/i.test(item.name)) return false;
      try {
        const url = new URL(item.browser_download_url);
        return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password
          && url.pathname.startsWith('/yuchen0x1/JukeboxRoom/releases/download/');
      } catch { return false; }
    });
    return asset ? [{ version: release.tag_name.replace(/^v/, ''), downloadUrl: asset.browser_download_url,
      releaseUrl: `${REPOSITORY}/releases/tag/${encodeURIComponent(release.tag_name)}` }] : [];
  }).sort((a, b) => compareVersions(b.version, a.version));
  const latest = candidates[0];
  return latest ? { ...latest, updateAvailable: /^\d+\.\d+\.\d+$/.test(currentVersion) && compareVersions(latest.version, currentVersion) > 0 } : null;
}
