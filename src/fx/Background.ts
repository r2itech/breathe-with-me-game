import { Container, Sprite } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../core/view';
import type { Palette } from '../data/levels';
import { gradientTexture } from './textures';

// oversized so screen shake never shows an edge
const PAD = 40;

export class Background {
  readonly root = new Container();
  private cold: Sprite;
  private warm: Sprite;

  constructor(p: Palette) {
    this.cold = new Sprite(gradientTexture(p.bgTop, p.bgBottom));
    this.warm = new Sprite(gradientTexture(p.warmTop, p.warmBottom));
    for (const s of [this.cold, this.warm]) {
      s.position.set(-PAD, -PAD);
      s.width = VIEW_W + PAD * 2;
      s.height = VIEW_H + PAD * 2;
      this.root.addChild(s);
    }
    this.warm.alpha = 0;
    this.warm.visible = false;
  }

  setWarmth(w: number): void {
    this.warm.alpha = Math.max(0, Math.min(1, w));
    // a full-screen sprite at 0 alpha still costs a full-screen fill
    this.warm.visible = this.warm.alpha > 0.001;
  }
}
