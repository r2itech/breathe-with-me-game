import type { BreathState } from './PlayerBreath';

// 0..1 lung value for a cycle phase, cosine ease up during inhale and down after
export function lungShape(phase: number, inhaleFraction: number): number {
  const p = phase - Math.floor(phase);
  const f = inhaleFraction;
  if (p < f) return (1 - Math.cos((Math.PI * p) / f)) / 2;
  return (1 + Math.cos((Math.PI * (p - f)) / (1 - f))) / 2;
}

export class NpcBreath {
  // 0..1 through the current cycle, inhale first
  phase = 0;
  // the "intended" period, what lead/anchor logic steers
  period: number;
  // the period actually used this cycle, differs when jitter is on
  cyclePeriod: number;
  inhaleFraction: number;
  jitter = 0;
  cycles = 0;
  state: BreathState = 'in';
  justInhaled = false;
  justExhaled = false;
  private sinceTransition = 0;

  constructor(period: number, inhaleFraction: number) {
    this.period = period;
    this.cyclePeriod = period;
    this.inhaleFraction = inhaleFraction;
  }

  update(dt: number): void {
    this.justInhaled = false;
    this.justExhaled = false;
    this.sinceTransition += dt;
    // track period changes mid-cycle so tempo shifts are felt right away
    if (this.jitter <= 0) this.cyclePeriod = this.period;

    this.phase += dt / this.cyclePeriod;
    if (this.phase >= 1) {
      this.phase -= Math.floor(this.phase);
      this.cycles++;
      this.cyclePeriod = this.period * (1 + (Math.random() * 2 - 1) * this.jitter);
    }
    this.refreshState();
  }

  get lung(): number {
    return lungShape(this.phase, this.inhaleFraction);
  }

  // extrapolated at the current cycle period, fine for a preview
  lungAt(tau: number): number {
    return lungShape(this.phase + tau / this.cyclePeriod, this.inhaleFraction);
  }

  // seconds to the next inhale/exhale switch
  get toTransition(): number {
    const f = this.inhaleFraction;
    const left = this.phase < f ? f - this.phase : 1 - this.phase;
    return left * this.cyclePeriod;
  }

  get fromTransition(): number {
    return this.sinceTransition;
  }

  // ride along with another clock (the guide) instead of our own
  follow(dt: number, phase: number, cyclePeriod: number, wrapped: boolean): void {
    this.justInhaled = false;
    this.justExhaled = false;
    this.sinceTransition += dt;
    this.phase = phase;
    this.cyclePeriod = cyclePeriod;
    if (wrapped) this.cycles++;
    this.refreshState();
  }

  // shift the cycle toward a phase the player just hit, Kuramoto-ish but event based
  nudgeToward(targetPhase: number, strength: number): void {
    let d = targetPhase - this.phase;
    d -= Math.round(d);
    this.phase += d * strength;
    if (this.phase < 0) this.phase += 1;
    if (this.phase >= 1) this.phase -= 1;
    this.refreshState(true);
  }

  private refreshState(silent = false): void {
    const s: BreathState = this.phase < this.inhaleFraction ? 'in' : 'out';
    if (s !== this.state) {
      this.state = s;
      this.sinceTransition = 0;
      if (!silent) {
        if (s === 'in') this.justInhaled = true;
        else this.justExhaled = true;
      }
    }
  }
}
