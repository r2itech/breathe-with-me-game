const KEY = 'breathe-with-me.save.v1';

export interface Stats {
  breaths: number;
  syncTime: number;
  playTime: number;
}

export interface SaveData {
  // number of levels finished, levels unlock in order
  completed: number;
  finished: boolean;
  stats: Stats;
  // best hearts per level, 0 = not rated yet
  hearts: number[];
}

function defaults(): SaveData {
  return {
    completed: 0,
    finished: false,
    stats: { breaths: 0, syncTime: 0, playTime: 0 },
    hearts: [],
  };
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export class Save {
  data: SaveData;

  constructor() {
    this.data = Save.load();
  }

  get hasProgress(): boolean {
    return this.data.completed > 0 || this.data.stats.breaths > 0;
  }

  completeLevel(index: number): void {
    this.data.completed = Math.max(this.data.completed, index + 1);
    this.write();
  }

  // returns true if it's a new best
  setHearts(index: number, hearts: number): boolean {
    const prev = this.data.hearts[index] ?? 0;
    if (hearts <= prev) return false;
    while (this.data.hearts.length <= index) this.data.hearts.push(0);
    this.data.hearts[index] = hearts;
    this.write();
    return true;
  }

  heartsFor(index: number): number {
    return this.data.hearts[index] ?? 0;
  }

  addStats(breaths: number, syncTime: number, playTime: number): void {
    this.data.stats.breaths += breaths;
    this.data.stats.syncTime += syncTime;
    this.data.stats.playTime += playTime;
    this.write();
  }

  reset(): void {
    this.data = defaults();
    this.write();
  }

  write(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // storage can be blocked, progress just won't persist
    }
  }

  private static load(): SaveData {
    const d = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return d;
      const p = JSON.parse(raw) as Partial<SaveData>;
      d.completed = Math.max(0, Math.floor(num(p.completed, 0)));
      d.finished = !!p.finished;
      if (Array.isArray(p.hearts)) d.hearts = p.hearts.map((h) => Math.max(0, Math.min(3, Math.floor(num(h, 0)))));
      if (p.stats) {
        d.stats.breaths = num(p.stats.breaths, 0);
        d.stats.syncTime = num(p.stats.syncTime, 0);
        d.stats.playTime = num(p.stats.playTime, 0);
      }
    } catch {
      return defaults();
    }
    return d;
  }
}
