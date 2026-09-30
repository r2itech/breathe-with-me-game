import { Container, Sprite } from 'pixi.js';
import type { LevelRun } from '../breath/LevelRun';
import { VISUAL, type LevelConfig } from '../data/levels';
import { Background } from './Background';
import { Bloom } from './Bloom';
import { BreathCircle } from './BreathCircle';
import { Glitch } from './Glitch';
import { CalmRing } from './CalmRing';
import { PanicArc } from './PanicArc';
import { Spiral } from './Spiral';
import { Tether } from './Tether';
import { Weather } from './Weather';
import { glowTexture, lerpColor } from './textures';

const smooth = (v: number) => {
  const x = Math.min(1, Math.max(0, v));
  return x * x * (3 - 2 * x);
};

export class LevelVisuals {
  readonly root = new Container();
  protected bg: Background;
  protected weather: Weather;
  protected tether = new Tether();
  protected npcCircle = new BreathCircle();
  protected playerCircle = new BreathCircle();
  readonly calmRing: CalmRing;
  protected panicArc = new PanicArc();
  protected spiral = new Spiral();
  protected glitch = new Glitch();
  protected bloom: Bloom;
  protected merge: Sprite;
  protected mid = new Container();
  protected top = new Container();
  protected time = 0;
  protected drift = 0;
  protected lockTime = 0;
  protected lock = 0;
  shakeX = 0;
  shakeY = 0;
  npcX = VISUAL.npcX;
  playerX = VISUAL.playerX;
  readonly y = VISUAL.centerY;
  // scene fades the ring/tether in once play starts
  uiAlpha = 0;
  // tutorial / game over hooks
  npcAlpha = 1;
  npcScale = 1;
  ringAlpha = 1;

  constructor(
    protected cfg: LevelConfig,
    protected reduceMotion: () => boolean,
    protected lowQuality: () => boolean = () => false,
  ) {
    const p = cfg.palette;
    this.bg = new Background(p);
    this.weather = new Weather(cfg.weather, cfg.weatherDensity, p.weather, p.star);
    this.bloom = new Bloom(p.star, cfg.mode === 'follow' ? 1.4 : 1);
    this.merge = new Sprite(glowTexture());
    this.merge.anchor.set(0.5);
    this.merge.blendMode = 'add';
    this.merge.alpha = 0;
    this.merge.tint = p.tether;
    this.calmRing = new CalmRing(cfg.phases.length);

    this.mid.addChild(this.calmRing.root, this.panicArc.root, this.spiral.root, this.tether.root, this.npcCircle.root, this.playerCircle.root, this.merge);
    this.top.addChild(this.glitch.root, this.bloom.root);
    this.root.addChild(this.bg.root, this.weather.back, this.mid, this.weather.front, this.top);
  }

  get centerX(): number {
    return (this.npcX + this.playerX) / 2;
  }

  // radius for a 0..1 lung value
  radius(lung: number): number {
    return VISUAL.minRadius + (VISUAL.maxRadius - VISUAL.minRadius) * lung;
  }

  update(dt: number, run: LevelRun): void {
    this.time += dt;
    const t = this.time;
    const cfg = this.cfg;
    const p = cfg.palette;
    const c = run.connection;
    const calmMotion = this.reduceMotion();

    if (run.phase === 'bloom' || run.phase === 'done') this.bloom.start();
    const bloomAmt = this.bloom.amount;

    // slide together when connected, fully overlap once locked for a bit
    if (c >= VISUAL.lockAt) this.lockTime += dt;
    else this.lockTime = Math.max(0, this.lockTime - dt * 3);
    const locked = this.lockTime >= VISUAL.lockHold || bloomAmt > 0;
    this.lock += ((locked ? 1 : 0) - this.lock) * Math.min(1, dt * 1.2);
    const want = locked ? VISUAL.lockDrift : smooth((c - 0.6) / 0.4) * VISUAL.drift;
    this.drift += (want - this.drift) * Math.min(1, dt * 1.5);
    this.npcX = VISUAL.npcX + this.drift;
    this.playerX = VISUAL.playerX - this.drift;
    this.npcCircle.x = this.npcX;
    this.npcCircle.y = this.y;
    this.playerCircle.x = this.playerX;
    this.playerCircle.y = this.y;

    const npcR = this.radius(run.npc.lung) * this.npcScale;
    const playerR = this.radius(run.player.lung);
    const warmth = bloomAmt;
    const npcColor = lerpColor(p.npc, p.star, warmth * 0.6);
    const playerColor = lerpColor(p.player, p.star, warmth * 0.6);
    const fade = 1 - 0.45 * this.lock;

    this.npcCircle.update(t, {
      radius: npcR,
      color: npcColor,
      wobble: run.npcPanic,
      tremble: 0,
      glow: 0.3 + 0.7 * c,
      alpha: fade * this.npcAlpha,
    });
    this.playerCircle.update(t, {
      radius: playerR,
      color: playerColor,
      wobble: run.follow ? run.playerPanic * 0.8 : 0,
      tremble: run.follow ? run.playerPanic : 0,
      glow: 0.3 + 0.7 * c,
      alpha: fade,
    });

    // steady-rhythm echo around the player while anchoring
    if (run.phase === 'anchor' && !run.follow) {
      const tp = cfg.targetPeriod;
      const ph = (run.player.sinceInhale / tp) % 1;
      const f = cfg.inhaleFraction;
      const lung = ph < f ? (1 - Math.cos((Math.PI * ph) / f)) / 2 : (1 + Math.cos((Math.PI * (ph - f)) / (1 - f))) / 2;
      this.playerCircle.setEcho(this.radius(lung), 0.18 * this.uiAlpha, playerColor);
    } else {
      this.playerCircle.setEcho(0, 0, 0);
    }

    this.merge.position.set(this.centerX, this.y);
    this.merge.scale.set((this.radius((run.npc.lung + run.player.lung) / 2) * 4) / 256);
    this.merge.alpha = this.lock * (0.55 + 0.25 * c);

    const edgeGap = 6;
    const ax = this.npcX + npcR + edgeGap;
    const bx = this.playerX - playerR - edgeGap;
    this.tether.root.alpha = this.uiAlpha * (1 - this.lock) * this.npcAlpha;
    this.tether.update(t, ax, this.y, Math.max(ax, bx), this.y, c, p.tether, run.sync.matching);

    const ringR = VISUAL.maxRadius + VISUAL.ringGap;
    this.calmRing.update(dt, this.npcX, this.y, ringR, run.phaseIndex, run.progress, p.ring, this.uiAlpha * this.ringAlpha * this.npcAlpha * (1 - 0.6 * bloomAmt));
    this.panicArc.update(dt, this.npcX, this.y, ringR + VISUAL.panicGap, run.active ? run.panicMeter * this.ringAlpha : 0);

    const spiralAtPlayer = run.follow;
    this.spiral.update(
      dt,
      run.spiral,
      spiralAtPlayer ? this.playerX : this.npcX,
      this.y,
      spiralAtPlayer ? playerR : npcR,
      spiralAtPlayer ? p.player : p.npc,
      calmMotion,
    );

    const intensity = 1 - run.calm;
    const low = this.lowQuality();
    this.weather.setLowQuality(low);
    this.weather.update(dt, intensity, bloomAmt);
    this.bg.setWarmth(warmth);
    this.glitch.update(dt, intensity, this.npcX, this.y, npcR, cfg.glitch && !calmMotion && !low && bloomAmt === 0);
    this.bloom.update(dt, this.centerX, this.y);

    this.updateShake(dt, run, calmMotion);
  }

  protected updateShake(_dt: number, run: LevelRun, calmMotion: boolean): void {
    let amount = 0;
    if (!calmMotion) {
      if (run.follow) amount = VISUAL.maxShake * Math.max(run.panicBoost, 0.25 * run.playerPanic);
      else if (run.inSpike) amount = 1.5;
    }
    this.shakeX = amount > 0 ? (Math.random() * 2 - 1) * amount : 0;
    this.shakeY = amount > 0 ? (Math.random() * 2 - 1) * amount : 0;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
