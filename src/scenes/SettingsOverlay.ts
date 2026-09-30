import { Graphics, Text } from 'pixi.js';
import type { Game } from '../core/Game';
import { canFullscreen } from '../core/platform';
import { Scene } from '../core/Scene';
import { FONT, VIEW_H, VIEW_W } from '../core/view';
import { TEXT } from '../data/text';
import { Menu } from '../ui/Menu';
import { HowToPlayOverlay } from './HowToPlayOverlay';

export class SettingsOverlay extends Scene {
  private menu: Menu;
  private t = 0;

  constructor(private game: Game) {
    super();
    const shade = new Graphics().rect(-50, -50, VIEW_W + 100, VIEW_H + 100).fill({ color: 0x05040c, alpha: 0.88 });
    shade.eventMode = 'static';
    const title = new Text({ text: TEXT.settings.title, style: { fontFamily: FONT, fontSize: 40, fill: 0xf2ecff, fontWeight: '700' } });
    title.anchor.set(0.5);
    title.position.set(VIEW_W / 2, 150);

    const s = game.settings;
    const T = TEXT.settings;
    this.menu = new Menu(
      game,
      [
        { kind: 'slider', label: T.master, get: () => s.data.master, set: (v) => s.set('master', v) },
        { kind: 'slider', label: T.music, get: () => s.data.music, set: (v) => s.set('music', v) },
        { kind: 'slider', label: T.sfx, get: () => s.data.sfx, set: (v) => s.set('sfx', v) },
        {
          kind: 'toggle',
          label: T.fullscreen,
          hidden: !canFullscreen,
          get: () => s.data.fullscreen,
          set: (v) => {
            s.set('fullscreen', v);
            game.applyFullscreen(v);
          },
        },
        { kind: 'toggle', label: T.reduceMotion, get: () => s.data.reduceMotion, set: (v) => s.set('reduceMotion', v) },
        { kind: 'button', label: TEXT.howTo.button, action: () => game.scenes.push(new HowToPlayOverlay(game)) },
        { kind: 'button', label: TEXT.menu.back, action: () => this.close() },
      ],
      { x: VIEW_W / 2, y: 230, spacing: 60, size: 26, width: 620 },
    );
    this.menu.onBack = () => this.close();
    title.y = Math.min(150, this.menu.top - 34);
    this.root.addChild(shade, title, this.menu.root);
    this.root.alpha = 0;
  }

  enter(): void {
    // F11 can change fullscreen behind our back, pick up the real state
    const bridge = window.appBridge;
    if (bridge) {
      void bridge.isFullscreen().then((on) => {
        if (on !== this.game.settings.data.fullscreen) this.game.settings.set('fullscreen', on);
        this.menu.refresh();
      });
    } else {
      const on = !!document.fullscreenElement;
      if (on !== this.game.settings.data.fullscreen) this.game.settings.set('fullscreen', on);
      this.menu.refresh();
    }
  }

  pause(): void {
    this.menu.enabled = false;
  }

  resume(): void {
    this.menu.enabled = true;
  }

  back(): void {
    this.close();
  }

  private close(): void {
    this.game.scenes.pop();
  }

  update(dt: number): void {
    this.t += dt;
    this.root.alpha = Math.min(1, this.t * 5);
    this.menu.update(dt);
  }

  exit(): void {
    this.menu.destroy();
  }
}
