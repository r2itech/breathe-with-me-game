import { Container, Graphics, Sprite } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../core/view';
import { glowTexture } from './textures';

// release-night flicker: torn scanline bars + a red/cyan split ghost of a circle
export class Glitch {
  readonly root = new Container();
  private bars = new Graphics();
  private red: Sprite;
  private cyan: Sprite;
  private timer = 1;
  private burst = 0;

  constructor() {
    this.red = new Sprite(glowTexture());
    this.cyan = new Sprite(glowTexture());
    for (const s of [this.red, this.cyan]) {
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.alpha = 0;
    }
    this.red.tint = 0xff3050;
    this.cyan.tint = 0x30e0ff;
    this.bars.blendMode = 'add';
    this.root.addChild(this.red, this.cyan, this.bars);
  }

  update(dt: number, intensity: number, x: number, y: number, radius: number, enabled: boolean): void {
    const g = this.bars;
    g.clear();
    if (!enabled || intensity < 0.15) {
      this.red.alpha = 0;
      this.cyan.alpha = 0;
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      // more often the more stressed things are
      this.burst = 0.08 + Math.random() * 0.14;
      this.timer = 0.4 + Math.random() * (3.5 - 3 * intensity);
    }
    if (this.burst > 0) {
      this.burst -= dt;
      const n = 2 + Math.floor(Math.random() * 4 * intensity);
      for (let i = 0; i < n; i++) {
        const by = Math.random() * VIEW_H;
        const bh = 2 + Math.random() * 14;
        const bx = Math.random() * VIEW_W * 0.5;
        g.rect(bx, by, VIEW_W * (0.2 + Math.random() * 0.6), bh).fill({ color: i % 2 ? 0xff3050 : 0x30e0ff, alpha: 0.06 + 0.12 * intensity });
      }
      const off = 4 + 8 * intensity;
      const sc = (radius * 2.6) / 256;
      this.red.position.set(x - off, y);
      this.cyan.position.set(x + off, y);
      this.red.scale.set(sc);
      this.cyan.scale.set(sc);
      this.red.alpha = 0.25 * intensity;
      this.cyan.alpha = 0.25 * intensity;
    } else {
      this.red.alpha = 0;
      this.cyan.alpha = 0;
    }
  }
}
