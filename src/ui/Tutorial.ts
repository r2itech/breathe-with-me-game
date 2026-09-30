import type { LevelRun } from '../breath/LevelRun';
import { TEXT_TIMING, TUTORIAL } from '../data/levels';
import { TEXT } from '../data/text';
import { readTime } from './textTiming';

interface Step {
  line: string;
  // what's on screen during this step
  npc: number;
  wave: number;
  ring: number;
  done(run: LevelRun, t: number): boolean;
}

export type TutorialEvent = 'synced' | 'thoughts' | 'panic' | 'spike';

// one short line at a time, each step waits for the player to actually do it
export class Tutorial {
  private steps: Step[] = [];
  private index = -1;
  private stepT = 0;
  private fullBreaths = 0;
  private inhaleAt = 0;
  private clock = 0;
  private queue: string[] = [];
  private timed = '';
  private timedT = 0;
  private seen = new Set<TutorialEvent>();
  npc = 1;
  wave = 1;
  ring = 1;
  onReady: (() => void) | null = null;

  constructor(readonly kind: 'basics' | 'spike') {
    const T = TEXT.tutorial;
    if (kind !== 'basics') return;
    // only your own circle to start with
    this.npc = this.wave = this.ring = 0;
    this.steps = [
      { line: T.you, npc: 0, wave: 0, ring: 0, done: (run) => run.player.state === 'in' },
      { line: T.release, npc: 0, wave: 0, ring: 0, done: () => this.fullBreaths >= TUTORIAL.breaths },
      { line: T.meet, npc: 1, wave: 0, ring: 0, done: (_r, t) => t >= TUTORIAL.meetTime },
      { line: T.line, npc: 1, wave: 1, ring: 0, done: (_r, t) => t >= TUTORIAL.lineTime },
      { line: T.ring, npc: 1, wave: 1, ring: 1, done: (_r, t) => t >= TUTORIAL.ringTime },
    ];
  }

  // still walking through the pre-play steps
  get pre(): boolean {
    return this.index >= 0 && this.index < this.steps.length;
  }

  get line(): string {
    if (this.pre) return this.steps[this.index].line;
    return this.timed;
  }

  // a tutorial line is up, the scene holds the panic meter meanwhile
  get lineActive(): boolean {
    return this.line !== '';
  }

  start(): void {
    if (!this.steps.length) {
      this.onReady?.();
      return;
    }
    this.index = 0;
    this.stepT = 0;
    this.apply();
  }

  private apply(): void {
    const s = this.steps[this.index];
    this.npc = s.npc;
    this.wave = s.wave;
    this.ring = s.ring;
  }

  // first time something happens during play, explain it once
  notice(ev: TutorialEvent): void {
    if (this.seen.has(ev) || this.pre) return;
    const T = TEXT.tutorial;
    const lines: Partial<Record<TutorialEvent, string>> =
      this.kind === 'basics' ? { synced: T.synced, thoughts: T.thoughts, panic: T.panic } : { spike: T.spike };
    const line = lines[ev];
    if (!line) return;
    this.seen.add(ev);
    this.queue.push(line);
  }

  // show a line right now, skipping the queue (first spike pause)
  now(line: string): void {
    this.timed = line;
    this.timedT = 0;
  }

  update(dt: number, run: LevelRun): void {
    this.clock += dt;
    if (this.pre) {
      this.stepT += dt;
      const p = run.player;
      if (p.justInhaled) this.inhaleAt = this.clock;
      if (p.justExhaled && this.clock - this.inhaleAt >= TUTORIAL.minInhale && this.index >= 1) this.fullBreaths++;
      // a step only moves on once it's done AND its line had time to be read
      const step = this.steps[this.index];
      if (step.done(run, this.stepT) && this.stepT >= readTime(step.line, TEXT_TIMING.tutorialMin)) {
        this.index++;
        this.stepT = 0;
        if (this.pre) this.apply();
        else {
          this.npc = this.wave = this.ring = 1;
          this.onReady?.();
        }
      }
      return;
    }

    if (run.active && run.panicMeter > TUTORIAL.panicShownAt) this.notice('panic');
    if (this.timed) {
      this.timedT += dt;
      if (this.timedT >= readTime(this.timed, TEXT_TIMING.tutorialMin)) this.timed = '';
    }
    if (!this.timed && this.queue.length) this.now(this.queue.shift()!);
  }
}
