/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface Window {
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
    restartApp: () => Promise<void>;
  };
}
