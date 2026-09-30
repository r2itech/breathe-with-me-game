import { BREATH } from '../data/levels';

export type BreathState = 'in' | 'out';

export class PlayerBreath {
  lung = 0;
  state: BreathState = 'out';
  // 0 = calm, 1 = full panic (final level makes the player the panicked one)
  panic = 0;
  breaths = 0;
  private time = 0;
  private lastInhaleAt = -1;
  private prevInhaleAt = -1;
  private lastReleaseAt = -1;
  private intervals: number[] = [];
  private smoothed: number;
  lastInterval = 0;
  // set on the frame an inhale / exhale starts
  justInhaled = false;
  justExhaled = false;

  constructor(initialPeriod: number) {
    this.smoothed = initialPeriod;
  }

  update(dt: number, held: boolean): void {
    this.time += dt;
    this.justInhaled = false;
    this.justExhaled = false;

    if (held && this.state === 'out') {
      this.state = 'in';
      this.justInhaled = true;
      this.breaths++;
      if (this.lastInhaleAt >= 0) {
        const interval = this.time - this.lastInhaleAt;
        if (interval >= BREATH.minInterval) {
          this.lastInterval = interval;
          this.intervals.push(interval);
          if (this.intervals.length > BREATH.historySize) this.intervals.shift();
          this.recompute();
        }
      }
      this.prevInhaleAt = this.lastInhaleAt;
      this.lastInhaleAt = this.time;
    } else if (!held && this.state === 'in') {
      this.state = 'out';
      this.justExhaled = true;
      this.lastReleaseAt = this.time;
    }

    const tauIn = BREATH.tauIn + (BREATH.panicTauIn - BREATH.tauIn) * this.panic;
    const tauOut = BREATH.tauOut + (BREATH.panicTauOut - BREATH.tauOut) * this.panic;
    // exponential approach reads like a real breath, fast at first then easing off
    if (this.state === 'in') this.lung = 1 - (1 - this.lung) * Math.exp(-dt / tauIn);
    else this.lung = this.lung * Math.exp(-dt / tauOut);
  }

  // smoothed inhale-to-inhale period, stretched if the current breath is already longer
  get period(): number {
    return Math.max(this.smoothed, this.sinceInhale);
  }

  get smoothedPeriod(): number {
    return this.smoothed;
  }

  get sinceInhale(): number {
    return this.lastInhaleAt < 0 ? 0 : this.time - this.lastInhaleAt;
  }

  get sinceChange(): number {
    const last = Math.max(this.lastInhaleAt, this.lastReleaseAt);
    return last < 0 ? this.time : this.time - last;
  }

  get hasBreathed(): boolean {
    return this.lastInhaleAt >= 0;
  }

  get now(): number {
    return this.time;
  }

  get previousInhaleAt(): number {
    return this.prevInhaleAt;
  }

  // forget old intervals, e.g. after a retry so the old rhythm doesn't linger
  resetHistory(period: number): void {
    this.intervals = [];
    this.smoothed = period;
  }

  private recompute(): void {
    // newest interval weighs the most
    let sum = 0;
    let wsum = 0;
    this.intervals.forEach((v, i) => {
      const w = i + 1;
      sum += v * w;
      wsum += w;
    });
    this.smoothed = wsum > 0 ? sum / wsum : this.smoothed;
  }
}
