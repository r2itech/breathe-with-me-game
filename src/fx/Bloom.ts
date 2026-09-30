import { Container, Graphics, Sprite } from 'pixi.js';
import { glowTexture } from './textures';

export class Bloom {
  readonly root = new Container();
  private core: Sprite;
  private wash: Sprite;
  private rings = new Graphics();
  private t = -1;

  constructor(private color: number, private size = 1) {
    this.core = new Sprite(glowTexture());
    this.wash = new Sprite(glowTexture());
    for (const s of [this.wash, this.core]) {
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.alpha = 0;
      s.tint = color;
    }
    this.rings.blendMode = 'add';
    this.root.addChild(this.wash, this.rings, this.core);
  }

  get active(): boolean {
    return this.t >= 0;
  }

  // 0..1 once started, used to warm the palette
  get amount(): number {
    return this.t < 0 ? 0 : Math.min(1, this.t / 2.5);
  }

  start(): void {
    if (this.t < 0) this.t = 0;
  }

  update(dt: number, x: number, y: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const t = this.t;
    const s = this.size;
    this.root.position.set(x, y);

    const swell = 1 - Math.exp(-t * 1.4);
    this.core.scale.set((2.2 + 3 * swell) * s);
    this.core.alpha = Math.min(1, t * 1.5) * (0.75 - 0.3 * Math.min(1, t / 6));
    this.wash.scale.set((4 + 9 * swell) * s);
    this.wash.alpha = Math.min(0.55, t * 0.4);

    const g = this.rings;
    g.clear();
    for (let i = 0; i < 3; i++) {
      const rt = t - i * 0.5;
      if (rt <= 0 || rt > 3.5) continue;
      const r = (60 + rt * 260) * s;
      const a = (1 - rt / 3.5) * 0.5;
      g.circle(0, 0, r).stroke({ width: 3 + 6 * (1 - rt / 3.5), color: this.color, alpha: a });
    }
  }
}
