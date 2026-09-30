import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import type { Game } from '../core/Game';
import type { Action } from '../core/Input';
import { Scene } from '../core/Scene';
import { FONT, VIEW_H, VIEW_W } from '../core/view';
import { FINAL, LEVELS } from '../data/levels';
import { TEXT } from '../data/text';
import { dotTexture, glowTexture, gradientTexture } from '../fx/textures';
import { drawHeart } from '../ui/Card';
import { CornerButton } from '../ui/CornerButton';
import { goEnding, goLevel, goTitle } from './flow';

export interface MapOptions {
  focus?: number;
  celebrate?: boolean;
  justHelped?: number;
}

interface Win {
  index: number;
  x: number;
  y: number;
  frame: Graphics;
  inner: Graphics;
  warmGlow: Sprite;
  storm: Sprite[];
  companion: Sprite;
  warm: number;
  hover: number;
}

// window centers for the five people, left to right
const SPOTS = [
  { x: 190, y: 400 },
  { x: 440, y: 330 },
  { x: 690, y: 262 },
  { x: 935, y: 420 },
  { x: 1125, y: 345 },
];
const WIN_W = 56;
const WIN_H = 70;
const WARM = 0xffcf8a;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GridWin {
  x: number;
  y: number;
  lit: number;
  order: number;
}

export class CityMapScene extends Scene {
  private wins: Win[] = [];
  private grid: GridWin[] = [];
  private gridG = new Graphics();
  private stars: Sprite[] = [];
  private selected = 0;
  private info: Text;
  private header: Text;
  private footer: Text;
  private t = 0;
  private off: (() => void) | null = null;
  private cityLight = 0;
  private drawnLight = -1;
  private leaving = false;
  private paused = false;
  private backButton: CornerButton;

  constructor(
    private game: Game,
    private opts: MapOptions,
  ) {
    super();
    const sky = new Sprite(gradientTexture(0x060717, 0x1c1a3c));
    sky.position.set(-40, -40);
    sky.width = VIEW_W + 80;
    sky.height = VIEW_H + 80;
    this.root.addChild(sky);

    const r = rng(7);
    const starLayer = new Container();
    for (let i = 0; i < 70; i++) {
      const s = new Sprite(dotTexture());
      s.anchor.set(0.5);
      s.position.set(r() * VIEW_W, r() * VIEW_H * 0.55);
      s.scale.set(0.1 + r() * 0.18);
      s.blendMode = 'add';
      this.stars.push(s);
      starLayer.addChild(s);
    }
    const moon = new Sprite(glowTexture());
    moon.anchor.set(0.5);
    moon.position.set(1040, 110);
    moon.scale.set(0.9);
    moon.tint = 0xdfe4ff;
    moon.alpha = 0.35;
    moon.blendMode = 'add';
    starLayer.addChild(moon);
    this.root.addChild(starLayer);

    this.buildSkyline(r);

    const save = game.save.data;
    SPOTS.forEach((spot, i) => this.wins.push(this.makeWindow(i, spot.x, spot.y, i < save.completed && i !== opts.justHelped)));

    this.header = new Text({ text: save.finished ? TEXT.map.allLit : TEXT.map.choose, style: { fontFamily: FONT, fontSize: 26, fill: 0xf2ecff, fontWeight: '600' } });
    this.header.anchor.set(0.5);
    this.header.position.set(VIEW_W / 2, 60);
    this.info = new Text({ text: '', style: { fontFamily: FONT, fontSize: 26, fill: 0xfff4ea, fontWeight: '700' } });
    this.info.anchor.set(0.5);
    this.info.position.set(VIEW_W / 2, VIEW_H - 64);
    this.footer = new Text({ text: TEXT.map.enter, style: { fontFamily: FONT, fontSize: 17, fill: 0xb9b3d6 } });
    this.footer.anchor.set(0.5);
    this.footer.position.set(VIEW_W / 2, VIEW_H - 30);
    this.root.addChild(this.header, this.info, this.footer);
    this.backButton = new CornerButton({ icon: 'back', label: TEXT.map.back, onTap: () => this.back() });
    this.backButton.root.visible = !opts.celebrate;
    this.root.addChild(this.backButton.root);

    const unlocked = this.maxUnlocked();
    this.selected = Math.min(opts.focus ?? unlocked, unlocked);
    if (save.finished && opts.focus === undefined) this.selected = 0;
    this.cityLight = save.finished && !opts.celebrate ? 1 : 0;
    if (opts.celebrate) {
      this.header.alpha = 0;
      this.footer.visible = false;
    }
  }

  private maxUnlocked(): number {
    return Math.min(FINAL.levelIndex, this.game.save.data.completed);
  }

  private buildSkyline(r: () => number): void {
    const far = new Graphics();
    let x = -20;
    while (x < VIEW_W + 20) {
      const w = 60 + r() * 90;
      const h = 180 + r() * 220;
      far.rect(x, VIEW_H - h, w, h).fill(0x141632);
      x += w - 10;
    }
    this.root.addChild(far);

    const near = new Graphics();
    // buildings that hold the special windows
    const blocks: { x: number; w: number; top: number }[] = SPOTS.map((s) => ({ x: s.x - 85, w: 170, top: s.y - 80 - r() * 50 }));
    // fillers in the gaps
    const fill: { x: number; w: number; top: number }[] = [];
    for (let i = 0; i <= blocks.length; i++) {
      const left = i === 0 ? -20 : blocks[i - 1].x + blocks[i - 1].w;
      const right = i === blocks.length ? VIEW_W + 20 : blocks[i].x;
      let cx = left;
      while (cx < right - 10) {
        const w = Math.min(right - cx, 50 + r() * 70);
        fill.push({ x: cx, w, top: VIEW_H - 140 - r() * 200 });
        cx += w;
      }
    }
    const all = [...fill, ...blocks];
    for (const b of all) {
      near.rect(b.x, b.top, b.w, VIEW_H - b.top).fill(0x0b0b1a);
      near.rect(b.x, b.top, b.w, 3).fill({ color: 0x2a2850, alpha: 0.6 });
      // little grid of ordinary windows
      for (let wy = b.top + 22; wy < VIEW_H - 20; wy += 30) {
        for (let wx = b.x + 12; wx < b.x + b.w - 16; wx += 24) {
          const nearSpot = SPOTS.some((s) => Math.abs(s.x - wx - 5) < WIN_W && Math.abs(s.y - wy - 7) < WIN_H);
          if (nearSpot) continue;
          this.grid.push({ x: wx, y: wy, lit: r() < 0.18 ? 0.3 + r() * 0.3 : 0.04, order: r() });
        }
      }
    }
    this.root.addChild(near, this.gridG);
  }

  private makeWindow(index: number, x: number, y: number, warm: boolean): Win {
    const box = new Container();
    const cfg = LEVELS[index];
    const inner = new Graphics().rect(-WIN_W / 2, -WIN_H / 2, WIN_W, WIN_H).fill(cfg.palette.bgBottom);
    const warmGlow = new Sprite(glowTexture());
    warmGlow.anchor.set(0.5);
    warmGlow.blendMode = 'add';
    warmGlow.tint = WARM;
    warmGlow.scale.set(0.9);
    const storm: Sprite[] = [];
    const stormBox = new Container();
    for (let i = 0; i < 9; i++) {
      const s = new Sprite(dotTexture());
      s.anchor.set(0.5);
      s.tint = cfg.palette.weather;
      s.scale.set(0.14 + Math.random() * 0.12);
      storm.push(s);
      stormBox.addChild(s);
    }
    const mask = new Graphics().rect(-WIN_W / 2, -WIN_H / 2, WIN_W, WIN_H).fill(0xffffff);
    stormBox.mask = mask;
    const frame = new Graphics();
    const companion = new Sprite(glowTexture());
    companion.anchor.set(0.5);
    companion.blendMode = 'add';
    companion.tint = cfg.palette.npc;
    companion.scale.set(0.16);

    // best hearts under the window once they've been helped
    const hearts = new Graphics();
    const best = this.game.save.heartsFor(index);
    if (best > 0) for (let i = 0; i < 3; i++) drawHeart(hearts, (i - 1) * 18, WIN_H / 2 + 20, 13, 0xff8fa0, i < best);

    box.addChild(warmGlow, inner, stormBox, mask, frame, companion, hearts);
    box.position.set(x, y);
    box.eventMode = 'static';
    box.cursor = 'pointer';
    box.hitArea = new Rectangle(-WIN_W, -WIN_H, WIN_W * 2, WIN_H * 2);
    box.on('pointerover', () => {
      if (this.isUnlocked(index) && this.selected !== index && !this.paused) {
        this.selected = index;
        this.game.audio.uiMove();
      }
    });
    box.on('pointertap', () => {
      if (this.paused) return;
      if (this.isUnlocked(index)) {
        this.selected = index;
        this.enterSelected();
      }
    });
    this.root.addChild(box);
    return { index, x, y, frame, inner, warmGlow, storm, companion, warm: warm ? 1 : 0, hover: 0 };
  }

  private isUnlocked(i: number): boolean {
    return i <= this.maxUnlocked() && !this.opts.celebrate;
  }

  enter(): void {
    const done = LEVELS.slice(0, Math.min(this.game.save.data.completed, 4)).map((l) => l.music.signature);
    this.game.audio.playMenuMusic(this.opts.celebrate || this.game.save.data.finished ? 'ending' : 'map', done);
    this.off = this.game.input.on((a) => this.onAction(a));
  }

  exit(): void {
    this.off?.();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  private onAction(a: Action): void {
    if (this.leaving || this.paused) return;
    if (this.opts.celebrate) {
      if (a === 'any' && this.t > 3) this.finishCelebrate();
      return;
    }
    const max = this.maxUnlocked();
    if (a === 'left' || a === 'up') {
      this.selected = this.selected <= 0 ? max : this.selected - 1;
      this.game.audio.uiMove();
    } else if (a === 'right' || a === 'down') {
      this.selected = this.selected >= max ? 0 : this.selected + 1;
      this.game.audio.uiMove();
    } else if (a === 'confirm') {
      this.enterSelected();
    } else if (a === 'back') {
      this.back();
    }
  }

  back(): void {
    if (this.leaving || this.opts.celebrate) return;
    this.leaving = true;
    goTitle(this.game);
  }

  private enterSelected(): void {
    if (this.leaving || !this.isUnlocked(this.selected)) return;
    this.leaving = true;
    this.game.audio.uiSelect();
    goLevel(this.game, this.selected);
  }

  private finishCelebrate(): void {
    if (this.leaving) return;
    this.leaving = true;
    goEnding(this.game);
  }

  update(dt: number): void {
    this.t += dt;
    const k = this.game.uiScale;
    this.backButton.root.scale.set(k);
    this.backButton.root.position.set(16 + this.game.safe.left, 16 + this.game.safe.top);
    this.backButton.update(dt);
    const t = this.t;
    const save = this.game.save.data;

    if (this.opts.celebrate) {
      this.cityLight = Math.min(1, this.cityLight + dt / 4);
      if (t > 2.5) this.header.alpha = Math.min(1, this.header.alpha + dt * 0.7);
      if (t > 9) this.finishCelebrate();
    }

    this.stars.forEach((s, i) => (s.alpha = 0.3 + 0.3 * Math.sin(t * 0.8 + i * 1.7)));

    // ordinary windows light up one after another when the city is saved
    if (this.cityLight !== this.drawnLight) {
      this.drawnLight = this.cityLight;
      const g = this.gridG;
      g.clear();
      for (const w of this.grid) {
        const on = this.cityLight > w.order ? 1 : 0;
        const a = w.lit + (0.55 - w.lit) * on * Math.min(1, (this.cityLight - w.order) * 6 + 0.001);
        g.rect(w.x, w.y, 10, 14).fill({ color: WARM, alpha: Math.max(0.03, a) });
      }
    }

    for (const w of this.wins) {
      const done = w.index < save.completed;
      const unlocked = this.isUnlocked(w.index) || this.opts.celebrate;
      if (done || this.cityLight > 0.5) w.warm = Math.min(1, w.warm + dt * 0.7);
      const sel = w.index === this.selected && !this.opts.celebrate;
      w.hover += ((sel ? 1 : 0) - w.hover) * Math.min(1, dt * 8);

      const f = w.frame;
      f.clear();
      f.rect(-WIN_W / 2 - 4, -WIN_H / 2 - 4, WIN_W + 8, WIN_H + 8).stroke({
        width: 3,
        color: sel ? 0xffe6c4 : 0x3a3860,
        alpha: unlocked ? 0.6 + 0.4 * w.hover : 0.3,
      });
      f.moveTo(0, -WIN_H / 2).lineTo(0, WIN_H / 2).stroke({ width: 2, color: 0x0b0b1a, alpha: 0.8 });
      f.moveTo(-WIN_W / 2, 0).lineTo(WIN_W / 2, 0).stroke({ width: 2, color: 0x0b0b1a, alpha: 0.8 });

      w.inner.alpha = unlocked ? 0.9 : 0.35;
      w.warmGlow.alpha = w.warm * (0.55 + 0.1 * Math.sin(t * 1.5 + w.index));

      // tiny storm inside until they're helped
      const storm = 1 - w.warm;
      const speed = unlocked ? 2.4 : 0.8;
      w.storm.forEach((s, i) => {
        const a = t * speed * (1 + i * 0.13) + i * 2.1;
        s.x = Math.cos(a) * WIN_W * 0.32 + Math.sin(a * 2.3) * 4;
        s.y = Math.sin(a * 1.4) * WIN_H * 0.32;
        s.alpha = storm * (unlocked ? 0.85 : 0.3);
      });

      w.companion.visible = done;
      w.companion.x = WIN_W / 2 + 18 + Math.sin(t * 1.1 + w.index) * 4;
      w.companion.y = -WIN_H / 2 + Math.cos(t * 1.4 + w.index) * 6;
      w.companion.alpha = 0.8 * w.warm;
    }

    if (!this.opts.celebrate) {
      const i = this.selected;
      const lt = TEXT.levels[i];
      const done = i < save.completed;
      this.info.text = this.isUnlocked(i) ? `${lt.name}  ·  ${lt.tagline}${done ? `  ·  ${TEXT.map.helped}` : ''}` : TEXT.map.locked;
      this.info.alpha = 0.9;
    } else {
      this.info.text = '';
    }
  }
}
