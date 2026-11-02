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
    onMaximizedChanged: (listener: (maximized: boolean) => void) => () => void;
    openMusicConfig: () => Promise<boolean>;
    restartApp: () => Promise<void>;
  };
}
