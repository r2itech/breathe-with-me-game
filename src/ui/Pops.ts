import { Container, Text } from 'pixi.js';
import { FONT } from '../core/view';
import { TEXT_TIMING } from '../data/levels';
import { readTime, textAlpha, textLifetime } from './textTiming';

interface Pop {
  text: Text;
  life: number;
  hold: number;
  alive: boolean;
}

const POOL = 6;
const FADE_IN = TEXT_TIMING.popFadeIn;

// short feedback words that float up and fade: "Nice", "Too fast"...
export class Pops {
  readonly root = new Container();
  private pool: Pop[] = [];
  private lastShown = new Map<string, number>();
  private clock = 0;

  constructor() {
    for (let i = 0; i < POOL; i++) {
      const text = new Text({ text: '', style: { fontFamily: FONT, fontSize: 24, fill: 0xffffff, fontWeight: '700', letterSpacing: 1 } });
      text.anchor.set(0.5);
      text.visible = false;
      this.root.addChild(text);
      this.pool.push({ text, life: 0, hold: 1, alive: false });
    }
  }

  spawn(label: string, x: number, y: number, color: number, big = false): void {
    // same pop again this soon is just noise
    const last = this.lastShown.get(label);
    if (last !== undefined && this.clock - last < TEXT_TIMING.popCooldown) return;
    this.lastShown.set(label, this.clock);

    // reuse the oldest if all are busy
    const p = this.pool.find((q) => !q.alive) ?? this.pool.reduce((a, b) => (a.life > b.life ? a : b));
    p.text.text = label;
    p.text.style.fill = color;
    p.text.style.fontSize = big ? 30 : 24;
    // stack above anything still floating there
    const busy = this.pool.filter((q) => q.alive && q !== p && Math.abs(q.text.x - x) < 120).length;
    p.text.position.set(x, y - busy * 34);
    p.text.visible = true;
    p.alive = true;
    p.life = 0;
    p.hold = readTime(label, TEXT_TIMING.popMin);
  }

  update(dt: number): void {
    this.clock += dt;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= textLifetime(p.hold, FADE_IN)) {
        p.alive = false;
        p.text.visible = false;
        continue;
      }
      p.text.y -= 14 * dt;
      p.text.alpha = textAlpha(p.life, p.hold, FADE_IN);
      p.text.scale.set(0.85 + 0.15 * Math.min(1, p.life / FADE_IN));
    }
  }
}
