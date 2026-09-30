import type { LayerLevels } from '../audio/LevelSong';
import type { Game } from '../core/Game';
import { FINAL } from '../data/levels';
import { TEXT } from '../data/text';
import { FinalVisuals } from '../fx/FinalVisuals';
import type { LevelVisuals } from '../fx/LevelVisuals';
import { LevelScene } from './LevelScene';

type Seq = 'intro' | 'crack' | 'arrive' | 'play';

// role reversal: your circle is the panicked one, the four people you helped lead
export class FinalLevelScene extends LevelScene {
  private seq: Seq = 'intro';
  private joined = [false, false, false, false];

  constructor(game: Game, onFinish: () => void) {
    super(game, FINAL.levelIndex, onFinish);
  }

  private get fv(): FinalVisuals {
    return this.visuals as FinalVisuals;
  }

  protected override makeVisuals(): LevelVisuals {
    return new FinalVisuals(this.run.cfg, () => this.game.settings.reduceMotion, () => this.game.lowQuality);
  }

  protected override startPlay(): void {
    if (this.seq === 'intro') {
      this.seq = 'crack';
      this.fv.startCrack();
      this.game.audio.spike();
      this.caption.show(TEXT.final.crack, () => {
        this.seq = 'arrive';
        this.fv.startArrival();
        this.game.audio.songBloom();
        this.caption.show([TEXT.final.arrive], () => {
          this.seq = 'play';
          super.startPlay();
        });
      });
      return;
    }
    super.startPlay();
  }

  override update(dt: number): void {
    const run = this.run;
    // before play, the panic is scripted
    if (this.seq === 'intro') run.player.panic = 0.3;
    else if (this.seq === 'crack') run.player.panic = Math.min(1, run.player.panic + dt * 1.5);
    else if (this.seq === 'arrive') run.player.panic = Math.max(0.8, run.player.panic - dt * 0.1);

    const join = this.fv.join;
    for (let k = 0; k < join.length; k++) {
      let want = join[k];
      if (run.phase === 'match') want = Math.max(join[k], Math.min(1, run.progress * join.length - k));
      else if (this.seq === 'play') want = 1;
      join[k] = want;
      if (want >= 1 && !this.joined[k] && this.seq === 'play') {
        this.joined[k] = true;
        this.game.audio.uiSelect();
      }
    }

    super.update(dt);
  }

  protected override songLayers(): LayerLevels {
    const base = super.songLayers();
    const run = this.run;
    const blooming = run.phase === 'bloom' || run.phase === 'done';
    base.companions = this.fv.join.map((j) => (blooming ? 1 : j * (0.35 + 0.65 * run.connection)));
    if (this.seq !== 'play') base.pulse = 0.1;
    return base;
  }

  protected override hintText(): string {
    if (this.stage !== 'play') return '';
    const run = this.run;
    if (run.phase === 'match' && run.phaseTime < 8) return TEXT.hints.finalMatch;
    if (run.phase === 'lead' && run.phaseTime < 8) return TEXT.hints.finalLead;
    return '';
  }
}
