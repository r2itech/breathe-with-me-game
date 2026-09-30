import { Container, Graphics, Sprite } from 'pixi.js';
import { glowTexture } from './textures';

const MOTES = 7;

export class Tether {
  readonly root = new Container();
  private line = new Graphics();
  private haze = new Graphics();
  private motes: Sprite[] = [];

  constructor() {
    this.haze.blendMode = 'add';
    this.root.addChild(this.haze, this.line);
    for (let i = 0; i < MOTES; i++) {
      const m = new Sprite(glowTexture());
      m.anchor.set(0.5);
      m.blendMode = 'add';
      m.scale.set(0.12);
      this.motes.push(m);
      this.root.addChild(m);
    }
  }

  update(t: number, ax: number, ay: number, bx: number, by: number, connection: number, color: number, matching: boolean): void {
    const c = connection;
    // slack rope when loose, taut when connected
    const sag = (1 - c) * 46 + Math.sin(t * 1.3) * 6 * (1 - c);
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2 + sag;
    const alpha = 0.06 + 0.7 * c * c;

    this.line.clear();
    this.haze.clear();
    if (bx - ax < 4) {
      for (const m of this.motes) m.visible = false;
      return;
    }
    this.line.moveTo(ax, ay).quadraticCurveTo(mx, my, bx, by).stroke({ width: 1.5 + 3 * c, color, alpha });
    this.haze.moveTo(ax, ay).quadraticCurveTo(mx, my, bx, by).stroke({ width: 10 + 26 * c, color, alpha: 0.05 + 0.16 * c * c });

    const flicker = matching ? 1 : 0.4;
    this.motes.forEach((m, i) => {
      const u = (i / MOTES + t * (0.08 + 0.12 * c)) % 1;
      const iu = 1 - u;
      m.visible = true;
      m.x = iu * iu * ax + 2 * iu * u * mx + u * u * bx;
      m.y = iu * iu * ay + 2 * iu * u * my + u * u * by;
      m.tint = color;
      m.alpha = c * c * 0.8 * flicker * Math.sin(u * Math.PI);
    });
  }
}
