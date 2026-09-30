import { Container, Graphics, Text } from 'pixi.js';
import { FONT, VIEW_H, VIEW_W } from '../core/view';

export function drawHeart(g: Graphics, x: number, y: number, size: number, color: number, filled: boolean): void {
  const s = size / 2;
  g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.8, y - s * 1.5, x, y - s * 0.6);
  g.bezierCurveTo(x + s * 0.8, y - s * 1.5, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
  g.closePath();
  if (filled) g.fill({ color });
  else g.stroke({ width: 2, color, alpha: 0.5 });
}

// dim backdrop + rounded panel in the middle of the screen, content is stacked by y
export class Card {
  readonly root = new Container();
  readonly body = new Container();
  private visible = false;
  private panel = new Graphics();
  // blown up on small screens
  private k = 1;

  constructor(
    readonly width: number,
    readonly height: number,
    accent: number,
    shade = 0.55,
  ) {
    const dim = new Graphics().rect(-50, -50, VIEW_W + 100, VIEW_H + 100).fill({ color: 0x05040c, alpha: shade });
    dim.eventMode = 'static';
    const panel = this.panel;
    panel.roundRect(-width / 2, -height / 2, width, height, 22).fill({ color: 0x0c0a1a, alpha: 0.94 });
    panel.roundRect(-width / 2, -height / 2, width, height, 22).stroke({ width: 2, color: accent, alpha: 0.45 });
    panel.position.set(VIEW_W / 2, VIEW_H / 2);
    this.body.position.set(VIEW_W / 2, VIEW_H / 2);
    this.root.addChild(dim, panel, this.body);
    this.root.visible = false;
    this.root.alpha = 0;
  }

  // y is relative to the card center
  addText(text: string, y: number, size: number, color: number, weight: '400' | '600' | '700' = '600', italic = false): Text {
    const t = new Text({
      text,
      style: {
        fontFamily: FONT,
        fontSize: size,
        fill: color,
        fontWeight: weight,
        fontStyle: italic ? 'italic' : 'normal',
        align: 'center',
        wordWrap: true,
        wordWrapWidth: this.width - 70,
        lineHeight: Math.round(size * 1.4),
      },
    });
    t.anchor.set(0.5);
    t.y = y;
    this.body.addChild(t);
    return t;
  }

  addHearts(y: number, count: number, max: number, color: number): Graphics {
    const g = new Graphics();
    const gap = 46;
    for (let i = 0; i < max; i++) drawHeart(g, (i - (max - 1) / 2) * gap, y, 30, color, i < count);
    this.body.addChild(g);
    return g;
  }

  setScale(k: number): void {
    this.k = k;
    this.panel.scale.set(k);
  }

  show(): void {
    this.visible = true;
    this.root.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  get shown(): boolean {
    return this.visible;
  }

  update(dt: number): void {
    const want = this.visible ? 1 : 0;
    this.root.alpha += (want - this.root.alpha) * Math.min(1, dt * 5);
    if (!this.visible && this.root.alpha < 0.01) this.root.visible = false;
    this.body.scale.set(this.k * (0.96 + 0.04 * this.root.alpha));
  }
}
