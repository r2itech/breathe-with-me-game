import { Container, Graphics } from 'pixi.js';

const GAP = 0.14;

// overall "how calm are they" ring, one segment per phase; it only ever fills up
export class CalmRing {
  readonly root = new Container();
  private base = new Graphics();
  private glow = new Graphics();
  private fills: number[];
  private shown: number[];
  private pulses: number[];
  private t = 0;

  constructor(private segments: number) {
    this.fills = new Array(segments).fill(0);
    this.shown = new Array(segments).fill(0);
    this.pulses = new Array(segments).fill(0);
    this.glow.blendMode = 'add';
    this.root.addChild(this.glow, this.base);
  }

  complete(i: number): void {
    if (i < 0 || i >= this.segments) return;
    this.fills[i] = 1;
    this.pulses[i] = 1;
  }

  update(dt: number, x: number, y: number, radius: number, current: number, progress: number, color: number, alpha: number): void {
    this.t += dt;
    const n = this.segments;
    for (let i = 0; i < n; i++) {
      if (i < current) this.fills[i] = 1;
      else if (i === current) this.fills[i] = Math.max(this.fills[i], Math.min(1, progress));
      this.shown[i] += (this.fills[i] - this.shown[i]) * Math.min(1, dt * 4);
      this.pulses[i] = Math.max(0, this.pulses[i] - dt * 1.2);
    }

    const b = this.base;
    const g = this.glow;
    b.clear();
    g.clear();
    this.root.alpha = alpha;
    if (alpha <= 0.01) return;

    const span = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + i * span + GAP / 2;
      const a1 = a0 + span - GAP;
      const arc = (gr: Graphics, r: number, from: number, to: number) => {
        gr.moveTo(x + Math.cos(from) * r, y + Math.sin(from) * r);
        gr.arc(x, y, r, from, to);
      };
      arc(b, radius, a0, a1);
      b.stroke({ width: 5, color: 0xffffff, alpha: 0.08, cap: 'round' });

      const f = this.shown[i];
      if (f > 0.005) {
        const end = a0 + (a1 - a0) * f;
        const pulse = this.pulses[i];
        arc(b, radius, a0, end);
        b.stroke({ width: 5 + 3 * pulse, color, alpha: 0.85, cap: 'round' });
        // finished segments breathe a soft glow
        if (this.fills[i] >= 1) {
          const soft = 0.12 + 0.06 * Math.sin(this.t * 1.6 + i) + 0.4 * pulse;
          arc(g, radius, a0, end);
          g.stroke({ width: 14 + 16 * pulse, color, alpha: soft, cap: 'round' });
        }
      }
    }
  }
}
