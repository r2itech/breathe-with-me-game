import { Container, Graphics, Text } from 'pixi.js';
import { FONT, VIEW_W } from '../core/view';
import { FEEDBACK, type PlayPhase } from '../data/levels';

const CX = VIEW_W / 2;
const CY = 250;
const W = 560;
const H = 190;
// where it shrinks off to, the phase panel
const PANEL_Y = 50;
const SHRINK = 0.5;

// centered card at the start of each phase, then it tucks itself into the panel
export class PhaseBanner {
  readonly root = new Container();
  private card = new Graphics();
  private icon = new Graphics();
  private step: Text;
  private objective: Text;
  private t = -1;
  private kind: PlayPhase = 'match';
  onLanded: (() => void) | null = null;

  constructor(private accent: number) {
    this.step = new Text({ text: '', style: { fontFamily: FONT, fontSize: 16, fill: accent, fontWeight: '700', letterSpacing: 3 } });
    this.step.anchor.set(0.5);
    this.step.y = -H / 2 + 30;
    this.objective = new Text({
      text: '',
      style: { fontFamily: FONT, fontSize: 24, fill: 0xfff4ea, fontWeight: '700', align: 'center', wordWrap: true, wordWrapWidth: W - 60 },
    });
    this.objective.anchor.set(0.5);
    this.objective.y = -H / 2 + 72;
    this.icon.y = 48;
    this.root.addChild(this.card, this.step, this.objective, this.icon);
    this.root.position.set(CX, CY);
    this.root.visible = false;
  }

  // true while it's covering the screen, the panic meter pauses then
  get active(): boolean {
    return this.t >= 0 && this.t < FEEDBACK.bannerTime;
  }

  show(stepLabel: string, objective: string, kind: PlayPhase): void {
    this.step.text = stepLabel;
    this.objective.text = objective;
    this.kind = kind;
    this.t = 0;
    this.root.visible = true;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const hold = FEEDBACK.bannerTime;
    const t = this.t;

    const c = this.card;
    c.clear();
    c.roundRect(-W / 2, -H / 2, W, H, 18).fill({ color: 0x0b0918, alpha: 0.88 });
    c.roundRect(-W / 2, -H / 2, W, H, 18).stroke({ width: 2, color: this.accent, alpha: 0.5 });
    this.drawIcon(t);

    if (t < 0.25) {
      const u = t / 0.25;
      this.root.alpha = u;
      this.root.scale.set(0.9 + 0.1 * u);
      this.root.position.set(CX, CY);
    } else if (t < hold) {
      this.root.alpha = 1;
      this.root.scale.set(1);
    } else {
      // shrink up into the phase panel
      const u = Math.min(1, (t - hold) / SHRINK);
      const e = u * u;
      this.root.position.set(CX, CY + (PANEL_Y - CY) * e);
      this.root.scale.set(1 - 0.8 * e);
      this.root.alpha = 1 - u;
      if (u >= 1) {
        this.t = -1;
        this.root.visible = false;
        this.onLanded?.();
      }
    }
  }

  private drawIcon(t: number): void {
    this.icon.clear();
    drawPhaseIcon(this.icon, this.kind, t, this.accent);
  }
}

// tiny demo of what the phase wants, also used on the how-to-play page
export function drawPhaseIcon(g: Graphics, kind: PlayPhase, t: number, col: number): void {
  const breath = (period: number) => (1 - Math.cos((t / period) * Math.PI * 2)) / 2;
  if (kind === 'match') {
    const r = 10 + 12 * breath(1.4);
    g.circle(-34, 0, r).stroke({ width: 3, color: 0x9fb6ff });
    g.circle(34, 0, r).stroke({ width: 3, color: col });
  } else if (kind === 'lead') {
    // breathing that keeps getting slower (period 0.8s and up), loops every 4s
    const lt = t % 4;
    const phase = Math.log(1 + 0.6 * lt) / (0.6 * 0.8);
    const r = 10 + 12 * ((1 - Math.cos(phase * Math.PI * 2)) / 2);
    g.circle(0, 0, 26).stroke({ width: 1, color: col, alpha: 0.25 });
    g.circle(0, 0, r).stroke({ width: 3, color: col });
  } else {
    const r = 10 + 12 * breath(2.2);
    g.circle(-34, 0, r).stroke({ width: 3, color: col });
    // jagged, fast one next to it
    const jr = 14 + 6 * breath(0.35);
    const pts: number[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const k = i % 2 === 0 ? 1 : 0.7;
      pts.push(34 + Math.cos(a) * jr * k, Math.sin(a) * jr * k);
    }
    g.poly(pts).stroke({ width: 2, color: 0xff5a6a });
  }
}