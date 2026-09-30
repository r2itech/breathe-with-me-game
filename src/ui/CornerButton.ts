import { Circle, Container, Graphics, Rectangle, Text } from 'pixi.js';
import { isTouch } from '../core/platform';
import { FONT } from '../core/view';

// base height in logical px; callers scale by game.uiScale so it stays >= ~44 css px on phones
const H = 52;
const IDLE = 0.55;

export type IconKind = 'github' | 'help' | 'back';

export interface CornerButtonOptions {
  icon: IconKind;
  label?: string;
  // desktop-only hover hint for icon-only buttons
  tooltip?: string;
  onTap: () => void;
}

// GitHub mark (octicon), arc flags spaced out so the path parser reads them right
const GITHUB_PATH =
  'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z';

function drawIcon(kind: IconKind): Graphics {
  const g = new Graphics();
  if (kind === 'github') {
    g.svg(`<svg viewBox="0 0 16 16"><path fill="#f2ecff" d="${GITHUB_PATH}"/></svg>`);
    // 16px mark -> ~24px, centered
    g.scale.set(1.5);
    g.position.set(-12, -12);
  } else if (kind === 'help') {
    // small chat bubble with a heart inside
    g.roundRect(-12, -10, 24, 17, 6).stroke({ width: 2.5, color: 0xf2ecff });
    g.poly([-6, 6, -1, 6, -7, 12]).fill({ color: 0xf2ecff });
    g.circle(-2.4, -2.8, 2.6).fill({ color: 0xffb3c0 });
    g.circle(2.4, -2.8, 2.6).fill({ color: 0xffb3c0 });
    g.poly([-5, -1.8, 5, -1.8, 0, 3.6]).fill({ color: 0xffb3c0 });
  } else {
    g.moveTo(6, -8).lineTo(-3, 0).lineTo(6, 8).stroke({ width: 3, color: 0xf2ecff, cap: 'round', join: 'round' });
  }
  return g;
}

// subtle round/pill button for the screen corners: dim until hovered or pressed
export class CornerButton {
  readonly root = new Container();
  readonly width: number;
  private bg = new Graphics();
  private tip: Text | null = null;
  private lit = 0;
  private hover = false;

  constructor(opts: CornerButtonOptions) {
    const icon = drawIcon(opts.icon);
    let w = H;
    let label: Text | null = null;
    if (opts.label) {
      label = new Text({ text: opts.label, style: { fontFamily: FONT, fontSize: 18, fill: 0xf2ecff, fontWeight: '600' } });
      label.anchor.set(0, 0.5);
      label.x = H - 8;
      w = H - 8 + label.width + 22;
      // icon sits in the left circle of the pill
      icon.x += H / 2;
    } else {
      icon.x += H / 2;
    }
    icon.y += H / 2;
    if (label) label.y = H / 2;
    this.width = w;

    this.bg.roundRect(0, 0, w, H, H / 2).fill({ color: 0x0b0918, alpha: 0.6 });
    this.bg.roundRect(0, 0, w, H, H / 2).stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 });
    this.root.addChild(this.bg, icon);
    if (label) this.root.addChild(label);

    if (opts.tooltip && !isTouch) {
      const tip = new Text({ text: opts.tooltip, style: { fontFamily: FONT, fontSize: 15, fill: 0xf2ecff, fontWeight: '600' } });
      tip.anchor.set(0, 0);
      tip.position.set(4, H + 8);
      tip.alpha = 0;
      this.tip = tip;
      this.root.addChild(tip);
    }

    const r = this.root;
    r.eventMode = 'static';
    r.cursor = 'pointer';
    r.hitArea = opts.label ? new Rectangle(0, 0, w, H) : new Circle(H / 2, H / 2, H / 2 + 4);
    r.alpha = IDLE;
    r.on('pointerover', () => (this.hover = true));
    r.on('pointerout', () => (this.hover = false));
    r.on('pointerdown', () => (this.lit = 1));
    r.on('pointertap', () => opts.onTap());
  }

  update(dt: number): void {
    const want = this.hover ? 1 : 0;
    this.lit += (want - this.lit) * Math.min(1, dt * 10);
    this.root.alpha = IDLE + (1 - IDLE) * this.lit;
    if (this.tip) this.tip.alpha = this.lit;
  }
}

export const CORNER_BUTTON_HEIGHT = H;
