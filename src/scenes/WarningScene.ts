import { Graphics, Text } from 'pixi.js';
import type { Game } from '../core/Game';
import type { Action } from '../core/Input';
import { Scene } from '../core/Scene';
import { FONT, VIEW_H, VIEW_W } from '../core/view';
import { TEXT } from '../data/text';
import { goTitle } from './flow';

export class WarningScene extends Scene {
  private t = 0;
  private off: (() => void) | null = null;
  private prompt: Text;
  private leaving = false;

  constructor(private game: Game) {
    super();
    const bg = new Graphics().rect(-50, -50, VIEW_W + 100, VIEW_H + 100).fill(0x05050b);
    const W = TEXT.warning;
    const main = new Text({
      text: W.lines.join('\n'),
      style: { fontFamily: FONT, fontSize: 32, fill: 0xf2ecff, fontWeight: '600', align: 'center', lineHeight: 48 },
    });
    main.anchor.set(0.5);
    main.position.set(VIEW_W / 2, VIEW_H / 2 - 70);
    const photo = new Text({
      text: W.photo,
      style: { fontFamily: FONT, fontSize: 20, fill: 0xb9b3d6, align: 'center', wordWrap: true, wordWrapWidth: 760, lineHeight: 30 },
    });
    photo.anchor.set(0.5);
    photo.position.set(VIEW_W / 2, VIEW_H / 2 + 60);
    this.prompt = new Text({ text: W.cont, style: { fontFamily: FONT, fontSize: 20, fill: 0xffd6a8 } });
    this.prompt.anchor.set(0.5);
    this.prompt.position.set(VIEW_W / 2, VIEW_H - 90);
    this.root.addChild(bg, main, photo, this.prompt);
  }

  enter(): void {
    this.off = this.game.input.on((a: Action) => {
      // short delay so a held key from launch doesn't skip it
      if (a === 'any' && this.t > 0.6 && !this.leaving) {
        this.leaving = true;
        this.game.audio.uiSelect();
        goTitle(this.game);
      }
    });
  }

  get deep(): boolean {
    return false;
  }

  exit(): void {
    this.off?.();
  }

  update(dt: number): void {
    this.t += dt;
    this.prompt.alpha = this.t < 0.6 ? 0 : 0.45 + 0.35 * Math.sin(this.t * 2.2);
  }
}
