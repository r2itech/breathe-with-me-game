import { Container, Graphics, Text } from 'pixi.js';
import type { LevelRun } from '../breath/LevelRun';

// stays on/off across levels
let visible = false;

// F3, dev builds only
export class DebugOverlay {
  readonly root = new Container();
  private text: Text;
  private bg = new Graphics();
  private refresh = 0;

  constructor() {
    this.text = new Text({ text: '', style: { fontFamily: 'Consolas, monospace', fontSize: 14, fill: 0xb8ffb8, lineHeight: 18 } });
    this.text.position.set(14, 132);
    this.bg.rect(6, 126, 320, 232).fill({ color: 0x000000, alpha: 0.6 });
    this.root.addChild(this.bg, this.text);
    this.root.visible = visible && import.meta.env.DEV;
  }

  toggle(): void {
    if (!import.meta.env.DEV) return;
    visible = !visible;
    this.root.visible = visible;
  }

  update(dt: number, run: LevelRun): void {
    if (!this.root.visible) return;
    this.refresh -= dt;
    if (this.refresh > 0) return;
    this.refresh = 0.1;
    const p = run.player;
    const n = run.npc;
    this.text.text = [
      `phase       ${run.phase}${run.phase === 'anchor' ? ' / ' + run.anchorStep : ''} (${run.phaseIndex + 1}/${run.phases.length})`,
      `player T    ${p.period.toFixed(2)}s (last ${p.lastInterval.toFixed(2)})`,
      `npc T       ${n.period.toFixed(2)}s (cycle ${n.cyclePeriod.toFixed(2)})`,
      `guide T     ${run.guide.period.toFixed(2)}s ${run.guide.state}`,
      `target T    ${run.cfg.targetPeriod.toFixed(2)}s`,
      `connection  ${run.connection.toFixed(2)} ${run.sync.matching ? 'match' : '-'}`,
      `state       you ${p.state}  them ${n.state}`,
      `progress    ${run.progress.toFixed(2)}  overall ${run.overall.toFixed(2)}`,
      `panic meter ${run.panicMeter.toFixed(2)}${run.panicFrozen ? ' (frozen)' : ''}`,
      `calm        ${run.calm.toFixed(2)}  look ${run.npcPanic.toFixed(2)}/${p.panic.toFixed(2)}`,
      `score       ${run.score.toFixed(1)}  misses ${run.missesInRow}  spike ${run.spikeIndex}/${run.spikeCount} steady ${run.steadyBreaths}`,
      `sync time   ${run.syncTime.toFixed(1)} / ${run.activeTime.toFixed(1)}s`,
    ].join('\n');
  }
}
