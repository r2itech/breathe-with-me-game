import { lungShape, type NpcBreath } from './NpcBreath';
import type { BreathState } from './PlayerBreath';

// the glowing line the player is asked to follow right now
export class Guide {
  phase = 0;
  period: number;
  cycles = 0;
  justInhaled = false;
  // how the preview predicts upcoming cycles: each one `step` longer, up to `cap`
  step = 0;
  cap: number;

  constructor(
    period: number,
    readonly inhaleFraction: number,
  ) {
    this.period = period;
    this.cap = period;
  }

  get state(): BreathState {
    return this.phase < this.inhaleFraction ? 'in' : 'out';
  }

  get lung(): number {
    return lungShape(this.phase, this.inhaleFraction);
  }

  get fromTransition(): number {
    const f = this.inhaleFraction;
    return (this.phase < f ? this.phase : this.phase - f) * this.period;
  }

  get toTransition(): number {
    const f = this.inhaleFraction;
    return (this.phase < f ? f - this.phase : 1 - this.phase) * this.period;
  }

  // guide == their breath (Match, and the whole final level)
  lockTo(npc: NpcBreath): void {
    this.justInhaled = npc.justInhaled;
    if (npc.justInhaled) this.cycles++;
    this.phase = npc.phase;
    this.period = npc.cyclePeriod;
    this.step = 0;
    this.cap = npc.period;
  }

  // own clock, next cycle length chosen when the current one ends
  advance(dt: number, next: () => number): void {
    this.justInhaled = false;
    this.phase += dt / this.period;
    if (this.phase >= 1) {
      this.phase -= Math.floor(this.phase);
      this.period = next();
      this.cycles++;
      this.justInhaled = true;
    }
  }

  get cyclePeriod(): number {
    return this.period;
  }

  // seconds from now to the nearest inhale start (or exhale start), past or upcoming
  edgeError(which: BreathState): number {
    const f = this.inhaleFraction;
    const ph = this.phase;
    const T = this.period;
    let back: number;
    let ahead: number;
    if (which === 'in') {
      back = ph * T;
      ahead = (1 - ph) * T;
    } else if (ph < f) {
      ahead = (f - ph) * T;
      back = (ph + 1 - f) * T;
    } else {
      back = (ph - f) * T;
      ahead = (1 - ph + f) * T;
    }
    return Math.min(back, ahead);
  }

  lungAt(tau: number): number {
    let ph = this.phase;
    let p = this.period;
    let t = tau;
    let rem = (1 - ph) * p;
    for (let guard = 0; t > rem && guard < 12; guard++) {
      t -= rem;
      ph = 0;
      p = Math.min(this.cap, p + this.step);
      rem = p;
    }
    return lungShape(ph + t / p, this.inhaleFraction);
  }
}
