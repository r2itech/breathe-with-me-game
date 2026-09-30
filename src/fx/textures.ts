import { Texture } from 'pixi.js';

const cache = new Map<string, Texture>();

export function hex(c: number, a = 1): string {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return `rgba(${r},${g},${b},${a})`;
}

export function lerpColor(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * k);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

function make(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const tex = Texture.from(canvas);
  cache.set(key, tex);
  return tex;
}

// white radial falloff, tinted + additive at runtime; everything soft uses this
export function glowTexture(): Texture {
  return make('glow', 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.72)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}

// flatter falloff for fog and big washes
export function fogTexture(): Texture {
  return make('fog', 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}

export function dotTexture(): Texture {
  return make('dot', 32, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  });
}

export function starTexture(): Texture {
  return make('star', 48, 48, (ctx) => {
    const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 12);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 48, 48);
    // tiny cross sparkle
    const lg = ctx.createLinearGradient(0, 24, 48, 24);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 23, 48, 2);
    const vg = ctx.createLinearGradient(24, 0, 24, 48);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    vg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = vg;
    ctx.fillRect(23, 0, 2, 48);
  });
}

export function paperTexture(): Texture {
  return make('paper', 48, 62, (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(2, 2, 44, 58);
    ctx.fillStyle = 'rgba(120,130,170,0.55)';
    for (let i = 0; i < 7; i++) {
      const w = i === 0 ? 22 : 28 + ((i * 7) % 10);
      ctx.fillRect(8, 10 + i * 6.5, w, 2);
    }
  });
}

export function cardTexture(): Texture {
  return make('card', 200, 60, (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    roundRect(ctx, 2, 2, 196, 56, 12);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,90,110,0.95)';
    ctx.beginPath();
    ctx.arc(26, 30, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(70,74,100,0.8)';
    ctx.fillRect(46, 18, 96, 6);
    ctx.fillStyle = 'rgba(70,74,100,0.45)';
    ctx.fillRect(46, 32, 132, 5);
    ctx.fillRect(46, 42, 80, 5);
  });
}

export function snowTexture(): Texture {
  return make('snow', 24, 24, (ctx) => {
    const g = ctx.createRadialGradient(12, 12, 0, 12, 12, 12);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 24, 24);
  });
}

export function gradientTexture(top: number, bottom: number): Texture {
  return make(`grad-${top}-${bottom}`, 4, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, hex(top));
    g.addColorStop(1, hex(bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
