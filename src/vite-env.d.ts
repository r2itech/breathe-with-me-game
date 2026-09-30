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
