export interface UpdateAsset {
  name: string;
  url: string;
  size: number | null;
}

export interface UpdateInfo {
  ok: boolean;
  stale?: boolean;
  channel?: 'github';
  releasePageUrl?: string;
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseName: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  releaseNotes: string;
  assets: { desktop: UpdateAsset | null; android: UpdateAsset | null; ios: UpdateAsset | null };
  checkedAt: string;
}

export async function fetchUpdateInfo(signal?: AbortSignal): Promise<UpdateInfo | null> {
  try {
    const response = await fetch(`/api/update?ts=${Date.now()}`, { cache: 'no-store', signal });
    if (!response.ok) return null;
    const data = await response.json() as UpdateInfo;
    if (!data?.ok || !data.assets || typeof data.updateAvailable !== 'boolean') return null;
    return data;
  } catch {
    return null;
  }
}
