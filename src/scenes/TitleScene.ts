import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { PlayerBreath } from '../breath/PlayerBreath';
import type { Game } from '../core/Game';
import type { Action } from '../core/Input';
import { enterMobileFullscreen, isElectron, isTouch } from '../core/platform';
import { openLink } from '../core/openLink';
import { Scene } from '../core/Scene';
import { GITHUB_URL, HELP_URL } from '../data/links';
import { FONT, VIEW_H, VIEW_W } from '../core/view';
import { TEXT } from '../data/text';
import { BreathCircle } from '../fx/BreathCircle';
import { gradientTexture } from '../fx/textures';
import { CornerButton } from '../ui/CornerButton';
import { Menu } from '../ui/Menu';
import { goMap } from './flow';
import { SettingsOverlay } from './SettingsOverlay';

const BREATHS_TO_REVEAL = 3;
const MIN_INHALE = 0.7;
const COLOR = 0xffc9a3;
// title text center, and where the circle ends up once it moves out of the way
const TITLE_Y = 222;
const CIRCLE_UP_Y = 94;
const CIRCLE_UP_SCALE = 0.42;

export class TitleScene extends Scene {
  private breath = new PlayerBreath(5);
  private circle = new BreathCircle();
  private prompt: Text;
  private dots = new Graphics();
  private dotsDrawn = -1;
  private titleBox = new Container();
  private menuLayer = new Container();
  private menu: Menu | null = null;
  private count = 0;
  private inhaleStart = 0;
  private reveal = 0;
  private revealed = false;
  private t = 0;
  private cy = VIEW_H / 2 - 20;
  private off: (() => void) | null = null;
  private offGesture: (() => void) | null = null;
  private paused = false;
  private triedFullscreen = false;
  private corner = new Container();
  private github: CornerButton;
  private help: CornerButton;

  constructor(private game: Game) {
    super();
    const bg = new Sprite(gradientTexture(0x05050c, 0x120e22));
    bg.position.set(-40, -40);
    bg.width = VIEW_W + 80;
    bg.height = VIEW_H + 80;

    this.prompt = new Text({ text: TEXT.title.prompt, style: { fontFamily: FONT, fontSize: 24, fill: 0xf2ecff, fontWeight: '600', letterSpacing: 2 } });
    this.prompt.anchor.set(0.5);
    this.prompt.position.set(VIEW_W / 2, VIEW_H - 150);
    this.prompt.alpha = 0;

    const name = new Text({ text: TEXT.title.name, style: { fontFamily: FONT, fontSize: 76, fill: 0xfff4ea, fontWeight: '700', letterSpacing: 2 } });
    name.anchor.set(0.5);
    name.position.set(VIEW_W / 2, TITLE_Y);
    const sub = new Text({ text: TEXT.title.sub, style: { fontFamily: FONT, fontSize: 22, fill: 0xffd6a8, fontWeight: '600', letterSpacing: 2 } });
    sub.anchor.set(0.5);
    sub.position.set(VIEW_W / 2, TITLE_Y + 66);
    // quiet little badge, bottom center
    const badge = new Text({ text: TEXT.title.badge, style: { fontFamily: FONT, fontSize: 14, fill: 0x8a84a6, fontWeight: '600', letterSpacing: 3 } });
    badge.anchor.set(0.5);
    badge.position.set(VIEW_W / 2, VIEW_H - 28);
    badge.alpha = 0.7;
    this.titleBox.addChild(name, sub, badge);
    this.titleBox.alpha = 0;
    this.menuLayer.alpha = 0;

    this.github = new CornerButton({ icon: 'github', tooltip: TEXT.links.github, onTap: () => openLink(GITHUB_URL) });
    this.help = new CornerButton({ icon: 'help', label: TEXT.links.help, onTap: () => openLink(HELP_URL) });
    this.corner.addChild(this.github.root, this.help.root);

    this.root.addChild(bg, this.circle.root, this.titleBox, this.prompt, this.dots, this.menuLayer, this.corner);
    if (game.save.hasProgress) this.count = BREATHS_TO_REVEAL - 1;
  }

  enter(): void {
    this.game.audio.playMenuMusic('title');
    this.off = this.game.input.on((a) => this.onAction(a));
    // phones: first real tap here goes fullscreen + landscape. on a real gesture
    // (pointerup/touchend), not pointerdown, which Android doesn't count, and
    // after the audio unlock has already had its go at the same tap
    this.offGesture = this.game.input.onGesture(() => {
      if (this.paused || this.triedFullscreen || !isTouch) return;
      this.triedFullscreen = true;
      enterMobileFullscreen();
    });
  }

  get deep(): boolean {
    return false;
  }

  get idleFps(): number {
    return 20;
  }

  exit(): void {
    this.off?.();
    this.offGesture?.();
    this.menu?.destroy();
    this.menu = null;
  }

  pause(): void {
    this.paused = true;
    if (this.menu) this.menu.enabled = false;
  }

  resume(): void {
    this.paused = false;
    if (this.menu) this.menu.enabled = true;
  }

  // top-left link buttons, out of the notch and big enough to tap
  private layoutCorner(dt: number): void {
    const k = this.game.uiScale;
    const safe = this.game.safe;
    this.corner.scale.set(k);
    this.corner.position.set(16 + safe.left, 16 + safe.top);
    this.help.root.x = this.github.width + 10;
    this.github.update(dt);
    this.help.update(dt);
  }

  private onAction(a: Action): void {
    if (this.paused) return;
    // returning players can skip the breathing intro
    if (a === 'confirm' && !this.revealed && this.game.save.hasProgress) this.doReveal();
  }

  private doReveal(): void {
    if (this.revealed) return;
    this.revealed = true;
    this.showMainMenu();
  }

  private setMenu(m: Menu): void {
    this.menu?.destroy();
    this.menu = m;
    this.menuLayer.addChild(m.root);
  }

  private showMainMenu(): void {
    const g = this.game;
    const M = TEXT.menu;
    const m = new Menu(
      g,
      [
        { kind: 'button', label: M.cont, disabled: !g.save.hasProgress, action: () => goMap(g) },
        { kind: 'button', label: M.newGame, action: () => this.newGame() },
        { kind: 'button', label: M.settings, action: () => g.scenes.push(new SettingsOverlay(g)) },
        { kind: 'button', label: M.quit, hidden: !isElectron, action: () => g.quit() },
      ],
      { x: VIEW_W / 2, y: 400, spacing: 56 },
    );
    this.setMenu(m);
  }

  private newGame(): void {
    const g = this.game;
    if (!g.save.hasProgress) {
      g.save.reset();
      goMap(g, { focus: 0 });
      return;
    }
    const M = TEXT.menu;
    const m = new Menu(
      g,
      [
        { kind: 'button', label: M.no, action: () => this.showMainMenu() },
        {
          kind: 'button',
          label: M.yes,
          action: () => {
            g.save.reset();
            goMap(g, { focus: 0 });
          },
        },
      ],
      { x: VIEW_W / 2, y: 450, spacing: 56, size: 26 },
    );
    m.onBack = () => this.showMainMenu();
    const q = new Text({ text: M.confirmNew, style: { fontFamily: FONT, fontSize: 22, fill: 0xb9b3d6 } });
    q.anchor.set(0.5);
    q.position.set(VIEW_W / 2, 390);
    m.root.addChild(q);
    this.setMenu(m);
  }

  update(dt: number): void {
    this.t += dt;
    const b = this.breath;
    b.update(dt, this.game.input.held);
    if (b.justInhaled) this.inhaleStart = this.t;
    if (b.justExhaled && this.t - this.inhaleStart >= MIN_INHALE && !this.revealed) {
      this.count++;
      if (this.count >= BREATHS_TO_REVEAL) this.doReveal();
    }

    if (this.revealed) this.reveal = Math.min(1, this.reveal + dt * 0.5);
    const r = this.reveal;
    const ease = r * r * (3 - 2 * r);

    // circle floats up above the title once it shows, clear of the text
    const y = this.cy + (CIRCLE_UP_Y - this.cy) * ease;
    this.circle.x = VIEW_W / 2;
    this.circle.y = y;
    const radius = (50 + 90 * b.lung) * (1 - (1 - CIRCLE_UP_SCALE) * ease);
    this.circle.update(this.t, { radius, color: COLOR, wobble: 0.05, tremble: 0, glow: 0.3 + 0.5 * b.lung, alpha: 1 - 0.35 * ease });

    this.prompt.alpha = Math.min(1, this.t * 0.6) * (1 - ease) * (0.55 + 0.3 * Math.sin(this.t * 1.5));
    if (b.hasBreathed && !this.revealed) this.prompt.text = TEXT.title.promptBreathe;

    const d = this.dots;
    const dotsAlpha = (1 - ease) * Math.min(1, this.t);
    d.alpha = dotsAlpha;
    d.visible = dotsAlpha > 0.001;
    if (this.dotsDrawn !== this.count) {
      this.dotsDrawn = this.count;
      d.clear();
      for (let i = 0; i < BREATHS_TO_REVEAL; i++) {
        const x = VIEW_W / 2 + (i - 1) * 22;
        d.circle(x, VIEW_H - 112, 4).fill({ color: COLOR, alpha: i < this.count ? 0.9 : 0.2 });
      }
    }

    this.titleBox.alpha = ease;
    this.menuLayer.alpha = Math.max(0, (r - 0.4) / 0.6);
    this.menu?.update(dt);
    this.layoutCorner(dt);

    this.game.audio.updateBreath(dt, { lung: b.lung, inhaling: b.state === 'in' }, null, 0);
  }
}
