import { Container, Text } from 'pixi.js';
import { FONT } from '../core/view';
import { TEXT_TIMING } from '../data/levels';
import { readTime, textAlpha, textLifetime } from './textTiming';

// plays short lines one after another, fading each in and out
export class Caption {
  readonly root = new Container();
  private text: Text;
  private lines: string[] = [];
  private index = -1;
  private t = 0;
  private hold = 2.8;
  private onDone: (() => void) | null = null;
  // fires as each line starts showing
  onLine: ((index: number) => void) | null = null;

  constructor(x: number, y: number, size = 30, color = 0xf2ecff) {
    this.text = new Text({
      text: '',
      style: { fontFamily: FONT, fontSize: size, fill: color, fontWeight: '600', align: 'center', wordWrap: true, wordWrapWidth: 1000 },
    });
    this.text.anchor.set(0.5);
    this.text.position.set(x, y);
    this.text.alpha = 0;
    this.root.addChild(this.text);
  }

  get busy(): boolean {
    return this.index >= 0;
  }

  // each line stays up for its reading time
  show(lines: string[], onDone?: () => void): void {
    this.lines = lines;
    this.onDone = onDone ?? null;
    this.index = lines.length ? 0 : -1;
    this.t = 0;
    if (this.index === 0) this.setLine(0);
    else onDone?.();
  }

  private setLine(i: number): void {
    this.text.text = this.lines[i];
    this.hold = readTime(this.lines[i], TEXT_TIMING.tutorialMin);
    this.onLine?.(i);
  }

  // jump to fading the current line out
  skip(): void {
    if (this.index < 0) return;
    const out = TEXT_TIMING.fadeIn + this.hold;
    if (this.t < out) this.t = out;
  }

  update(dt: number): void {
    if (this.index < 0) return;
    this.t += dt;
    this.text.alpha = textAlpha(this.t, this.hold);
    if (this.t >= textLifetime(this.hold)) {
      this.index++;
      this.t = 0;
      if (this.index >= this.lines.length) {
        this.index = -1;
        this.text.alpha = 0;
        const cb = this.onDone;
        this.onDone = null;
        cb?.();
      } else {
        this.setLine(this.index);
      }
    }
  }
}
