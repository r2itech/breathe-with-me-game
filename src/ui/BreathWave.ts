import { Container, Graphics, Text } from 'pixi.js';
import type { LevelRun } from '../breath/LevelRun';
import { isTouch } from '../core/platform';
import { FONT, VIEW_H, VIEW_W } from '../core/view';
import { WAVE } from '../data/levels';
import { TEXT } from '../data/text';

interface Sample {
  t: number;
  guide: number;
  npc: number;
  player: number;
  match: boolean;
  spike: boolean;
}

const TOP = VIEW_H - WAVE.height;
const PAD_T = 20;
const PAD_B = 14;
const NOW_X = VIEW_W * WAVE.nowAt;
const GREY = 0x6f6a88;
const GUIDE = 0xfff1d8;
const RED = 0xff5a6a;

// scrolling band: guide line ahead, your own trace behind
export class BreathWave {
  readonly root = new Container();
  private bg = new Graphics();
  private lines = new Graphics();
  private glow = new Graphics();
  private key = new Container();
  private keyBox = new Graphics();
  private keyLit = 0;
  private samples: Sample[] = [];
  private time = 0;
  private pps = 120;
  // how visible the whole band is, the tutorial fades it in
  shown = 1;
  private pulseT = 0;

  constructor(
    private warm: number,
    private showKey: boolean,
  ) {
    this.glow.blendMode = 'add';
    const label = new Text({ text: TEXT.wave.key, style: { fontFamily: FONT, fontSize: 13, fill: 0x1a1426, fontWeight: '700', letterSpacing: 1 } });
    label.anchor.set(0.5);
    // on phones it's a fingertip, not a key
    label.visible = !isTouch;
    this.key.addChild(this.keyBox, label);
    this.key.position.set(NOW_X - 58, TOP + WAVE.height / 2);
    this.key.visible = showKey;
    this.root.addChild(this.bg, this.glow, this.lines, this.key);
    this.drawBg();
  }

  // one bright throb on the guide line, after a few misses in a row
  pulse(): void {
    this.pulseT = 1;
  }

  private y(lung: number): number {
    const bottom = VIEW_H - PAD_B;
    const top = TOP + PAD_T;
    return bottom - lung * (bottom - top);
  }

  update(dt: number, run: LevelRun, guideAlpha: number, frozen: boolean): void {
    this.root.alpha = this.shown;
    if (this.shown <= 0.01) return;
    const g = run.guide;
    const p = run.player;
    const npc = run.npc;

    if (!frozen) {
      this.time += dt;
      const grace = run.cfg.grace;
      const nearEdge = g.fromTransition < grace || g.toTransition < grace;
      const cutoff = this.time - WAVE.historySeconds;
      // recycle the expired samples instead of making a new one every frame
      let s: Sample | undefined;
      while (this.samples.length && this.samples[0].t < cutoff) s = this.samples.shift();
      s ??= { t: 0, guide: 0, npc: 0, player: 0, match: false, spike: false };
      s.t = this.time;
      s.guide = g.lung;
      s.npc = npc.lung;
      s.player = p.lung;
      s.match = p.hasBreathed && (p.state === g.state || nearEdge);
      s.spike = run.inSpike && !run.follow;
      this.samples.push(s);
    }

    // zoom so about two guide cycles fit ahead of the now line
    const want = (VIEW_W - NOW_X) / (WAVE.previewCycles * Math.max(1, g.period));
    this.pps += (want - this.pps) * Math.min(1, dt * 1.2);

    this.lines.clear();
    this.glow.clear();

    const npcDiffers = !run.follow && run.phase !== 'match';
    const spiking = run.inSpike && !run.follow;

    // their own breath, only worth showing when it isn't the guide
    if (npcDiffers) {
      const color = spiking ? RED : GREY;
      const alpha = spiking ? 0.85 : 0.3;
      this.strokeHistory((s) => s.npc, spiking ? 0.07 : 0);
      this.lines.stroke({ width: spiking ? 2.5 : 1.5, color, alpha });
      this.strokePreview((tau) => npc.lungAt(tau), spiking ? 0.07 : 0);
      this.lines.stroke({ width: spiking ? 2.5 : 1.5, color, alpha });
    }

    // guide: faint behind, bright ahead
    this.pulseT = Math.max(0, this.pulseT - dt * 1.2);
    const throb = Math.sin(this.pulseT * Math.PI);
    const ga = Math.min(1, Math.max(0, guideAlpha) + throb);
    this.strokeHistory((s) => s.guide, 0);
    this.lines.stroke({ width: 2, color: GUIDE, alpha: 0.3 * ga });
    this.strokePreview((tau) => g.lungAt(tau), 0, this.glow);
    this.glow.stroke({ width: 12 + 18 * throb, color: this.warm, alpha: 0.18 * ga + 0.4 * throb });
    this.strokePreview((tau) => g.lungAt(tau), 0);
    this.lines.stroke({ width: 3 + 3 * throb, color: GUIDE, alpha: 0.95 * ga });

    this.drawPlayerTrace();

    // now line + where you are vs where the guide is
    this.lines.moveTo(NOW_X, TOP + 6).lineTo(NOW_X, VIEW_H - 4).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
    this.lines.circle(NOW_X, this.y(g.lung), 6).fill({ color: GUIDE, alpha: 0.9 * ga });
    this.glow.circle(NOW_X, this.y(g.lung), 16).fill({ color: this.warm, alpha: 0.25 * ga });
    const matchNow = this.samples.length ? this.samples[this.samples.length - 1].match : false;
    this.lines.circle(NOW_X, this.y(p.lung), 5).fill({ color: matchNow ? this.warm : GREY });

    if (this.showKey) {
      const lit = g.state === 'in' ? 1 : 0;
      this.keyLit += (lit - this.keyLit) * Math.min(1, dt * 12);
      const k = this.keyBox;
      k.clear();
      if (isTouch) {
        // fingertip pressing down, with a ripple while it should be held
        k.roundRect(-9, -20, 18, 34, 9).fill({ color: lit ? this.warm : 0x8c86a8, alpha: 0.45 + 0.5 * this.keyLit });
        k.circle(0, 16, 12 + 8 * this.keyLit).stroke({ width: 2, color: 0xffffff, alpha: 0.5 * this.keyLit });
      } else {
        k.roundRect(-38, -14, 76, 28, 7).fill({ color: lit ? this.warm : 0x8c86a8, alpha: 0.35 + 0.6 * this.keyLit });
        k.roundRect(-38, -14, 76, 28, 7).stroke({ width: 2, color: 0xffffff, alpha: 0.3 + 0.5 * this.keyLit });
      }
      this.key.scale.set(1 + 0.08 * this.keyLit);
    }
  }

  private drawBg(): void {
    const b = this.bg;
    b.clear();
    b.rect(0, TOP, VIEW_W, WAVE.height).fill({ color: 0x07060f, alpha: 0.55 });
    b.moveTo(0, TOP).lineTo(VIEW_W, TOP).stroke({ width: 1, color: 0xffffff, alpha: 0.12 });
    // mid line = half breath
    b.moveTo(0, this.y(0.5)).lineTo(VIEW_W, this.y(0.5)).stroke({ width: 1, color: 0xffffff, alpha: 0.05 });
  }

  // walks back from the newest sample as x moves left
  private strokeHistory(pick: (s: Sample) => number, jag: number, g: Graphics = this.lines): void {
    const n = this.samples.length;
    if (n < 2) return;
    let i = n - 1;
    let first = true;
    for (let x = NOW_X; x >= 0; x -= 4) {
      const at = this.time - (NOW_X - x) / this.pps;
      while (i > 0 && this.samples[i].t > at) i--;
      if (this.samples[i].t > at) break;
      let v = pick(this.samples[i]);
      if (jag > 0 && this.samples[i].spike) v += Math.sin(x * 0.45) * jag + Math.sin(x * 1.3) * jag * 0.6;
      const y = this.y(v);
      if (first) g.moveTo(x, y);
      else g.lineTo(x, y);
      first = false;
    }
  }

  private strokePreview(lungAt: (tau: number) => number, jag: number, g: Graphics = this.lines): void {
    let first = true;
    for (let x = NOW_X; x <= VIEW_W; x += 5) {
      const tau = (x - NOW_X) / this.pps;
      let v = lungAt(tau);
      if (jag > 0) v += Math.sin(x * 0.45 + this.time * 9) * jag + Math.sin(x * 1.3) * jag * 0.6;
      const y = this.y(v);
      if (first) g.moveTo(x, y);
      else g.lineTo(x, y);
      first = false;
    }
  }

  // warm where you matched the guide, grey where you didn't, split into runs
  private drawPlayerTrace(): void {
    const n = this.samples.length;
    if (n < 2) return;
    let i = n - 1;
    let runMatch: boolean | null = null;
    const flush = () => {
      if (runMatch === null) return;
      this.lines.stroke({ width: 3, color: runMatch ? this.warm : GREY, alpha: runMatch ? 0.95 : 0.6 });
    };
    for (let x = NOW_X; x >= 0; x -= 4) {
      const at = this.time - (NOW_X - x) / this.pps;
      while (i > 0 && this.samples[i].t > at) i--;
      const s = this.samples[i];
      if (s.t > at) break;
      const y = this.y(s.player);
      if (runMatch === null) {
        this.lines.moveTo(x, y);
        runMatch = s.match;
      } else if (s.match !== runMatch) {
        this.lines.lineTo(x, y);
        flush();
        // next run starts where this one ended so there's no gap
        this.lines.moveTo(x, y);
        runMatch = s.match;
      } else {
        this.lines.lineTo(x, y);
      }
    }
    flush();
  }
}
