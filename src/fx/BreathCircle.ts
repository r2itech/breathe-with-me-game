import { Container, Graphics, Sprite } from 'pixi.js';
import { glowTexture } from './textures';

const POINTS = 96;

export interface CircleLook {
  radius: number;
  color: number;
  // 0 calm/smooth .. 1 panicked, noisy edge
  wobble: number;
  // fast shivering edge, used when the player is the panicked one
  tremble: number;
  glow: number;
  alpha: number;
}

export class BreathCircle {
  readonly root = new Container();
  private glow: Sprite;
  private body = new Graphics();
  private echo = new Graphics();
  private seed = Math.random() * 100;
  x = 0;
  y = 0;

  constructor() {
    this.glow = new Sprite(glowTexture());
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.root.addChild(this.glow, this.echo, this.body);
  }

  update(t: number, look: CircleLook): void {
    const { radius: r, color, wobble, tremble } = look;
    this.root.position.set(this.x, this.y);
    this.root.alpha = look.alpha;

    this.glow.tint = color;
    this.glow.scale.set((r * 3.4) / 256);
    this.glow.alpha = 0.35 + 0.5 * look.glow;

    const s = this.seed;
    const pts: number[] = [];
    for (let i = 0; i < POINTS; i++) {
      const a = (i / POINTS) * Math.PI * 2;
      let k =
        Math.sin(a * 3 + t * 2.1 + s) * 0.5 +
        Math.sin(a * 5 - t * 3.4 + s * 1.7) * 0.3 +
        Math.sin(a * 9 + t * 6.2 + s * 0.3) * 0.2;
      k *= wobble * 0.12;
      if (tremble > 0) k += Math.sin(a * 23 + t * 47 + s) * tremble * 0.035 + Math.sin(a * 31 - t * 61) * tremble * 0.02;
      const rr = r * (1 + k);
      pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const b = this.body;
    b.clear();
    b.poly(pts).fill({ color, alpha: 0.2 + 0.12 * look.glow });
    b.poly(pts).stroke({ width: 3, color, alpha: 0.9 });
    b.circle(0, 0, r * 0.55).fill({ color, alpha: 0.12 });
  }

  // faint ring showing a remembered steady rhythm
  setEcho(radius: number, alpha: number, color: number): void {
    const e = this.echo;
    e.clear();
    if (alpha <= 0.01) return;
    e.circle(0, 0, radius).stroke({ width: 2, color, alpha });
  }
}
