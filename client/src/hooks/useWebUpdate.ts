import { useEffect, useState } from 'react';

const UPDATE_INTERVAL_MS = 30 * 60 * 1000;

export function useWebUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    const workers = navigator.serviceWorker;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;

    function observeWaiting() {
      if (!disposed) setWaiting(workers.controller ? (registration?.waiting ?? null) : null);
    }

    function observeInstallation() {
      installing?.removeEventListener('statechange', observeWaiting);
      installing = registration?.installing ?? null;
      installing?.addEventListener('statechange', observeWaiting);
    }

    function check() {
      if (document.visibilityState === 'visible') void registration?.update().catch(() => {});
    }

    void workers.register('/sw.js', { updateViaCache: 'none' }).then((result) => {
      if (disposed) return;
      registration = result;
      result.addEventListener('updatefound', observeInstallation);
      observeInstallation();
      observeWaiting();
    }).catch(() => {});

    workers.addEventListener('controllerchange', observeWaiting);
    document.addEventListener('visibilitychange', check);
    const timer = window.setInterval(check, UPDATE_INTERVAL_MS);
    return () => {
      disposed = true;
      registration?.removeEventListener('updatefound', observeInstallation);
      installing?.removeEventListener('statechange', observeWaiting);
      workers.removeEventListener('controllerchange', observeWaiting);
      document.removeEventListener('visibilitychange', check);
      window.clearInterval(timer);
    };
  }, []);

  return waiting;
}

export function activateWebUpdate(worker: ServiceWorker): Promise<void> {
  if (navigator.serviceWorker.controller === worker) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const workers = navigator.serviceWorker;
    const timeout = window.setTimeout(() => {
      workers.removeEventListener('controllerchange', onChange);
      reject(new Error('Service worker activation timed out'));
    }, 10_000);

    function onChange() {
      if (workers.controller !== worker) return;
      window.clearTimeout(timeout);
      workers.removeEventListener('controllerchange', onChange);
      resolve();
    }

    workers.addEventListener('controllerchange', onChange);
    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      window.clearTimeout(timeout);
      workers.removeEventListener('controllerchange', onChange);
      reject(error);
    }
  });
}
