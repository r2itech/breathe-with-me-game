import { Container, Sprite, Texture } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../core/view';
import { PERF, type WeatherKind } from '../data/levels';
import { cardTexture, fogTexture, paperTexture, snowTexture, starTexture } from './textures';

type Kind = Exclude<WeatherKind, 'storm'>;

interface Particle {
  kind: Kind;
  shape: Sprite;
  star: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  seed: number;
  // orbit params for paper
  orbitR: number;
  orbitA: number;
  // dropped when running in low quality
  spare: boolean;
}

const BASE_COUNT: Record<Kind, number> = { paper: 38, fog: 12, cards: 20, snow: 120 };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Weather {
  readonly back = new Container();
  readonly front = new Container();
  private parts: Particle[] = [];
  private starTex = starTexture();
  private time = 0;

  constructor(kind: WeatherKind, density: number, private color: number, private starColor: number) {
    const kinds: Kind[] = kind === 'storm' ? ['fog', 'paper', 'cards', 'snow'] : [kind];
    const share = kind === 'storm' ? 0.55 : 1;
    for (const k of kinds) {
      const n = Math.round(BASE_COUNT[k] * density * share);
      for (let i = 0; i < n; i++) this.spawn(k, true);
    }
  }

  private texFor(k: Kind): Texture {
    if (k === 'paper') return paperTexture();
    if (k === 'fog') return fogTexture();
    if (k === 'cards') return cardTexture();
    return snowTexture();
  }

  private spawn(kind: Kind, initial: boolean): void {
    const shape = new Sprite(this.texFor(kind));
    shape.anchor.set(0.5);
    const star = new Sprite(this.starTex);
    star.anchor.set(0.5);
    star.blendMode = 'add';
    star.tint = this.starColor;
    star.alpha = 0;
    const p: Particle = {
      kind,
      shape,
      star,
      x: rand(0, VIEW_W),
      y: rand(0, VIEW_H),
      vx: 0,
      vy: 0,
      rot: rand(0, Math.PI * 2),
      vr: rand(-1, 1),
      size: 1,
      seed: Math.random() * 1000,
      orbitR: rand(200, 720),
      orbitA: rand(0, Math.PI * 2),
      spare: Math.random() > PERF.lowParticles,
    };
    switch (kind) {
      case 'paper':
        p.size = rand(0.5, 1.05);
        shape.tint = this.color;
        break;
      case 'fog':
        p.size = rand(2.6, 5.2);
        p.vx = rand(-12, 12);
        shape.tint = this.color;
        shape.blendMode = 'add';
        break;
      case 'cards':
        p.size = rand(0.45, 0.85);
        p.vx = -rand(60, 160);
        p.y = rand(40, VIEW_H - 40);
        if (!initial) p.x = VIEW_W + 120;
        shape.tint = 0xffffff;
        break;
      case 'snow':
        p.size = rand(0.25, 0.8);
        p.vy = rand(18, 50);
        p.vx = rand(-8, 8);
        shape.tint = this.color;
        shape.blendMode = 'add';
        break;
    }
    shape.scale.set(p.size);
    star.scale.set(rand(0.25, 0.6));
    // fog + big stuff sits behind the circles, small stuff in front
    const layer = kind === 'fog' ? this.back : kind === 'snow' ? this.front : this.back;
    layer.addChild(shape, star);
    this.parts.push(p);
  }

  // intensity 0..1 (1 = stormy), bloom 0..1 turns everything into rising stars
  private low = false;

  setLowQuality(on: boolean): void {
    if (on === this.low) return;
    this.low = on;
    for (const p of this.parts) {
      if (!p.spare) continue;
      p.shape.renderable = !on;
      p.star.renderable = !on;
    }
  }

  update(dt: number, intensity: number, bloom: number): void {
    this.time += dt;
    const t = this.time;
    const I = Math.max(0, Math.min(1, intensity));
    const B = Math.max(0, Math.min(1, bloom));
    const speed = 0.25 + 0.95 * I;

    for (const p of this.parts) {
      if (this.low && p.spare) continue;
      let tx = p.x;
      let ty = p.y;
      switch (p.kind) {
        case 'paper': {
          // swirl around the middle, tighter and faster when stressed
          p.orbitA += dt * speed * (0.25 + 60 / p.orbitR);
          const r = p.orbitR * (0.85 + 0.15 * Math.sin(t * 0.7 + p.seed));
          tx = VIEW_W / 2 + Math.cos(p.orbitA) * r;
          ty = VIEW_H / 2 + Math.sin(p.orbitA) * r * 0.55 + Math.sin(t * 2 + p.seed) * 20;
          p.rot += dt * p.vr * speed * 2.5;
          break;
        }
        case 'fog':
          tx = p.x + p.vx * dt * (0.5 + I);
          ty = p.y + Math.sin(t * 0.2 + p.seed) * dt * 8;
          break;
        case 'cards':
          tx = p.x + p.vx * dt * speed;
          ty = p.y + Math.sin(t * 3 + p.seed) * dt * 30 * I;
          p.rot = Math.sin(t * 2 + p.seed) * 0.08 * I;
          break;
        case 'snow':
          tx = p.x + (p.vx + Math.sin(t * 0.8 + p.seed) * 14) * dt;
          ty = p.y + p.vy * dt * (0.5 + 0.7 * I);
          break;
      }

      if (B > 0) {
        // everything eases into a slow upward drift
        const upX = p.x + Math.sin(t * 0.5 + p.seed) * 6 * dt;
        const upY = p.y - (18 + (p.seed % 30)) * dt;
        tx = tx + (upX - tx) * B;
        ty = ty + (upY - ty) * B;
      }
      p.x = tx;
      p.y = ty;

      // wrap around the edges
      const m = p.kind === 'fog' ? 300 : 80;
      if (p.kind !== 'paper' || B > 0.5) {
        if (p.x < -m) p.x += VIEW_W + m * 2;
        if (p.x > VIEW_W + m) p.x -= VIEW_W + m * 2;
        if (p.y < -m) p.y += VIEW_H + m * 2;
        if (p.y > VIEW_H + m) p.y -= VIEW_H + m * 2;
      }

      let alpha = 0;
      switch (p.kind) {
        case 'paper':
          alpha = 0.15 + 0.6 * I;
          break;
        case 'fog':
          alpha = 0.08 + 0.3 * I;
          break;
        case 'cards':
          alpha = 0.1 + 0.75 * I;
          break;
        case 'snow':
          alpha = 0.35 + 0.5 * I;
          break;
      }
      p.shape.position.set(p.x, p.y);
      p.shape.rotation = p.rot;
      p.shape.alpha = alpha * (1 - B);
      p.shape.visible = p.shape.alpha > 0.01;
      p.star.position.set(p.x, p.y);
      p.star.alpha = B * (0.5 + 0.5 * Math.sin(t * 2.3 + p.seed));
      p.star.visible = p.star.alpha > 0.01;
    }
  }

  destroy(): void {
    this.back.destroy({ children: true });
    this.front.destroy({ children: true });
  }
}
