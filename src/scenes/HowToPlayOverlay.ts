import { Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../core/Game';
import { Scene } from '../core/Scene';
import { FONT, VIEW_H, VIEW_W } from '../core/view';
import type { PlayPhase } from '../data/levels';
import { TEXT } from '../data/text';
import { PANIC_RED } from '../fx/PanicArc';
import { Menu } from '../ui/Menu';
import { drawPhaseIcon } from '../ui/PhaseBanner';

const WARM = 0xffc9a3;
const CARD_W = 350;
const CARD_H = 200;
const KINDS: PlayPhase[] = ['match', 'lead', 'anchor'];

export class HowToPlayOverlay extends Scene {
  private menu: Menu;
  private icons: Graphics[] = [];
  private t = 0;

  constructor(private game: Game) {
    super();
    const H = TEXT.howTo;
    const shade = new Graphics().rect(-50, -50, VIEW_W + 100, VIEW_H + 100).fill({ color: 0x05040c, alpha: 0.94 });
    shade.eventMode = 'static';
    const title = new Text({ text: H.title, style: { fontFamily: FONT, fontSize: 38, fill: 0xf2ecff, fontWeight: '700' } });
    title.anchor.set(0.5);
    title.position.set(VIEW_W / 2, 58);
    this.root.addChild(shade, title);

    H.steps.forEach((step, i) => {
      const card = new Container();
      card.position.set(VIEW_W / 2 + (i - 1) * (CARD_W + 30), 215);
      const bg = new Graphics();
      bg.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 16).fill({ color: 0x0f0c20, alpha: 0.95 });
      bg.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 16).stroke({ width: 1.5, color: WARM, alpha: 0.35 });
      const icon = new Graphics();
      icon.y = -CARD_H / 2 + 42;
      this.icons.push(icon);
      const name = new Text({ text: `${i + 1}  ${step.name}`, style: { fontFamily: FONT, fontSize: 18, fill: WARM, fontWeight: '700', letterSpacing: 2 } });
      name.anchor.set(0.5);
      name.y = -8;
      const body = new Text({
        text: step.text,
        style: { fontFamily: FONT, fontSize: 16, fill: 0xe6e0f4, align: 'center', wordWrap: true, wordWrapWidth: CARD_W - 40, lineHeight: 22 },
      });
      body.anchor.set(0.5, 0);
      body.y = 12;
      card.addChild(bg, icon, name, body);
      this.root.addChild(card);
    });

    const legendX = 250;
    H.legend.forEach((line, i) => {
      const y = 370 + i * 46;
      const glyph = new Graphics();
      glyph.position.set(legendX, y);
      this.drawGlyph(glyph, i);
      const text = new Text({ text: line, style: { fontFamily: FONT, fontSize: 18, fill: 0xe6e0f4 } });
      text.anchor.set(0, 0.5);
      text.position.set(legendX + 60, y);
      this.root.addChild(glyph, text);
    });
    // the thoughts row shows a sample thought instead of a drawn glyph
    const sample = new Text({ text: 'what if...', style: { fontFamily: FONT, fontSize: 15, fill: 0x9fb6ff, fontStyle: 'italic' } });
    sample.anchor.set(0.5);
    sample.position.set(legendX, 370 + 4 * 46);
    this.root.addChild(sample);

    this.menu = new Menu(game, [{ kind: 'button', label: TEXT.menu.back, action: () => this.close() }], { x: VIEW_W / 2, y: VIEW_H - 50 });
    this.menu.onBack = () => this.close();
    this.root.addChild(this.menu.root);
    this.root.alpha = 0;
  }

  private drawGlyph(g: Graphics, i: number): void {
    switch (i) {
      case 0:
        {
          const wy = (x: number) => Math.sin((x / 26) * Math.PI * 1.5) * -9;
          g.moveTo(-26, wy(-26));
          for (let x = -24; x <= 26; x += 2) g.lineTo(x, wy(x));
        }
        g.stroke({ width: 3, color: 0xfff1d8 });
        break;
      case 1:
        for (let k = 0; k < 3; k++) {
          const a0 = -Math.PI / 2 + (k * Math.PI * 2) / 3 + 0.12;
          const a1 = a0 + (Math.PI * 2) / 3 - 0.24;
          g.moveTo(Math.cos(a0) * 16, Math.sin(a0) * 16);
          g.arc(0, 0, 16, a0, a1);
          g.stroke({ width: 4, color: 0xdfe4ff, alpha: k < 2 ? 0.9 : 0.2 });
        }
        break;
      case 2:
        g.moveTo(Math.cos(0.3) * 17, Math.sin(0.3) * 17);
        g.arc(0, 0, 17, 0.3, Math.PI - 0.3);
        g.stroke({ width: 3, color: PANIC_RED });
        break;
      case 3:
        g.roundRect(-26, -11, 52, 22, 11).stroke({ width: 1.5, color: WARM });
        g.circle(-14, 0, 3).fill({ color: WARM });
        break;
      case 5:
        // a solid speech bubble, like the in-game one
        g.roundRect(-24, -13, 48, 22, 9).fill({ color: 0xf6f3ee });
        g.poly([-6, 8, 4, 8, -3, 15]).fill({ color: 0xf6f3ee });
        break;
    }
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
    this.icons.forEach((g, i) => {
      g.clear();
      drawPhaseIcon(g, KINDS[i], this.t, WARM);
    });
    this.menu.update(dt);
  }

  exit(): void {
    this.menu.destroy();
  }
}
