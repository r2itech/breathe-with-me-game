import { FEEDBACK, SCORING, SYNC, type LevelConfig, type PlayPhase } from '../data/levels';
import { BreathScorer, type BreathGrade } from './BreathScorer';
import { Guide } from './Guide';
import { NpcBreath } from './NpcBreath';
import { PlayerBreath } from './PlayerBreath';
import { SyncModel } from './SyncModel';

export type Phase = PlayPhase | 'bloom' | 'done';
export type AnchorStep = 'wait' | 'spike' | 'recover' | 'outro';

export interface RunEvents {
  phase?(p: Phase): void;
  // a play phase just got completed, fires before the next one starts
  phaseDone?(p: PlayPhase, index: number): void;
  spikeStart?(): void;
  spikeEnd?(): void;
  spiral?(on: boolean): void;
  // every graded breath
  breath?(grade: BreathGrade): void;
  // one of your breaths landed right on the guide
  syncedBreath?(): void;
  missStreak?(): void;
  tooFast?(): void;
  followed?(): void;
  failed?(): void;
}

function approach(v: number, target: number, maxStep: number): number {
  if (v < target) return Math.min(target, v + maxStep);
  return Math.max(target, v - maxStep);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class LevelRun {
  readonly player: PlayerBreath;
  readonly npc: NpcBreath;
  readonly sync: SyncModel;
  readonly guide: Guide;
  readonly follow: boolean;
  readonly phases: PlayPhase[];
  phase: Phase;
  // breath points in the current phase, only ever goes up
  score = 0;
  anchorStep: AnchorStep = 'wait';
  spikeIndex = 0;
  steadyBreaths = 0;
  stepTimer = 0;
  spiral = false;
  missesInRow = 0;
  // extra panic pushed onto the player during final-level spikes
  panicBoost = 0;
  // the lose meter: fills while you're not with them
  panicMeter = 0;
  // scene freezes the meter while a banner/tutorial line is up
  panicFrozen = false;
  failed = false;
  calm = 0;
  syncTime = 0;
  // time spent in play phases, the base for the heart rating
  activeTime = 0;
  time = 0;
  phaseTime = 0;
  bloomTimer = 0;
  events: RunEvents = {};
  private leadStart: number;
  private scorer = new BreathScorer();
  private lastTooFast = -99;

  constructor(readonly cfg: LevelConfig) {
    this.follow = cfg.mode === 'follow';
    this.phases = cfg.phases;
    this.npc = new NpcBreath(cfg.panicPeriod, cfg.inhaleFraction);
    this.player = new PlayerBreath(cfg.panicPeriod);
    this.sync = new SyncModel(0);
    this.guide = new Guide(cfg.panicPeriod, cfg.inhaleFraction);
    this.leadStart = cfg.panicPeriod;
    this.phase = this.phases[0];
    this.enterPhase(this.phase);
  }

  get spikeCount(): number {
    return this.cfg.anchor.spikes.length;
  }

  get inSpike(): boolean {
    return this.phase === 'anchor' && this.anchorStep === 'spike';
  }

  get active(): boolean {
    return this.phase === 'match' || this.phase === 'lead' || this.phase === 'anchor';
  }

  get connection(): number {
    return this.sync.connection;
  }

  // index of the current play phase, phases.length once blooming
  get phaseIndex(): number {
    const i = this.phases.indexOf(this.phase as PlayPhase);
    return i < 0 ? this.phases.length : i;
  }

  private get needed(): number {
    const c = this.cfg;
    if (this.phase === 'match') return c.matchBreaths;
    if (this.phase === 'lead') return c.leadBreaths;
    return c.anchorSteadyBreaths;
  }

  // 0..1 progress of the current phase, same number drives the ring and the bar
  get progress(): number {
    switch (this.phase) {
      case 'match':
      case 'lead':
        return clamp01(this.score / Math.max(1, this.needed));
      case 'anchor': {
        if (this.anchorStep === 'outro' || !this.spikeCount) return 1;
        const inSpike = this.anchorStep === 'spike' ? this.steadyBreaths / Math.max(1, this.needed) : 0;
        const done = this.spikeIndex + (this.anchorStep === 'recover' ? 1 : inSpike);
        return clamp01(done / this.spikeCount);
      }
      default:
        return 1;
    }
  }

  // 0..1 across the whole level
  get overall(): number {
    if (!this.active) return 1;
    return (this.phaseIndex + this.progress) / this.phases.length;
  }

  // how panicked the NPC looks
  get npcPanic(): number {
    const c = this.cfg;
    if (this.follow) return 0.3 * (1 - this.calm);
    if (!this.active) return 0;
    const low = Math.min(c.panicPeriod, ...c.anchor.spikes.map((s) => s.period));
    return clamp01((c.targetPeriod - this.npc.period) / Math.max(0.1, c.targetPeriod - low));
  }

  get playerPanic(): number {
    return this.player.panic;
  }

  // period the guide will use for its next breath while leading
  private leadPeriod(points: number): number {
    return lerp(this.leadStart, this.cfg.targetPeriod, clamp01(points / Math.max(1, this.cfg.leadBreaths)));
  }

  update(dt: number, held: boolean): void {
    this.time += dt;
    this.phaseTime += dt;
    if (this.follow) {
      const base = this.active ? clamp01(1 - this.calm * 1.15) : 0;
      this.player.panic = clamp01(base * 0.85 + this.panicBoost);
    }
    this.player.update(dt, held);
    this.moveBreaths(dt);

    if (this.failed) return;

    this.sync.update(dt, this.player, this.guide, this.cfg.grace);
    if (this.phase === 'match') this.sync.couple(this.player, this.npc);
    if (this.sync.connection >= SYNC.syncedAt) this.syncTime += dt;
    if (this.active) this.activeTime += dt;

    const grade = this.active ? this.scorer.update(this.player, this.guide, this.cfg.grace) : null;
    this.checkTooFast();

    switch (this.phase) {
      case 'match':
        this.updateMatch(dt, grade);
        break;
      case 'lead':
        this.updateLead(grade);
        break;
      case 'anchor':
        this.updateAnchor(dt, grade);
        break;
      case 'bloom':
        this.bloomTimer += dt;
        this.npc.period = approach(this.npc.period, this.cfg.targetPeriod, dt);
        if (this.bloomTimer >= this.cfg.bloomTime) this.enterPhase('done');
        break;
      case 'done':
        break;
    }

    this.updatePanic(dt);
    this.updateCalm(dt);
  }

  // breathing without the phase logic, for intros and tutorial steps
  idle(dt: number, held: boolean): void {
    this.player.update(dt, held);
    this.moveBreaths(dt);
  }

  // who drives whom: in Match the guide is their breath; in Lead/Anchor they ride the guide
  private moveBreaths(dt: number): void {
    const g = this.guide;
    const npc = this.npc;
    const c = this.cfg;
    const phase = this.phase;

    if (phase === 'match' || !this.active) {
      npc.update(dt);
      g.lockTo(npc);
      return;
    }

    if (phase === 'lead') {
      // the guide always shows the pace of the next step, so following it always scores
      g.step = (c.targetPeriod - this.leadStart) / Math.max(1, c.leadBreaths);
      g.cap = c.targetPeriod;
      g.advance(dt, () => this.leadPeriod(this.score + 1));
    } else {
      g.step = 0;
      g.cap = c.targetPeriod;
      g.advance(dt, () => c.targetPeriod);
    }

    const racing = phase === 'anchor' && !this.follow && this.anchorStep === 'spike';
    const returning = phase === 'anchor' && !this.follow && this.anchorStep === 'recover';
    if (racing || returning) {
      npc.update(dt);
      // slide back onto the guide instead of snapping
      if (returning) npc.nudgeToward(g.phase, Math.min(1, dt * c.anchor.recoverRate));
    } else {
      npc.follow(dt, g.phase, g.period, g.justInhaled);
    }
  }

  private checkTooFast(): void {
    const p = this.player;
    if (!this.active || this.inSpike) return;
    if (p.justInhaled && p.lastInterval > 0 && p.lastInterval < this.guide.period * FEEDBACK.tooFastRatio) {
      if (this.time - this.lastTooFast > FEEDBACK.tooFastCooldown) {
        this.lastTooFast = this.time;
        this.events.tooFast?.();
      }
    }
  }

  private grade(grade: BreathGrade): number {
    this.events.breath?.(grade);
    if (grade === 'miss') {
      this.miss();
      return 0;
    }
    this.missesInRow = 0;
    if (grade === 'sync') {
      this.events.syncedBreath?.();
      return SCORING.syncValue;
    }
    return SCORING.closeValue;
  }

  // misses never take progress away, they only push the panic meter
  private miss(): void {
    if (!this.panicFrozen) this.panicMeter = clamp01(this.panicMeter + this.cfg.panic.missBump);
    this.missesInRow++;
    if (this.missesInRow >= SCORING.missStreak) {
      this.missesInRow = 0;
      this.events.missStreak?.();
    }
  }

  private nextPhase(): void {
    const i = this.phaseIndex;
    const cur = this.phases[i];
    this.events.phaseDone?.(cur, i);
    if (i + 1 < this.phases.length) this.enterPhase(this.phases[i + 1]);
    else this.enterPhase('bloom');
  }

  private enterPhase(p: Phase): void {
    this.phase = p;
    this.phaseTime = 0;
    this.score = 0;
    this.scorer.reset();
    const c = this.cfg;
    if (p === 'match') {
      this.npc.jitter = c.matchJitter;
      this.sync.coupling = this.follow && c.follow ? c.follow.coupling * 2 : 1;
    } else if (p === 'lead') {
      this.npc.jitter = 0;
      this.leadStart = this.npc.period;
      this.guide.period = this.npc.cyclePeriod;
    } else if (p === 'anchor') {
      this.npc.jitter = 0;
      this.startAnchor();
    } else if (p === 'bloom') {
      this.bloomTimer = 0;
      this.panicBoost = 0;
      this.setSpiral(false);
    }
    this.events.phase?.(p);
  }

  private updateMatch(dt: number, grade: BreathGrade | null): void {
    const c = this.cfg;
    if (this.follow && c.follow) {
      // they meet you where you are: the band drifts onto your rhythm
      const hi = c.panicPeriod * 1.6;
      const want = Math.min(hi, Math.max(c.follow.minPeriod, this.player.period));
      this.npc.period = approach(this.npc.period, want, c.follow.adaptRate * dt);
    }
    if (grade) this.score += this.grade(grade);
    if (this.score >= c.matchBreaths) this.nextPhase();
  }

  private updateLead(grade: BreathGrade | null): void {
    const c = this.cfg;
    if (grade) this.score += this.grade(grade);
    // their pace is just the progress, no drift, no hidden gate
    this.npc.period = this.leadPeriod(this.score);
    if (this.score >= c.leadBreaths) this.nextPhase();
  }

  private startAnchor(): void {
    const c = this.cfg;
    this.spikeIndex = 0;
    this.steadyBreaths = 0;
    this.anchorStep = c.anchor.spikes.length ? 'wait' : 'outro';
    this.stepTimer = c.anchor.spikes.length ? c.anchor.spikes[0].delay : c.anchor.outro;
    this.npc.period = c.targetPeriod;
  }

  private setSpiral(on: boolean): void {
    if (this.spiral === on) return;
    this.spiral = on;
    this.events.spiral?.(on);
  }

  private updateAnchor(dt: number, grade: BreathGrade | null): void {
    const c = this.cfg;
    const a = c.anchor;
    const npc = this.npc;
    const target = c.targetPeriod;
    const boostFall = c.follow?.panicBoostFall ?? 1;
    const boostRise = c.follow?.panicBoostRise ?? 1;

    switch (this.anchorStep) {
      case 'wait':
      case 'outro':
        npc.period = approach(npc.period, target, a.recoverRate * dt);
        this.panicBoost = Math.max(0, this.panicBoost - boostFall * dt);
        // outside spikes the usual scoring still feeds the panic meter
        if (grade === 'miss') this.miss();
        else if (grade) this.missesInRow = 0;
        this.stepTimer -= dt;
        if (this.stepTimer > 0) break;
        if (this.anchorStep === 'outro') {
          if (this.sync.connection >= 0.5) this.nextPhase();
        } else {
          this.anchorStep = 'spike';
          this.steadyBreaths = 0;
          this.events.spikeStart?.();
        }
        break;
      case 'spike': {
        const spike = a.spikes[this.spikeIndex];
        if (this.follow) this.panicBoost = Math.min(1, this.panicBoost + boostRise * dt);
        else npc.period = approach(npc.period, spike.period, a.spikeRamp * dt);
        // during a spike only your breath length matters: stay near the target pace
        const p = this.player;
        if (p.justInhaled && p.previousInhaleAt >= 0) {
          // measured directly, lastInterval skips very short taps
          const off = (p.now - p.previousInhaleAt - target) / target;
          if (Math.abs(off) <= a.tolerance) {
            this.steadyBreaths++;
            this.missesInRow = 0;
            this.setSpiral(false);
            this.events.breath?.('sync');
          } else {
            if (off < 0) {
              this.setSpiral(true);
              this.events.followed?.();
            }
            this.events.breath?.('miss');
            this.miss();
          }
        }
        if (this.steadyBreaths >= c.anchorSteadyBreaths) {
          this.setSpiral(false);
          this.anchorStep = 'recover';
          this.events.spikeEnd?.();
        }
        break;
      }
      case 'recover':
        npc.period = approach(npc.period, target, a.recoverRate * dt);
        this.panicBoost = Math.max(0, this.panicBoost - boostFall * dt);
        {
          let d = this.guide.phase - npc.phase;
          d -= Math.round(d);
          const back = Math.abs(npc.period - target) / target <= 0.05 && Math.abs(d) < 0.03 && this.panicBoost < 0.05;
          if (back || this.follow && this.panicBoost < 0.05) {
            this.spikeIndex++;
            if (this.spikeIndex < a.spikes.length) {
              this.anchorStep = 'wait';
              this.stepTimer = a.spikes[this.spikeIndex].delay;
            } else {
              this.anchorStep = 'outro';
              this.stepTimer = a.outro;
            }
          }
        }
        break;
    }
  }

  private updatePanic(dt: number): void {
    const pc = this.cfg.panic;
    const conn = this.sync.connection;
    if (!this.active || this.panicFrozen) {
      if (!this.active) this.panicMeter = Math.max(0, this.panicMeter - pc.drain * dt * 2);
      return;
    }
    if (conn < pc.low) this.panicMeter += pc.fill * (0.4 + 0.6 * (1 - conn / pc.low)) * dt;
    else if (conn > pc.safe) this.panicMeter -= pc.drain * dt;
    this.panicMeter = clamp01(this.panicMeter);
    if (this.panicMeter >= 1) {
      this.failed = true;
      this.events.failed?.();
    }
  }

  private updateCalm(dt: number): void {
    let target = this.active ? 0.1 + 0.8 * this.overall : 1;
    if (this.inSpike) target = Math.min(target, 0.35);
    const rate = target < this.calm ? 0.9 : 0.35;
    this.calm = approach(this.calm, target, rate * dt);
  }
}
