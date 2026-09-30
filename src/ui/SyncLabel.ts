import { Container, Graphics, Text } from 'pixi.js';
import { FONT } from '../core/view';
import { FEEDBACK } from '../data/levels';
import { TEXT } from '../data/text';

type State = 'sync' | 'drift' | 'lost';

const COLORS: Record<State, number> = { sync: 0xffc9a3, drift: 0xffe27a, lost: 0xff5a6a };

// always-on label under your circle
export class SyncLabel {
  readonly root = new Container();
  private text: Text;
  private pill = new Graphics();
  private state: State | null = null;

  constructor(private lostLabel: string) {
    this.text = new Text({ text: '', style: { fontFamily: FONT, fontSize: 15, fill: 0xffffff, fontWeight: '700', letterSpacing: 3 } });
    this.text.anchor.set(0.5);
    this.root.addChild(this.pill, this.text);
  }

  update(x: number, y: number, connection: number, breathing: boolean): void {
    this.root.position.set(x, y);
    // a bit of hysteresis so it doesn't flicker on the thresholds
    const c = connection;
    let s: State;
    if (!breathing) s = 'lost';
    else if (this.state === 'sync' ? c >= FEEDBACK.inSyncAt - 0.08 : c >= FEEDBACK.inSyncAt) s = 'sync';
    else if (this.state === 'lost' ? c >= FEEDBACK.driftingAt + 0.06 : c >= FEEDBACK.driftingAt) s = 'drift';
    else s = 'lost';
    if (s === this.state) return;
    this.state = s;
    this.text.text = s === 'sync' ? TEXT.hud.inSync : s === 'drift' ? TEXT.hud.drifting : this.lostLabel;
    this.text.style.fill = COLORS[s];
    const w = this.text.width + 28;
    this.pill.clear();
    this.pill.roundRect(-w / 2, -14, w, 28, 14).fill({ color: 0x0b0918, alpha: 0.6 });
    this.pill.roundRect(-w / 2, -14, w, 28, 14).stroke({ width: 1.5, color: COLORS[s], alpha: 0.6 });
  }
}
