import { Container, Text } from 'pixi.js';
import type { LevelRun } from '../breath/LevelRun';
import { FONT, VIEW_H, VIEW_W } from '../core/view';
import { TEXT_TIMING, THOUGHTS, WAVE, type LevelConfig } from '../data/levels';
import { readTime, textAlpha, textLifetime } from '../ui/textTiming';

interface Thought {
  box: Container;
  text: Text;
  // offset copy that makes it look out of focus
  ghost: Text;
  life: number;
  hold: number;
  vx: number;
  vy: number;
  scale: number;
  alpha: number;
  seed: number;
  alive: boolean;
}

export interface ThoughtSource {
  x: number;
  y: number;
  radius: number;
}

const POOL = 6;
const MAX_Y = VIEW_H - WAVE.height - THOUGHTS.bottomMargin;
const T_IN = TEXT_TIMING.thoughtFadeIn;
const T_OUT = TEXT_TIMING.thoughtFadeOut;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// the person's anxious thoughts, drifting slowly out of their circle
export class Distractions {
  readonly root = new Container();
  private pool: Thought[] = [];
  private timer = 3;
  private sinceSpawn = 99;
  private spikeAcc = 0;
  private waiting = false;
  private time = 0;
  private everSpawned = false;
  onSpawn: ((ping: boolean) => void) | null = null;
  // first thought ever, the tutorial hooks this
  onFirst: (() => void) | null = null;

  constructor(
    private cfg: LevelConfig['distractions'],
    private words: string[],
    color: number,
  ) {
    const style = {
      fontFamily: FONT,
      fontSize: cfg.size,
      fill: color,
      fontStyle: 'italic' as const,
      fontWeight: '500' as const,
      letterSpacing: 1,
    };
    for (let i = 0; i < POOL; i++) {
      const box = new Container();
      const ghost = new Text({ text: '', style });
      ghost.anchor.set(0.5);
      ghost.alpha = 0.35;
      const text = new Text({ text: '', style });
      text.anchor.set(0.5);
      box.addChild(ghost, text);
      box.visible = false;
      this.root.addChild(box);
      this.pool.push({ box, text, ghost, life: 0, hold: 3, vx: 0, vy: 0, scale: 1, alpha: 1, seed: 0, alive: false });
    }
    this.timer = this.nextInterval(0.5);
  }

  // 0 = in sync, 1 = lost / panicking
  private distress(run: LevelRun): number {
    const c = run.connection;
    return Math.min(1, Math.max(0, Math.max(1 - c / 0.7, run.panicMeter * 1.2)));
  }

  private nextInterval(d: number): number {
    const [a, b] = this.cfg.interval;
    const mult = lerp(THOUGHTS.syncInterval, THOUGHTS.lostInterval, d);
    return (a + Math.random() * (b - a)) * mult;
  }

  private get cap(): number {
    return Math.min(THOUGHTS.maxOnScreen, this.cfg.maxAlive);
  }

  private get aliveCount(): number {
    return this.pool.reduce((n, t) => n + (t.alive ? 1 : 0), 0);
  }

  update(dt: number, run: LevelRun, calmMotion: boolean, src: ThoughtSource, player: { x: number; y: number }): void {
    this.time += dt;
    this.sinceSpawn += dt;
    const d = this.distress(run);
    const active = run.phase === 'lead' || run.phase === 'anchor';
    if (active && !run.failed) {
      this.timer -= dt;
      if (this.timer <= 0) this.waiting = true;
      // fire off-beat, mid-exhale, when pressing would be exactly wrong
      const npc = run.npc;
      const offBeat = npc.state === 'out' && npc.fromTransition > 0.3 && npc.toTransition > 0.4;
      if (this.waiting && (offBeat || this.timer < -2) && this.spawn(src, player, d, calmMotion)) {
        this.waiting = false;
        this.timer = this.nextInterval(d);
      }
      if (run.inSpike) {
        // spikes push more of them out (still capped and spaced)
        this.spikeAcc += dt * this.cfg.spikeRate;
        if (this.spikeAcc >= 1 && this.spawn(src, player, Math.max(d, 0.8), calmMotion)) this.spikeAcc -= 1;
        this.spikeAcc = Math.min(this.spikeAcc, 2);
      } else {
        this.spikeAcc = 0;
      }
    }

    for (const t of this.pool) {
      if (!t.alive) continue;
      t.life += dt;
      if (t.life >= textLifetime(t.hold, T_IN, T_OUT)) {
        t.alive = false;
        t.box.visible = false;
        continue;
      }
      // when things go badly they creep toward you, slowly
      const pull = d * THOUGHTS.towardPlayer;
      const dx = player.x - t.box.x;
      const dy = player.y - t.box.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      t.box.x += (t.vx + (dx / len) * pull) * dt;
      t.box.y += (t.vy + (dy / len) * pull) * dt;
      t.box.y = Math.min(MAX_Y, Math.max(THOUGHTS.minY, t.box.y));
      t.box.x = Math.min(VIEW_W - 90, Math.max(90, t.box.x));

      t.box.alpha = t.alpha * textAlpha(t.life, t.hold, T_IN, T_OUT);
      t.box.scale.set(t.scale);
      if (!calmMotion) {
        t.box.rotation = Math.sin(this.time * 1.2 + t.seed) * 0.04;
        t.box.skew.x = Math.sin(this.time * 1.6 + t.seed * 2) * 0.06;
        t.ghost.x = 2.5 + Math.sin(this.time * 2 + t.seed) * 1.2;
        t.ghost.y = 1.5;
      }
    }
    this.separate();
  }

  // push overlapping thoughts apart so every one stays readable
  private separate(): void {
    const alive = this.pool.filter((t) => t.alive);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i].box;
        const b = alive[j].box;
        const ox = (a.width + b.width) / 2 + THOUGHTS.spacing - Math.abs(a.x - b.x);
        const oy = (a.height + b.height) / 2 + THOUGHTS.spacing - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        // separate along the axis with the smaller overlap
        if (oy < ox) {
          const s = a.y < b.y ? -1 : 1;
          a.y += (s * oy) / 2;
          b.y -= (s * oy) / 2;
        } else {
          const s = a.x < b.x ? -1 : 1;
          a.x += (s * ox) / 2;
          b.x -= (s * ox) / 2;
        }
      }
    }
  }

  private overlapsAny(x: number, y: number, w: number, h: number): boolean {
    return this.pool.some((t) => {
      if (!t.alive) return false;
      const b = t.box;
      return Math.abs(b.x - x) < (b.width + w) / 2 + THOUGHTS.spacing && Math.abs(b.y - y) < (b.height + h) / 2 + THOUGHTS.spacing;
    });
  }

  // returns false if it couldn't spawn right now (cap, spacing, no free spot)
  private spawn(src: ThoughtSource, player: { x: number; y: number }, d: number, calmMotion: boolean): boolean {
    if (this.aliveCount >= this.cap || this.sinceSpawn < THOUGHTS.minGap) return false;
    const t = this.pool.find((p) => !p.alive);
    if (!t) return false;
    const word = this.words[Math.floor(Math.random() * this.words.length)];
    t.text.text = word;
    t.ghost.text = word;
    t.scale = lerp(THOUGHTS.scaleSync, THOUGHTS.scaleLost, d);
    t.box.scale.set(t.scale);
    const w = t.box.width;
    const h = t.box.height;

    // come out of the edge of their circle, never straight up into the panel; distressed ones lean toward you
    const toward = Math.atan2(player.y - src.y, player.x - src.x);
    const r = src.radius + 20;
    let x = 0;
    let y = 0;
    let a = 0;
    let found = false;
    for (let tries = 0; tries < 10 && !found; tries++) {
      a = Math.random() * Math.PI * 2;
      if (Math.sin(a) < -0.8) a = Math.PI - a;
      a = lerp(a, toward + (Math.random() - 0.5) * 1.2, d * 0.5);
      x = Math.min(VIEW_W - 90, Math.max(90, src.x + Math.cos(a) * r));
      y = Math.min(MAX_Y, Math.max(THOUGHTS.minY, src.y + Math.sin(a) * r));
      found = !this.overlapsAny(x, y, w, h);
    }
    if (!found) return false;

    t.box.position.set(x, y);
    t.box.rotation = 0;
    t.box.skew.set(0, 0);
    t.ghost.position.set(calmMotion ? 0 : 2.5, calmMotion ? 0 : 1.5);
    const speed = THOUGHTS.speed * (0.7 + Math.random() * 0.6);
    t.vx = Math.cos(a) * speed;
    t.vy = Math.sin(a) * speed;
    t.alpha = lerp(THOUGHTS.alphaSync, THOUGHTS.alphaLost, d);
    // readable time never shrinks with sync, only size/brightness do
    t.hold = readTime(word, TEXT_TIMING.thoughtMin);
    t.seed = Math.random() * 100;
    t.life = 0;
    t.alive = true;
    t.box.visible = true;
    t.box.alpha = 0;
    this.sinceSpawn = 0;
    this.onSpawn?.(Math.random() < this.cfg.pingChance);
    if (!this.everSpawned) {
      this.everSpawned = true;
      this.onFirst?.();
    }
    return true;
  }
}
