import { Container, Graphics, Text } from 'pixi.js';
import { FONT } from '../core/view';
import { FACADE } from '../data/levels';
import { readTime, textAlpha, textLifetime } from './textTiming';

// upright, solid, easy to read: deliberately nothing like the drifting italic thoughts
export class SpeechBubble {
  readonly root = new Container();
  private bg = new Graphics();
  private text: Text;
  private t = -1;
  private hold = 0;

  constructor() {
    this.text = new Text({
      text: '',
      style: { fontFamily: FONT, fontSize: 20, fill: FACADE.text, fontWeight: '700', align: 'center', wordWrap: true, wordWrapWidth: 340 },
    });
    this.text.anchor.set(0.5);
    this.root.addChild(this.bg, this.text);
    this.root.visible = false;
  }

  get busy(): boolean {
    return this.t >= 0;
  }

  // seconds until the current line is fully gone
  get remaining(): number {
    return this.t < 0 ? 0 : Math.max(0, textLifetime(this.hold) - this.t);
  }

  say(line: string, min: number = FACADE.minTime): void {
    this.text.text = line;
    this.hold = readTime(line, min);
    this.t = 0;
    const w = this.text.width + 36;
    const h = this.text.height + 22;
    const g = this.bg;
    g.clear();
    g.roundRect(-w / 2, -h / 2, w, h, 16).fill({ color: FACADE.fill, alpha: 0.96 });
    // little tail pointing down at the speaker
    g.poly([-10, h / 2 - 1, 10, h / 2 - 1, -2, h / 2 + 14]).fill({ color: FACADE.fill, alpha: 0.96 });
    this.root.visible = true;
  }

  // x/y = the spot the tail points at
  update(dt: number, x: number, y: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const h = this.bg.height;
    this.root.position.set(x, y - h / 2 - 12);
    const a = textAlpha(this.t, this.hold);
    this.root.alpha = a;
    this.root.scale.set(0.92 + 0.08 * Math.min(1, this.t / 0.25));
    if (this.t >= textLifetime(this.hold)) {
      this.t = -1;
      this.root.visible = false;
    }
  }
}
