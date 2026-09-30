const KEY = 'breathe-with-me.settings.v1';

export interface SettingsData {
  master: number;
  music: number;
  sfx: number;
  fullscreen: boolean;
  reduceMotion: boolean;
}

const DEFAULTS: SettingsData = {
  master: 0.8,
  music: 0.8,
  sfx: 0.8,
  fullscreen: false,
  reduceMotion: false,
};

type Listener = (s: SettingsData) => void;

export class Settings {
  data: SettingsData;
  private listeners = new Set<Listener>();

  constructor() {
    this.data = { ...DEFAULTS };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<SettingsData>;
        for (const k of ['master', 'music', 'sfx'] as const) {
          const v = p[k];
          if (typeof v === 'number' && Number.isFinite(v)) this.data[k] = Math.min(1, Math.max(0, v));
        }
        if (typeof p.fullscreen === 'boolean') this.data.fullscreen = p.fullscreen;
        if (typeof p.reduceMotion === 'boolean') this.data.reduceMotion = p.reduceMotion;
      }
    } catch {
      this.data = { ...DEFAULTS };
    }
  }

  get reduceMotion(): boolean {
    return this.data.reduceMotion;
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = value;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // ignore, settings just won't stick
    }
    for (const fn of [...this.listeners]) fn(this.data);
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
