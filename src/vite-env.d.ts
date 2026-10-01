/// <reference types="vite/client" />

interface AppBridge {
  isElectron: boolean;
  setFullscreen(on: boolean): void;
  isFullscreen(): Promise<boolean>;
  quit(): void;
  openExternal(url: string): void;
}

interface Window {
  appBridge?: AppBridge;
}

// Safari 16.4+ only: lets a page say its audio is "playback" rather than
// "auto", so Web Audio keeps sounding with the ring/silent switch on.
interface AudioSession {
  type: 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record';
}

interface Navigator {
  audioSession?: AudioSession;
}
