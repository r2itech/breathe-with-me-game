import { Container } from 'pixi.js';

export abstract class Scene {
  readonly root = new Container();

  enter(): void {}
  exit(): void {}
  // called when an overlay covers / uncovers this scene
  pause(): void {}
  resume(): void {}
  // tab hidden / phone rotated to portrait: levels open their pause menu
  autoPause(): void {}
  // browser/Android back gesture lands here
  back(): void {}
  // deeper than the title: back shouldn't leave the page from here
  get deep(): boolean {
    return true;
  }
  // frame rate cap while this is on top
  get maxFps(): number {
    return 30;
  }
  // cap once nobody has touched anything for a while, 0 = stays at maxFps
  get idleFps(): number {
    return 0;
  }
  // logical px kept free at the top-right before the "sound off" icon, null = no icon here
  get soundIconSlot(): number | null {
    return null;
  }
  abstract update(dt: number): void;

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
