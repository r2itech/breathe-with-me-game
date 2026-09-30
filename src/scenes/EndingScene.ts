import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { Game } from '../core/Game';
import type { Action } from '../core/Input';
import { openLink } from '../core/openLink';
import { Scene } from '../core/Scene';
import { HELP_URL } from '../data/links';
import { FONT, VIEW_H, VIEW_W } from '../core/view';
import { LEVELS, PALETTES } from '../data/levels';
import { TEXT, formatMinutes } from '../data/text';
import { gradientTexture } from '../fx/textures';
import { Weather } from '../fx/Weather';
import { Caption } from '../ui/Caption';
import { CornerButton } from '../ui/CornerButton';
import { goTitle } from './flow';

type Stage = 'stats' | 'lines' | 'credits' | 'end';

const CREDIT_SPEED = 38;

export class EndingScene extends Scene {
  private stage: Stage = 'stats';
  private t = 0;
  private stageT = 0;
  private stars: Weather;
  private statsBox = new Container();
  private statRows: Container[] = [];
  private caption: Caption;
  private credits: Text;
  private prompt: Text;
  private off: (() => void) | null = null;
  private leaving = false;
  private backButton: CornerButton;
  private link = new Container();
  private linkOn = false;
  // a tap on the link shouldn't also skip ahead
  private pressingLink = false;

  constructor(private game: Game) {
    super();
    const p = PALETTES.you;
    const bg = new Sprite(gradientTexture(p.warmTop, 0x5a3348));
    bg.position.set(-40, -40);
    bg.width = VIEW_W + 80;
    bg.height = VIEW_H + 80;
    this.stars = new Weather('snow', 0.5, p.weather, p.star);

    const s = game.save.data;
    const helped = Math.min(s.completed, LEVELS.length - 1);
    const rows: [string, string][] = [
      [TEXT.ending.helped, String(helped)],
      [TEXT.ending.breaths, String(Math.round(s.stats.breaths))],
      [TEXT.ending.sync, formatMinutes(s.stats.syncTime)],
    ];
    rows.forEach(([label, value], i) => {
      const row = new Container();
      const l = new Text({ text: label, style: { fontFamily: FONT, fontSize: 26, fill: 0xf2e4ea } });
      l.anchor.set(1, 0.5);
      l.x = -20;
      const v = new Text({ text: value, style: { fontFamily: FONT, fontSize: 34, fill: 0xffe0b0, fontWeight: '700' } });
      v.anchor.set(0, 0.5);
      v.x = 20;
      row.addChild(l, v);
      row.position.set(VIEW_W / 2, 280 + i * 70);
      row.alpha = 0;
      this.statRows.push(row);
      this.statsBox.addChild(row);
    });

    this.caption = new Caption(VIEW_W / 2, VIEW_H / 2, 34, 0xfff4ea);

    this.credits = new Text({
      text: [...TEXT.credits].join('\n'),
      style: { fontFamily: FONT, fontSize: 26, fill: 0xfff0e6, align: 'center', lineHeight: 44, fontWeight: '600' },
    });
    this.credits.anchor.set(0.5, 0);
    this.credits.position.set(VIEW_W / 2, VIEW_H + 20);
    this.credits.visible = false;

    this.prompt = new Text({ text: TEXT.ending.cont, style: { fontFamily: FONT, fontSize: 20, fill: 0xffd6a8 } });
    this.prompt.anchor.set(0.5);
    this.prompt.position.set(VIEW_W / 2, VIEW_H - 60);
    this.prompt.alpha = 0;

    this.buildLink();
    // always a visible way out, not just 'tap to continue' at the very end
    this.backButton = new CornerButton({ icon: 'back', label: TEXT.map.back, onTap: () => this.back() });
    this.backButton.root.on('pointerdown', () => (this.pressingLink = true));
    this.root.addChild(bg, this.stars.back, this.stars.front, this.statsBox, this.caption.root, this.credits, this.link, this.prompt, this.backButton.root);
  }

  private buildLink(): void {
    const text = new Text({ text: TEXT.links.helpline, style: { fontFamily: FONT, fontSize: 22, fill: 0xffe0b0, fontWeight: '700' } });
    text.anchor.set(0.5);
    const w = text.width + 40;
    const pill = new Graphics();
    pill.roundRect(-w / 2, -24, w, 48, 24).fill({ color: 0x1a0f22, alpha: 0.75 });
    pill.roundRect(-w / 2, -24, w, 48, 24).stroke({ width: 2, color: 0xffe0b0, alpha: 0.6 });
    pill.moveTo(-text.width / 2, 14).lineTo(text.width / 2, 14).stroke({ width: 1.5, color: 0xffe0b0, alpha: 0.7 });
    this.link.addChild(pill, text);
    this.link.position.set(VIEW_W / 2, VIEW_H - 112);
    this.link.scale.set(this.game.uiScale);
    this.link.alpha = 0;
    this.link.visible = false;
    this.link.eventMode = 'static';
    this.link.cursor = 'pointer';
    this.link.on('pointerdown', () => (this.pressingLink = true));
    this.link.on('pointertap', () => openLink(HELP_URL));
    // shows up with the 'talk to someone you trust' line and stays
    const at = TEXT.ending.lines.length - 1;
    this.caption.onLine = (i) => {
      if (i === at) {
        this.linkOn = true;
        this.link.visible = true;
      }
    };
  }

  enter(): void {
    const all = LEVELS.slice(0, 4).map((l) => l.music.signature);
    this.game.audio.playMenuMusic('ending', all);
    this.off = this.game.input.on((a) => this.onAction(a));
  }

  exit(): void {
    this.off?.();
  }

  private onAction(a: Action): void {
    if (this.leaving) return;
    // only 'any', Enter also fires 'confirm' and would skip twice
    if (a !== 'any') return;
    if (this.pressingLink) {
      this.pressingLink = false;
      return;
    }
    if (this.stage === 'stats' && this.stageT > 2) this.startLines();
    else if (this.stage === 'lines') this.caption.skip();
    else if (this.stage === 'end' || (this.stage === 'credits' && this.stageT > 4)) {
      this.leaving = true;
      goTitle(this.game);
    }
  }

  private startLines(): void {
    this.stage = 'lines';
    this.stageT = 0;
    this.caption.show([...TEXT.ending.lines, TEXT.ending.mhd], () => this.startCredits());
  }

  private startCredits(): void {
    this.stage = 'credits';
    this.stageT = 0;
    this.credits.visible = true;
    this.credits.y = VIEW_H + 20;
  }

  back(): void {
    if (this.leaving) return;
    this.leaving = true;
    goTitle(this.game);
  }

  update(dt: number): void {
    this.backButton.root.scale.set(this.game.uiScale);
    this.backButton.root.position.set(16 + this.game.safe.left, 16 + this.game.safe.top);
    this.backButton.update(dt);
    this.t += dt;
    this.stageT += dt;
    this.stars.update(dt, 0, 1);

    const statsOn = this.stage === 'stats';
    this.statRows.forEach((r, i) => {
      const want = statsOn ? Math.min(1, Math.max(0, (this.stageT - 0.6 - i * 0.7) / 0.8)) : 0;
      r.alpha = statsOn ? want : Math.max(0, r.alpha - dt * 1.5);
    });
    if (statsOn && this.stageT > 8) this.startLines();

    this.caption.update(dt);
    if (this.linkOn) this.link.alpha = Math.min(1, this.link.alpha + dt * 1.5);

    if (this.stage === 'credits') {
      this.credits.y -= CREDIT_SPEED * dt;
      // stop once the last line sits in the middle
      const stopAt = VIEW_H / 2 - this.credits.height + 30;
      if (this.credits.y <= stopAt) {
        this.credits.y = stopAt;
        this.stage = 'end';
        this.stageT = 0;
      }
    }

    const showPrompt = this.stage === 'end' || (this.stage === 'stats' && this.stageT > 3);
    this.prompt.alpha += ((showPrompt ? 0.5 + 0.3 * Math.sin(this.t * 2) : 0) - this.prompt.alpha) * Math.min(1, dt * 3);
  }
}
