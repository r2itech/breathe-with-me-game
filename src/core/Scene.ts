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
  abstract update(dt: number): void;

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
