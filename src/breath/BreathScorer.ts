import { SCORING } from '../data/levels';
import type { Guide } from './Guide';
import type { PlayerBreath } from './PlayerBreath';

export type BreathGrade = 'sync' | 'close' | 'miss';

// grades each of your breaths against the guide line: inhale start and exhale start
// both have to land near the guide's own transitions
export class BreathScorer {
  private inhaleErr = Infinity;
  private pending = false;

  // call after player and guide have moved this frame; returns a grade when a breath completes
  update(player: PlayerBreath, guide: Guide, grace: number): BreathGrade | null {
    if (player.justInhaled) {
      this.inhaleErr = guide.edgeError('in');
      this.pending = true;
    }
    if (player.justExhaled && this.pending) {
      this.pending = false;
      const err = Math.max(this.inhaleErr, guide.edgeError('out'));
      if (err <= grace) return 'sync';
      if (err <= grace * SCORING.closeFactor) return 'close';
      return 'miss';
    }
    return null;
  }

  reset(): void {
    this.pending = false;
  }
}
