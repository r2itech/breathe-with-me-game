import { Graphics, Text } from 'pixi.js';
import type { Game } from '../core/Game';
import { isElectron } from '../core/platform';
import { openLink } from '../core/openLink';
import { Scene } from '../core/Scene';
import { HELP_URL } from '../data/links';
import { FONT, VIEW_H, VIEW_W } from '../core/view';
import { TEXT } from '../data/text';
import { Menu } from '../ui/Menu';
import { HowToPlayOverlay } from './HowToPlayOverlay';
import { SettingsOverlay } from './SettingsOverlay';

export interface PauseActions {
  restart(): void;
  toMap(): void;
}

export class PauseOverlay extends Scene {
  private menu: Menu;
  private t = 0;

  constructor(
    private game: Game,
    actions: PauseActions,
  ) {
    super();
    const shade = new Graphics().rect(-50, -50, VIEW_W + 100, VIEW_H + 100).fill({ color: 0x05040c, alpha: 0.75 });
    shade.eventMode = 'static';
    const title = new Text({ text: TEXT.pause, style: { fontFamily: FONT, fontSize: 40, fill: 0xf2ecff, fontWeight: '700' } });
    title.anchor.set(0.5);
    title.position.set(VIEW_W / 2, 190);

    const M = TEXT.menu;
    this.menu = new Menu(
      game,
      [
        { kind: 'button', label: M.resume, action: () => this.resumeGame() },
        { kind: 'button', label: TEXT.howTo.button, action: () => game.scenes.push(new HowToPlayOverlay(game)) },
        { kind: 'button', label: M.restart, action: () => actions.restart() },
        { kind: 'button', label: M.settings, action: () => game.scenes.push(new SettingsOverlay(game)) },
        { kind: 'button', label: M.backToMap, action: () => actions.toMap() },
        { kind: 'button', label: M.quit, hidden: !isElectron, action: () => game.quit() },
        { kind: 'button', small: true, label: TEXT.links.help, action: () => openLink(HELP_URL) },
      ],
      { x: VIEW_W / 2, y: 270, spacing: 56 },
    );
    this.menu.onBack = () => this.resumeGame();
    // big touch menus can push up into the title's spot
    title.y = Math.min(190, this.menu.top - 36);
    this.root.addChild(shade, title, this.menu.root);
    this.root.alpha = 0;
  }

  back(): void {
    this.resumeGame();
  }

  private resumeGame(): void {
    this.game.scenes.pop();
  }

  pause(): void {
    this.menu.enabled = false;
  }

  resume(): void {
    this.menu.enabled = true;
  }

  update(dt: number): void {
    this.t += dt;
    this.root.alpha = Math.min(1, this.t * 6);
    this.menu.update(dt);
  }

  exit(): void {
    this.menu.destroy();
  }
}
