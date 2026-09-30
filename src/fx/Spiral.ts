import { Graphics } from 'pixi.js';

// shows up when the player followed the panic instead of staying steady
export class Spiral {
  readonly root = new Graphics();
  private amount = 0;
  private angle = 0;

  update(dt: number, on: boolean, x: number, y: number, baseRadius: number, color: number, calmMotion: boolean): void {
    this.amount += ((on ? 1 : 0) - this.amount) * Math.min(1, dt * (on ? 1.5 : 2.5));
    this.angle += dt * (calmMotion ? 0.6 : 2.2);
    const g = this.root;
    g.clear();
    if (this.amount < 0.01) return;
    const arms = 3;
    for (let arm = 0; arm < arms; arm++) {
      const off = (arm / arms) * Math.PI * 2 + this.angle;
      const steps = 60;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const a = off + u * Math.PI * 3;
        const r = baseRadius * (1.25 + u * 1.4);
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke({ width: 2, color, alpha: 0.35 * this.amount });
    }
  }
}
