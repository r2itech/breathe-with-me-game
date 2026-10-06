import type { Container, Ticker } from 'pixi.js';
import type { Game } from '../core/Game';
import { audioContexts } from '../core/perfProbe';

const REFRESH_MS = 500;

function countObjects(c: Container): number {
  let n = 1;
  for (const child of c.children) n += countObjects(child);
  return n;
}

// plain DOM readout so it doesn't add to the counts it shows
export class PerfOverlay {
  private el = document.createElement('div');
  private frames = 0;
  private time = 0;
  private worst = 0;
  private work = 0;
  private workStart = 0;

  constructor(private game: Game) {
    this.el.style.cssText =
      'position:fixed;top:calc(4px + env(safe-area-inset-top));left:calc(4px + env(safe-area-inset-left));z-index:30;' +
      'background:rgba(0,0,0,.65);color:#9ef7c8;font:11px/1.45 monospace;padding:4px 7px;border-radius:5px;' +
      'pointer-events:none;white-space:pre';
    document.body.appendChild(this.el);
    // first and last thing each frame, so "work" covers update + render
    const t = game.app.ticker;
    t.add(() => (this.workStart = performance.now()), undefined, 1000);
    t.add((ticker) => this.tick(ticker), undefined, -1000);
  }

  private tick(t: Ticker): void {
    this.frames++;
    this.time += t.deltaMS;
    this.worst = Math.max(this.worst, t.deltaMS);
    this.work += performance.now() - this.workStart;
    if (this.time < REFRESH_MS) return;

    const g = this.game;
    const r = g.app.renderer;
    const fps = (this.frames * 1000) / this.time;
    const textures = (r.texture as { managedTextures?: readonly unknown[] }).managedTextures?.length ?? '?';
    const audio = g.audio.stats();
    this.el.textContent = [
      `fps ${fps.toFixed(1)} / cap ${g.fpsLimit || 'none'}  frame ${(this.time / this.frames).toFixed(1)}ms (max ${this.worst.toFixed(1)})  work ${(this.work / this.frames).toFixed(1)}ms`,
      `objects ${countObjects(g.app.stage)}  textures ${textures}  ticker ${t.count - 2} (+2 perf)  res ${r.resolution}${g.lowQuality ? ' low' : ''}`,
      `audio ctx ${audioContexts.live} live / ${audioContexts.created} made  ${audio.state}  voices ${audio.voices}  session ${navigator.audioSession?.type ?? 'n/a'}`,
    ].join('\n');

    this.frames = 0;
    this.time = 0;
    this.worst = 0;
    this.work = 0;
  }
}
