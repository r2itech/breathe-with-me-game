import { Container, Graphics, Text } from 'pixi.js';
import { FONT, VIEW_W } from '../core/view';

const Y = 30;
const BAR_W = 300;

interface Step {
  box: Container;
  dot: Graphics;
  num: Text;
  name: Text;
  lit: number;
  done: boolean;
}

// top-center stepper: which phase you're in, what it wants, how far along
export class PhasePanel {
  readonly root = new Container();
  private steps: Step[] = [];
  private objective: Text;
  private bar = new Graphics();
  private seps: Text[] = [];
  private shownProgress = 0;
  private pulse = 0;
  private lastIndex = -1;

  constructor(
    names: string[],
    private accent: number,
  ) {
    const gap = 26;
    const built = names.map((n, i) => {
      const box = new Container();
      const dot = new Graphics();
      const num = new Text({ text: String(i + 1), style: { fontFamily: FONT, fontSize: 13, fill: 0x14101f, fontWeight: '700' } });
      num.anchor.set(0.5);
      const name = new Text({ text: n, style: { fontFamily: FONT, fontSize: 16, fill: 0xffffff, fontWeight: '700', letterSpacing: 2 } });
      name.anchor.set(0, 0.5);
      name.x = 16;
      box.addChild(dot, num, name);
      return { box, dot, num, name, lit: 0, done: false, width: 16 + name.width };
    });
    const total = built.reduce((w, b) => w + b.width, 0) + gap * 2 * (built.length - 1);
    let x = VIEW_W / 2 - total / 2 + 9;
    built.forEach((b, i) => {
      b.box.position.set(x, Y);
      this.root.addChild(b.box);
      this.steps.push(b);
      x += b.width + gap;
      if (i < built.length - 1) {
        const sep = new Text({ text: '·', style: { fontFamily: FONT, fontSize: 20, fill: 0xffffff } });
        sep.anchor.set(0.5);
        sep.position.set(x - 4, Y);
        sep.alpha = 0.35;
        this.seps.push(sep);
        this.root.addChild(sep);
        x += gap;
      }
    });

    this.objective = new Text({ text: '', style: { fontFamily: FONT, fontSize: 19, fill: 0xf2ecff, fontWeight: '600' } });
    this.objective.anchor.set(0.5);
    this.objective.position.set(VIEW_W / 2, Y + 34);
    this.root.addChild(this.objective, this.bar);
  }

  // little flash when a banner lands in here
  flash(): void {
    this.pulse = 1;
  }

  update(dt: number, index: number, objective: string, progress: number): void {
    if (index !== this.lastIndex) {
      this.lastIndex = index;
      this.shownProgress = 0;
    }
    this.objective.text = objective;
    this.pulse = Math.max(0, this.pulse - dt * 1.5);

    this.steps.forEach((s, i) => {
      const current = i === index;
      const done = i < index;
      s.lit += ((current ? 1 : 0) - s.lit) * Math.min(1, dt * 6);
      s.num.text = done ? '✓' : String(i + 1);
      s.dot.clear();
      const r = 9 + 2 * s.lit;
      s.dot.circle(0, 0, r).fill({ color: done ? this.accent : 0xffffff, alpha: done ? 0.85 : 0.25 + 0.7 * s.lit });
      if (current) s.dot.circle(0, 0, r + 4 + 4 * this.pulse).stroke({ width: 2, color: this.accent, alpha: 0.5 + 0.5 * this.pulse });
      s.name.alpha = current ? 1 : done ? 0.6 : 0.35;
      // restyling re-renders the text, only do it on change
      if (done !== s.done) {
        s.done = done;
        s.name.style.fill = done ? this.accent : 0xffffff;
      }
    });

    this.shownProgress += (progress - this.shownProgress) * Math.min(1, dt * 4);
    const b = this.bar;
    const y = Y + 58;
    b.clear();
    b.roundRect(VIEW_W / 2 - BAR_W / 2, y, BAR_W, 4, 2).fill({ color: 0xffffff, alpha: 0.12 });
    const w = Math.max(0, Math.min(1, this.shownProgress)) * BAR_W;
    if (w > 1) b.roundRect(VIEW_W / 2 - BAR_W / 2, y, w, 4, 2).fill({ color: this.accent, alpha: 0.9 });
  }
}
