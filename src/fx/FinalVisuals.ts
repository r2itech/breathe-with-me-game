import { Graphics, Sprite } from 'pixi.js';
import type { LevelRun } from '../breath/LevelRun';
import { VIEW_H, VIEW_W } from '../core/view';
import { FINAL, type LevelConfig } from '../data/levels';
import { LevelVisuals } from './LevelVisuals';
import { dotTexture, glowTexture } from './textures';

interface Branch {
  pts: number[];
}

// where each companion flies in from, roughly where their window was
const STARTS = [
  [-80, 120],
  [VIEW_W + 80, 160],
  [-80, VIEW_H - 80],
  [VIEW_W + 80, VIEW_H - 60],
];

export class FinalVisuals extends LevelVisuals {
  private crack = new Graphics();
  private branches: Branch[] = [];
  private crackT = -1;
  private crackFade = 1;
  private lights: Sprite[] = [];
  private cores: Sprite[] = [];
  private orbit = 0;
  arrival = 0;
  private arriving = false;
  join = [0, 0, 0, 0];

  constructor(cfg: LevelConfig, reduceMotion: () => boolean, lowQuality: () => boolean) {
    super(cfg, reduceMotion, lowQuality);
    this.top.addChild(this.crack);
    FINAL.companionColors.forEach((color) => {
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.tint = color;
      const core = new Sprite(dotTexture());
      core.anchor.set(0.5);
      core.blendMode = 'add';
      core.tint = 0xffffff;
      glow.visible = core.visible = false;
      this.lights.push(glow);
      this.cores.push(core);
      this.mid.addChild(glow, core);
    });
    this.buildCrack();
  }

  private buildCrack(): void {
    const cx = VIEW_W * 0.62;
    const cy = VIEW_H * 0.46;
    for (let b = 0; b < 8; b++) {
      let a = (b / 8) * Math.PI * 2 + Math.random() * 0.5;
      let x = cx;
      let y = cy;
      const pts = [x, y];
      const segs = 7 + Math.floor(Math.random() * 5);
      for (let i = 0; i < segs; i++) {
        a += (Math.random() - 0.5) * 0.9;
        const len = 40 + Math.random() * 90;
        x += Math.cos(a) * len;
        y += Math.sin(a) * len;
        pts.push(x, y);
      }
      this.branches.push({ pts });
    }
  }

  startCrack(): void {
    if (this.crackT < 0) this.crackT = 0;
  }

  startArrival(): void {
    this.arriving = true;
  }

  override update(dt: number, run: LevelRun): void {
    super.update(dt, run);
    const blooming = run.phase === 'bloom' || run.phase === 'done';

    if (this.arriving) this.arrival = Math.min(1, this.arrival + dt / FINAL.arriveTime);
    const arr = this.arrival;
    const ease = 1 - Math.pow(1 - arr, 3);

    // the guide circle is them, it only exists once they've arrived
    this.npcCircle.root.alpha *= ease;
    this.tether.root.alpha *= ease;
    this.calmRing.root.alpha *= ease;
    this.panicArc.root.alpha = ease;

    this.drawCrack(dt, run, blooming);

    const npcR = this.radius(run.npc.lung);
    const bloomAmt = this.bloom.amount;
    this.orbit += dt * (0.35 + 0.9 * (1 - run.calm));
    this.lights.forEach((glow, k) => {
      const core = this.cores[k];
      const visible = arr > 0;
      glow.visible = core.visible = visible;
      if (!visible) return;
      const j = blooming ? 1 : this.join[k];
      const ang = this.orbit + (k / 4) * Math.PI * 2;
      const r = (npcR + FINAL.orbitGap + 6 * Math.sin(this.time * 1.3 + k)) * (1 + bloomAmt * 1.6);
      const ox = this.npcX + Math.cos(ang) * r;
      const oy = this.y + Math.sin(ang) * r;
      const [sx, sy] = STARTS[k];
      glow.x = sx + (ox - sx) * ease;
      glow.y = sy + (oy - sy) * ease;
      core.position.copyFrom(glow.position);
      glow.scale.set(0.35 + 0.35 * j + 0.3 * bloomAmt);
      glow.alpha = (0.3 + 0.6 * j) * Math.min(1, arr * 2);
      core.scale.set(0.35 + 0.25 * j);
      core.alpha = (0.4 + 0.6 * j) * Math.min(1, arr * 2);
    });
  }

  private drawCrack(dt: number, run: LevelRun, blooming: boolean): void {
    const g = this.crack;
    g.clear();
    if (this.crackT < 0) return;
    this.crackT += dt;
    const grow = Math.min(1, this.crackT / FINAL.crackTime);
    // lingers faintly through the level, heals with the bloom
    const target = blooming ? 0 : run.phase === 'match' && this.arrival < 1 ? 1 : 0.35 * (1 - run.calm) + 0.1;
    this.crackFade += (target - this.crackFade) * Math.min(1, dt * 0.8);
    if (this.crackFade < 0.01) return;

    for (const b of this.branches) {
      const n = b.pts.length / 2;
      const shown = Math.max(1, Math.floor(n * grow));
      g.moveTo(b.pts[0], b.pts[1]);
      for (let i = 1; i < shown; i++) g.lineTo(b.pts[i * 2], b.pts[i * 2 + 1]);
      g.stroke({ width: 4, color: 0x000000, alpha: 0.5 * this.crackFade });
      g.moveTo(b.pts[0], b.pts[1]);
      for (let i = 1; i < shown; i++) g.lineTo(b.pts[i * 2], b.pts[i * 2 + 1]);
      g.stroke({ width: 1.5, color: 0xffffff, alpha: 0.75 * this.crackFade });
    }
  }
}
