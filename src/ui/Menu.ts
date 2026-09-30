import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import type { Game } from '../core/Game';
import type { Action } from '../core/Input';
import { FONT, VIEW_H, VIEW_W } from '../core/view';
import { TEXT } from '../data/text';
import { glowTexture } from '../fx/textures';

export type MenuItem = (
  | { kind: 'button'; label: string; action: () => void; disabled?: boolean; small?: boolean }
  | { kind: 'slider'; label: string; get: () => number; set: (v: number) => void }
  | { kind: 'toggle'; label: string; get: () => boolean; set: (v: boolean) => void }
) & {
  // platform-specific items (Quit, fullscreen) just drop out
  hidden?: boolean;
};

interface Row {
  item: MenuItem;
  box: Container;
  label: Text;
  value: Text | null;
  bar: Graphics | null;
  lit: number;
}

export interface MenuOptions {
  x: number;
  y: number;
  spacing?: number;
  size?: number;
  // total row width for sliders/toggles
  width?: number;
  color?: number;
  accent?: number;
}

const BAR_W = 200;

export class Menu {
  readonly root = new Container();
  private rows: Row[] = [];
  private index = 0;
  private off: () => void;
  private marker: Sprite;
  private opts: Required<MenuOptions>;
  enabled = true;
  onBack: (() => void) | null = null;
  // top edge of the first row after fitting, so titles can sit above it
  readonly top: number;

  constructor(
    private game: Game,
    allItems: MenuItem[],
    opts: MenuOptions,
  ) {
    const items = allItems.filter((it) => !it.hidden);
    this.opts = { spacing: 54, size: 28, width: 560, color: 0xf2ecff, accent: 0xffd6a8, ...opts };
    const o = this.opts;
    // bigger rows/text on small screens so they stay tappable and readable
    const k = game.uiScale;
    o.spacing *= k;
    o.size = Math.round(o.size * k);
    o.width = Math.min(VIEW_W - 80, o.width * k);
    const small = (it: MenuItem) => it.kind === 'button' && !!it.small;
    const rowH = items.map((it) => (small(it) ? o.spacing * 0.72 : o.spacing));
    const ys = this.layoutRows(o.y, rowH);
    this.top = ys.length ? ys[0] - rowH[0] / 2 : o.y;
    const hasWide = items.some((i) => i.kind !== 'button');

    this.marker = new Sprite(glowTexture());
    this.marker.anchor.set(0.5);
    this.marker.blendMode = 'add';
    this.marker.tint = o.accent;
    this.marker.scale.set(0.12);
    this.root.addChild(this.marker);

    items.forEach((item, i) => {
      const box = new Container();
      box.position.set(o.x, ys[i]);
      const size = small(item) ? Math.round(o.size * 0.68) : o.size;
      const label = new Text({ text: item.label, style: { fontFamily: FONT, fontSize: size, fill: small(item) ? 0xb9b3d6 : o.color, fontWeight: '600' } });
      let value: Text | null = null;
      let bar: Graphics | null = null;
      if (hasWide) {
        label.anchor.set(0, 0.5);
        label.x = -o.width / 2;
      } else {
        label.anchor.set(0.5);
      }
      box.addChild(label);
      if (item.kind === 'slider') {
        bar = new Graphics();
        bar.x = o.width / 2 - BAR_W;
        box.addChild(bar);
      } else if (item.kind === 'toggle') {
        value = new Text({ text: '', style: { fontFamily: FONT, fontSize: o.size, fill: o.accent, fontWeight: '600' } });
        value.anchor.set(1, 0.5);
        value.x = o.width / 2;
        box.addChild(value);
      }

      const w = hasWide ? o.width + 40 : Math.max(260, label.width + 60);
      box.hitArea = new Rectangle(-w / 2, -rowH[i] / 2, w, rowH[i]);
      box.eventMode = 'static';
      box.cursor = 'pointer';
      box.on('pointerover', () => {
        if (!this.enabled || this.isDisabled(i)) return;
        if (this.index !== i) {
          this.index = i;
          this.game.audio.uiMove();
        }
      });
      box.on('pointertap', (e) => {
        if (!this.enabled || this.isDisabled(i)) return;
        this.index = i;
        if (item.kind === 'slider' && bar) {
          const local = bar.toLocal(e.global);
          if (local.x >= -10) {
            item.set(Math.min(1, Math.max(0, local.x / BAR_W)));
            this.game.audio.uiMove();
            this.refresh();
            return;
          }
        }
        this.activate();
      });

      this.root.addChild(box);
      this.rows.push({ item, box, label, value, bar, lit: 0 });
    });

    if (this.isDisabled(this.index)) this.move(1);
    const first = this.rows[this.index];
    if (first) this.marker.position.set(first.box.x - 150, first.box.y);
    this.refresh();
    this.off = game.input.on((a) => this.handle(a));
  }

  // row centers from y downward; pulled up (and squeezed if it has to be) so the last row stays on screen
  private layoutRows(y: number, rowH: number[]): number[] {
    const n = rowH.length;
    if (!n) return [];
    const steps: number[] = [];
    for (let i = 0; i < n - 1; i++) steps.push((rowH[i] + rowH[i + 1]) / 2);
    const span = steps.reduce((a, b) => a + b, 0);
    const minTop = 60 + rowH[0] / 2;
    const maxBottom = VIEW_H - 30 - rowH[n - 1] / 2;
    let start = y;
    if (start + span > maxBottom) start = Math.max(minTop, maxBottom - span);
    if (start + span > maxBottom && span > 0) {
      const squeeze = (maxBottom - start) / span;
      for (let i = 0; i < steps.length; i++) steps[i] *= squeeze;
    }
    const ys = [start];
    for (const s of steps) ys.push(ys[ys.length - 1] + s);
    return ys;
  }

  private isDisabled(i: number): boolean {
    const it = this.rows[i]?.item ?? null;
    return !!it && it.kind === 'button' && !!it.disabled;
  }

  private move(dir: number): void {
    const n = this.rows.length;
    for (let k = 0; k < n; k++) {
      this.index = (this.index + dir + n) % n;
      if (!this.isDisabled(this.index)) break;
    }
  }

  private handle(a: Action): void {
    if (!this.enabled || !this.root.visible) return;
    const row = this.rows[this.index];
    switch (a) {
      case 'up':
        this.move(-1);
        this.game.audio.uiMove();
        break;
      case 'down':
        this.move(1);
        this.game.audio.uiMove();
        break;
      case 'left':
      case 'right': {
        const d = a === 'left' ? -1 : 1;
        if (row.item.kind === 'slider') {
          const v = Math.round((row.item.get() + d * 0.1) * 10) / 10;
          row.item.set(Math.min(1, Math.max(0, v)));
          this.game.audio.uiMove();
        } else if (row.item.kind === 'toggle') {
          row.item.set(!row.item.get());
          this.game.audio.uiMove();
        }
        break;
      }
      case 'confirm':
        this.activate();
        break;
      case 'back':
        this.onBack?.();
        break;
    }
    this.refresh();
  }

  // for callers that confirm with something other than Enter (SPACE on cards)
  activateCurrent(): void {
    if (this.enabled) this.activate();
  }

  private activate(): void {
    const item = this.rows[this.index].item;
    if (item.kind === 'button') {
      if (item.disabled) return;
      this.game.audio.uiSelect();
      item.action();
    } else if (item.kind === 'toggle') {
      item.set(!item.get());
      this.game.audio.uiSelect();
    }
    this.refresh();
  }

  refresh(): void {
    const o = this.opts;
    for (const r of this.rows) {
      if (r.item.kind === 'toggle' && r.value) r.value.text = r.item.get() ? TEXT.settings.on : TEXT.settings.off;
      if (r.item.kind === 'slider' && r.bar) {
        const v = r.item.get();
        r.bar.clear();
        r.bar.roundRect(0, -3, BAR_W, 6, 3).fill({ color: o.color, alpha: 0.18 });
        r.bar.roundRect(0, -3, Math.max(6, BAR_W * v), 6, 3).fill({ color: o.accent, alpha: 0.9 });
        r.bar.circle(BAR_W * v, 0, 9).fill({ color: o.accent });
      }
    }
  }

  update(dt: number): void {
    this.rows.forEach((r, i) => {
      const want = i === this.index ? 1 : 0;
      r.lit += (want - r.lit) * Math.min(1, dt * 10);
      const disabled = this.isDisabled(i);
      r.box.alpha = disabled ? 0.25 : 0.5 + 0.5 * r.lit;
      r.label.scale.set(1 + 0.04 * r.lit);
    });
    const cur = this.rows[this.index];
    if (cur) {
      const lx = cur.label.anchor.x === 0 ? cur.box.x + cur.label.x - 22 : cur.box.x - cur.label.width / 2 - 26;
      this.marker.x += (lx - this.marker.x) * Math.min(1, dt * 14);
      this.marker.y += (cur.box.y - this.marker.y) * Math.min(1, dt * 14);
      this.marker.alpha = 0.6 + 0.3 * Math.sin(performance.now() / 400);
    }
  }

  destroy(): void {
    this.off();
    this.root.destroy({ children: true });
  }
}
