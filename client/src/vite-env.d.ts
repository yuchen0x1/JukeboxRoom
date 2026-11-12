/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

type DesktopUpdateStateName = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error';

interface DesktopUpdateState {
  state: DesktopUpdateStateName;
  supported: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  releaseNotes: string;
  releaseDate: string | null;
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
  error: string | null;
  checkedAt: string | null;
}

interface Window {
  desktopUpdater?: {
    getState: () => Promise<DesktopUpdateState | undefined>;
    check: () => Promise<DesktopUpdateState | undefined>;
    download: () => Promise<DesktopUpdateState | undefined>;
    cancelDownload: () => Promise<boolean | undefined>;
    install: () => Promise<boolean | undefined>;
    onState: (listener: (state: DesktopUpdateState) => void) => () => void;
  };
  jukeboxWindow?: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    loadMusicState: () => Promise<unknown | null>;
    saveMusicState: (state: unknown) => Promise<boolean>;
    setTrayTrack?: (title: string) => Promise<boolean>;
    onTrayTogglePlay?: (listener: () => void) => () => void;
    onTrayNextTrack?: (listener: () => void) => () => void;
    onMaximizedChanged: (listener: (maximized: boolean) => void) => () => void;
    openMusicConfig: () => Promise<boolean>;
    openDataDir?: () => Promise<boolean>;
    clearLocalData?: () => Promise<boolean>;
    restartApp: () => Promise<void>;
  };
}
