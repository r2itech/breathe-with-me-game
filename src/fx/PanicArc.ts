import { Graphics, Sprite, Texture } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../core/view';

export const PANIC_RED = 0xff4a5c;

// thin red arc on its own radius, so it never reads as the calm ring
export class PanicArc {
  readonly root = new Graphics();
  private shown = 0;

  update(dt: number, x: number, y: number, radius: number, value: number): void {
    this.shown += (value - this.shown) * Math.min(1, dt * 5);
    const g = this.root;
    g.clear();
    const v = Math.max(0, Math.min(1, this.shown));
    if (v < 0.005) return;
    // grows both ways from the bottom
    const mid = Math.PI / 2;
    const half = Math.PI * v;
    g.circle(x, y, radius).stroke({ width: 2, color: PANIC_RED, alpha: 0.1 });
    g.moveTo(x + Math.cos(mid - half) * radius, y + Math.sin(mid - half) * radius);
    g.arc(x, y, radius, mid - half, mid + half);
    g.stroke({ width: 3, color: PANIC_RED, alpha: 0.5 + 0.5 * v, cap: 'round' });
  }
}

let vignetteTex: Texture | null = null;

function vignetteTexture(): Texture {
  if (vignetteTex) return vignetteTex;
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 180;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(160, 90, 40, 160, 90, 190);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(255,255,255,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 320, 180);
  vignetteTex = Texture.from(c);
  return vignetteTex;
}

export class Vignette {
  readonly root: Sprite;

  constructor() {
    this.root = new Sprite(vignetteTexture());
    this.root.tint = PANIC_RED;
    this.root.position.set(-40, -40);
    this.root.width = VIEW_W + 80;
    this.root.height = VIEW_H + 80;
    this.root.alpha = 0;
    this.root.eventMode = 'none';
  }

  update(dt: number, amount: number): void {
    const want = Math.pow(Math.max(0, Math.min(1, amount)), 1.4) * 0.75;
    this.root.alpha += (want - this.root.alpha) * Math.min(1, dt * 3);
  }
}
