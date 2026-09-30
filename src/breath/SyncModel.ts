import { SYNC } from '../data/levels';
import type { NpcBreath } from './NpcBreath';
import type { BreathState, PlayerBreath } from './PlayerBreath';

// whatever the player is supposed to be breathing with right now (the guide line)
export interface BreathRef {
  state: BreathState;
  fromTransition: number;
  toTransition: number;
  cyclePeriod: number;
}

export class SyncModel {
  connection = 0;
  matching = false;
  // multiplies SYNC.coupling, levels turn it off outside Match
  coupling = 1;

  constructor(initial = 0) {
    this.connection = initial;
  }

  update(dt: number, player: PlayerBreath, ref: BreathRef, grace: number): void {
    const graceHit = ref.fromTransition < grace || ref.toTransition < grace;
    // standing still isn't breathing together, even if it lines up with an exhale
    const idle = !player.hasBreathed || player.sinceChange > Math.max(SYNC.idleMin, ref.cyclePeriod * SYNC.idleCycles);
    this.matching = !idle && (player.state === ref.state || graceHit);

    if (this.matching) this.connection += SYNC.rise * dt * (1 - this.connection * 0.3);
    else this.connection -= SYNC.fall * dt;
    this.connection = Math.min(1, Math.max(0, this.connection));
  }

  // nudge their nearest matching edge toward the player's, soaks up small timing errors
  couple(player: PlayerBreath, npc: NpcBreath): void {
    if (this.coupling <= 0 || this.connection <= SYNC.couplingMin) return;
    const k = SYNC.coupling * this.coupling * this.connection;
    if (player.justInhaled) this.nudge(npc, 0, k);
    else if (player.justExhaled) this.nudge(npc, npc.inhaleFraction, k);
  }

  private nudge(npc: NpcBreath, edge: number, k: number): void {
    let d = edge - npc.phase;
    d -= Math.round(d);
    if (Math.abs(d) * npc.cyclePeriod > SYNC.couplingWindow) return;
    npc.nudgeToward(edge, k);
  }
}
