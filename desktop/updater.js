const UPDATE_STATES = new Set([
  'idle',
  'checking',
  'available',
  'downloading',
  'downloaded',
  'not-available',
  'error',
]);

function clampPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : 0;
}

function normalizeVersion(value) {
  const version = String(value || '').trim().replace(/^v/i, '');
  return version || null;
}

function safeText(value, maxLength = 8_000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function initialState({ supported, currentVersion }) {
  return {
    state: 'idle',
    supported: Boolean(supported),
    currentVersion: normalizeVersion(currentVersion),
    latestVersion: null,
    releaseNotes: '',
    releaseDate: null,
    percent: 0,
    bytesPerSecond: 0,
    transferred: 0,
    total: 0,
    error: null,
    checkedAt: null,
  };
}

function safeError() {
  // Do not expose URLs, response bodies, filesystem paths or updater internals
  // to the renderer process.
  return '更新服务暂时不可用，请稍后重试。';
}

function createDesktopUpdater({
  updater,
  supported = false,
  currentVersion = null,
  createCancellationToken = null,
  logger = console,
} = {}) {
  const canUpdate = Boolean(supported && updater);
  let state = initialState({ supported: canUpdate, currentVersion });
  const listeners = new Set();
  const eventHandlers = [];
  let checkPromise = null;
  let downloadPromise = null;
  let downloadCancellationToken = null;
  let cancelRequested = false;

  const emit = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) {
      try {
        listener({ ...state });
      } catch {
        // A renderer listener must never break updater event handling.
      }
    }
    return { ...state };
  };

  const updateInfo = (info, nextState = 'available') => emit({
    state: UPDATE_STATES.has(nextState) ? nextState : 'available',
    latestVersion: normalizeVersion(info?.version),
    releaseNotes: safeText(info?.releaseNotes),
    releaseDate: typeof info?.releaseDate === 'string' ? info.releaseDate : null,
    total: Number.isFinite(Number(info?.files?.[0]?.size)) ? Number(info.files[0].size) : 0,
    percent: 0,
    bytesPerSecond: 0,
    transferred: 0,
    error: null,
    checkedAt: new Date().toISOString(),
  });

  const configure = () => {
    if (!canUpdate) return;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    if ('autoInstallEvent' in updater) updater.autoInstallEvent = 'manual';

    const listen = (event, handler) => {
      if (typeof updater.on !== 'function') return;
      updater.on(event, handler);
      eventHandlers.push([event, handler]);
    };
    listen('checking-for-update', () => emit({ state: 'checking', error: null }));
    listen('update-available', (info) => updateInfo(info, 'available'));
    listen('update-not-available', () => emit({
      state: 'not-available',
      latestVersion: null,
      releaseNotes: '',
      releaseDate: null,
      percent: 0,
      total: 0,
      error: null,
      checkedAt: new Date().toISOString(),
    }));
    listen('download-progress', (progress) => emit({
      state: 'downloading',
      percent: clampPercent(progress?.percent),
      bytesPerSecond: Number.isFinite(Number(progress?.bytesPerSecond)) ? Number(progress.bytesPerSecond) : 0,
      transferred: Number.isFinite(Number(progress?.transferred)) ? Number(progress.transferred) : 0,
      total: Number.isFinite(Number(progress?.total)) ? Number(progress.total) : 0,
      error: null,
    }));
    listen('update-downloaded', (info) => updateInfo(info, 'downloaded'));
    listen('update-cancelled', () => emit({ state: 'available', error: null }));
    listen('error', (error) => {
      try { logger.warn?.('[desktop-updater] update failed', error?.name || 'Error'); } catch { /* logging is best effort */ }
      emit({ state: 'error', error: safeError(), checkedAt: new Date().toISOString() });
    });
  };

  configure();

  const getState = () => ({ ...state });

  async function check() {
    if (!canUpdate) return emit({ state: 'not-available', error: null });
    if (state.state === 'downloaded') return getState();
    if (checkPromise) return checkPromise;
    emit({ state: 'checking', error: null, checkedAt: null });
    checkPromise = Promise.resolve()
      .then(() => updater.checkForUpdates())
      .then((result) => {
        if (state.state === 'checking') {
          if (result?.updateInfo?.version) updateInfo(result.updateInfo, 'available');
          else emit({ state: 'not-available', error: null, checkedAt: new Date().toISOString() });
        }
        return getState();
      })
      .catch(() => emit({ state: 'error', error: safeError(), checkedAt: new Date().toISOString() }))
      .finally(() => { checkPromise = null; });
    return checkPromise;
  }

  async function download() {
    if (!canUpdate || !state.latestVersion || state.state === 'downloaded') return getState();
    if (downloadPromise) return downloadPromise;
    cancelRequested = false;
    downloadCancellationToken = typeof createCancellationToken === 'function' ? createCancellationToken() : null;
    emit({ state: 'downloading', percent: 0, bytesPerSecond: 0, transferred: 0, total: 0, error: null });
    downloadPromise = (async () => {
      const maxAttempts = 2;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (attempt > 0) {
          emit({ state: 'downloading', percent: 0, bytesPerSecond: 0, transferred: 0, total: 0, error: null });
        }
        try {
          await updater.downloadUpdate(downloadCancellationToken || undefined);
          return getState();
        } catch {
          if (cancelRequested) {
            return emit({ state: 'available', percent: 0, bytesPerSecond: 0, transferred: 0, total: 0, error: null });
          }
          if (attempt + 1 === maxAttempts) {
            return emit({ state: 'error', error: safeError(), checkedAt: new Date().toISOString() });
          }
        }
      }
      return getState();
    })()
      .finally(() => {
        downloadCancellationToken?.dispose?.();
        downloadCancellationToken = null;
        cancelRequested = false;
        downloadPromise = null;
      });
    return downloadPromise;
  }

  function cancelDownload() {
    if (!canUpdate || state.state !== 'downloading' || !downloadCancellationToken) return false;
    cancelRequested = true;
    downloadCancellationToken.cancel();
    return true;
  }

  function install() {
    if (!canUpdate || state.state !== 'downloaded' || typeof updater.quitAndInstall !== 'function') return false;
    try {
      updater.quitAndInstall(false, true);
      return true;
    } catch {
      emit({ state: 'error', error: safeError() });
      return false;
    }
  }

  function onState(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    listener(getState());
    return () => listeners.delete(listener);
  }

  function dispose() {
    for (const [event, handler] of eventHandlers) updater?.removeListener?.(event, handler);
    eventHandlers.length = 0;
    listeners.clear();
  }

  return Object.freeze({ getState, check, download, cancelDownload, install, onState, dispose });
}

module.exports = { createDesktopUpdater, normalizeVersion, safeError };
