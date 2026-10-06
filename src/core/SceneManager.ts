import { Container, Graphics } from 'pixi.js';
import type { Scene } from './Scene';
import { VIEW_W, VIEW_H } from './view';

export class SceneManager {
  private current: Scene | null = null;
  private next: Scene | null = null;
  private overlays: Scene[] = [];
  private fade = new Graphics();
  private fadeAlpha = 1;
  private fadeDir = -1;
  private fadeSpeed = 1.5;

  constructor(
    private sceneLayer: Container,
    private overlayLayer: Container,
    fadeLayer: Container,
  ) {
    this.fade.rect(0, 0, VIEW_W, VIEW_H).fill(0x000000);
    this.fade.eventMode = 'none';
    fadeLayer.addChild(this.fade);
  }

  get active(): Scene | null {
    return this.current;
  }

  get transitioning(): boolean {
    return this.next !== null;
  }

  goto(scene: Scene, fadeTime = 0.6): void {
    if (this.next) {
      // a newer request wins, drop the pending one
      this.next.destroy();
    }
    this.next = scene;
    this.fadeDir = 1;
    this.fadeSpeed = 1 / Math.max(0.05, fadeTime);
    if (!this.current) this.fadeAlpha = 1;
  }

  push(overlay: Scene): void {
    const top = this.overlays[this.overlays.length - 1] ?? this.current;
    top?.pause();
    this.overlays.push(overlay);
    this.overlayLayer.addChild(overlay.root);
    overlay.enter();
    this.onChange?.();
  }

  pop(): void {
    const o = this.overlays.pop();
    if (!o) return;
    o.exit();
    this.overlayLayer.removeChild(o.root);
    o.destroy();
    const top = this.overlays[this.overlays.length - 1] ?? this.current;
    top?.resume();
    this.onChange?.();
  }

  // fired whenever the visible screen changes, the history guard listens
  onChange: (() => void) | null = null;

  get deep(): boolean {
    return this.overlays.length > 0 || !!this.current?.deep;
  }

  back(): void {
    if (this.next) return;
    const top = this.overlays[this.overlays.length - 1] ?? this.current;
    top?.back();
  }

  fpsCap(idle: boolean): number {
    const top = this.overlays[this.overlays.length - 1] ?? this.current;
    if (!top) return 30;
    return idle && top.idleFps ? top.idleFps : top.maxFps;
  }

  get soundIconSlot(): number | null {
    if (this.next) return null;
    const top = this.overlays[this.overlays.length - 1] ?? this.current;
    return top ? top.soundIconSlot : null;
  }

  autoPause(): void {
    if (this.overlays.length || this.next) return;
    this.current?.autoPause();
  }

  clearOverlays(): void {
    while (this.overlays.length) {
      const o = this.overlays.pop()!;
      o.exit();
      this.overlayLayer.removeChild(o.root);
      o.destroy();
    }
  }

  update(dt: number): void {
    if (this.next) {
      this.fadeAlpha += dt * this.fadeSpeed;
      if (this.fadeAlpha >= 1 || !this.current) {
        this.fadeAlpha = 1;
        this.swap();
      }
    } else if (this.fadeDir < 0 && this.fadeAlpha > 0) {
      this.fadeAlpha = Math.max(0, this.fadeAlpha - dt * this.fadeSpeed);
    }
    this.fade.alpha = this.fadeAlpha;
    this.fade.visible = this.fadeAlpha > 0.001;

    const top = this.overlays[this.overlays.length - 1];
    if (top) top.update(dt);
    else this.current?.update(dt);
  }

  private swap(): void {
    this.clearOverlays();
    if (this.current) {
      this.current.exit();
      this.sceneLayer.removeChild(this.current.root);
      this.current.destroy();
    }
    this.current = this.next;
    this.next = null;
    this.fadeDir = -1;
    if (this.current) {
      this.sceneLayer.addChild(this.current.root);
      this.current.enter();
    }
    this.onChange?.();
  }
}
