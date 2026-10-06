import { Application, Container, Graphics } from 'pixi.js';
import { AudioEngine } from '../audio/AudioEngine';
import { PERF } from '../data/levels';
import { TEXT } from '../data/text';
import { PerfOverlay } from '../ui/PerfOverlay';
import { Input } from './Input';
import { RotatePrompt, showToast, SoundIcon } from './overlays';
import { canFullscreen, isElectron, isIOS, isPortrait, isTouch, safeAreaInsets } from './platform';
import { perfOn } from './perfProbe';
import { SceneManager } from './SceneManager';
import { Save } from './Save';
import { Settings } from './Settings';
import { VIEW_W, VIEW_H } from './view';

const IOS_HINT_KEY = 'breathe-with-me.ios-hint';

// title/map drop to their idle frame rate after this long without input
const IDLE_AFTER = 30;

// Pixi truncates the frame delta to whole ms before comparing it to the cap,
// so a plain 60 on a 120 Hz screen lands on 40. aim a hair above instead.
function tickerCap(fps: number): number {
  return fps ? 1000 / (Math.floor(1000 / fps) - 1) : 0;
}

export class Game {
  readonly app: Application;
  readonly stage = new Container();
  readonly input: Input;
  readonly scenes: SceneManager;
  readonly save = new Save();
  readonly settings = new Settings();
  readonly audio: AudioEngine;
  private bars = new Graphics();
  // shake offset in logical pixels, scenes set it each frame
  shakeX = 0;
  shakeY = 0;
  // notch/home-bar insets, in logical (1280x720) units
  safe = { top: 0, right: 0, bottom: 0, left: 0 };
  // how much to blow up menus/HUD text so it stays readable and tappable on small screens
  uiScale = 1;
  // flips on for good once the frame rate can't keep up
  lowQuality = false;
  private scale = 1;
  private offX = 0;
  private offY = 0;
  private rotate: RotatePrompt | null = null;
  private soundIcon: SoundIcon;
  private soundIconTimer = 0;
  private fpsCap = 0;
  private idle = 0;
  private fpsTime = 0;
  private fpsFrames = 0;
  private slowFor = 0;
  private sinceStart = 0;
  private historyArmed = false;

  private constructor(app: Application) {
    this.app = app;
    // audio first: its unlock listeners have to run before anything else
    // (fullscreen) touches the same gesture
    this.audio = new AudioEngine(this.settings.data);
    this.soundIcon = new SoundIcon(TEXT.platform.enableSound, () => this.audio.retryUnlock());
    this.audio.onStateChange = () => this.syncSoundIcon();
    this.input = new Input(app.canvas);
    this.input.onGesture(() => (this.idle = 0));
    this.input.onFirstInput(() => this.maybeIOSHint());
    this.settings.onChange((s) => this.audio.applySettings(s));

    const sceneLayer = new Container();
    const overlayLayer = new Container();
    const fadeLayer = new Container();
    this.stage.addChild(sceneLayer, overlayLayer, fadeLayer);
    this.app.stage.addChild(this.stage, this.bars);
    this.scenes = new SceneManager(sceneLayer, overlayLayer, fadeLayer);

    if (isTouch) this.rotate = new RotatePrompt(TEXT.platform.rotate);
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => this.layout());
    document.addEventListener('fullscreenchange', () => {
      this.layout();
      // keep the setting honest when the browser leaves fullscreen on its own (Esc, swipe)
      if (!isElectron && canFullscreen) {
        const on = !!document.fullscreenElement;
        if (on !== this.settings.data.fullscreen) this.settings.set('fullscreen', on);
      }
    });
    document.addEventListener('visibilitychange', () => this.onVisibility());
    // iOS doesn't always fire visibilitychange when the page goes into the back/forward cache
    window.addEventListener('pagehide', () => this.audio.hold('hidden', true));
    window.addEventListener('pageshow', () => this.audio.hold('hidden', document.hidden));
    if (!isElectron) {
      this.scenes.onChange = () => this.armHistory();
      window.addEventListener('popstate', () => {
        this.historyArmed = false;
        this.scenes.back();
        this.armHistory();
      });
    }
    this.layout();

    // browsers refuse fullscreen without a gesture, so only restore it on desktop
    if (isElectron) this.applyFullscreen(this.settings.data.fullscreen);

    app.ticker.add((ticker) => {
      // clamp so it doesn't jump when the window loses focus
      const dt = Math.min(ticker.deltaMS / 1000, 0.1);
      this.trackFps(ticker.deltaMS / 1000);
      this.updateFpsCap(dt);
      this.soundIconTimer -= dt;
      if (this.soundIconTimer <= 0) {
        this.soundIconTimer = 0.25;
        this.syncSoundIcon();
      }
      this.input.update(dt);
      this.scenes.update(dt);
      this.stage.position.set(this.offX + this.shakeX * this.scale, this.offY + this.shakeY * this.scale);
    });
    if (perfOn) new PerfOverlay(this);
  }

  static async create(): Promise<Game> {
    const app = new Application();
    await app.init({
      background: 0x000000,
      resizeTo: window,
      antialias: true,
      autoDensity: true,
      // phones: 1.5x is plenty at arm's length, a 3x retina fill heats them up fast
      resolution: Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2),
      powerPreference: isTouch ? 'low-power' : 'high-performance',
    });
    document.body.appendChild(app.canvas);
    return new Game(app);
  }

  // current frame rate cap, 0 = none
  get fpsLimit(): number {
    return this.fpsCap;
  }

  // local logical coords from a DOM event, used by sliders
  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    return { x: (clientX - this.offX) / this.scale, y: (clientY - this.offY) / this.scale };
  }

  applyFullscreen(on: boolean): void {
    if (window.appBridge) {
      window.appBridge.setFullscreen(on);
      return;
    }
    try {
      if (on && !document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    } catch {
      // browsers refuse without a gesture, not a big deal
    }
  }

  quit(): void {
    if (window.appBridge) window.appBridge.quit();
  }

  // one spare history entry while we're past the title, so the back gesture goes to scene.back() instead of off the page
  private armHistory(): void {
    if (this.historyArmed || !this.scenes.deep) return;
    try {
      history.pushState({ breatheWithMe: true }, '');
      this.historyArmed = true;
    } catch {
      // sandboxed iframes can refuse this
    }
  }

  private maybeIOSHint(): void {
    // on Safari 16.4+ the playback audio session already beats the silent
    // switch, so the hint would just be wrong
    if (!isIOS || navigator.audioSession) return;
    try {
      if (localStorage.getItem(IOS_HINT_KEY)) return;
      localStorage.setItem(IOS_HINT_KEY, '1');
    } catch {
      // no storage, just show it
    }
    window.setTimeout(() => showToast(TEXT.platform.silentSwitch, 5), 600);
  }

  private onVisibility(): void {
    if (document.hidden) {
      this.scenes.autoPause();
      this.input.releaseAll();
      this.audio.hold('hidden', true);
    } else {
      this.audio.hold('hidden', false);
    }
    this.updateTicker();
  }

  // no frames at all while nothing of the game can be seen
  private updateTicker(): void {
    if (document.hidden || isPortrait()) this.app.ticker.stop();
    else this.app.ticker.start();
  }

  // levels run at 60, everything else at 30, title/map at 20 once left alone
  private updateFpsCap(dt: number): void {
    this.idle = this.input.held ? 0 : this.idle + dt;
    const cap = this.scenes.fpsCap(this.idle >= IDLE_AFTER);
    if (cap === this.fpsCap) return;
    this.fpsCap = cap;
    this.app.ticker.maxFPS = tickerCap(cap);
    // a capped scene isn't a slow device
    this.fpsTime = 0;
    this.fpsFrames = 0;
  }

  // "sound off" icon on the title and in levels while the context isn't
  // running (asleep on purpose doesn't count)
  private syncSoundIcon(): void {
    const slot = this.scenes?.soundIconSlot ?? null;
    const show = slot !== null && !this.audio.unlocked;
    this.soundIcon.visible = show;
    if (!show) return;
    const right = this.offX + (this.safe.right + 16 + slot) * this.scale;
    const top = this.offY + (this.safe.top + 16) * this.scale;
    this.soundIcon.place(top, right);
  }

  private trackFps(dt: number): void {
    // only levels run at 60, the rest are capped on purpose
    if (this.lowQuality || this.fpsCap < 60) return;
    this.sinceStart += dt;
    // loading hitches and tab switches don't count
    if (this.sinceStart < PERF.warmup || dt > 0.25) return;
    this.fpsTime += dt;
    this.fpsFrames++;
    if (this.fpsTime < PERF.sampleTime) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsTime = 0;
    this.fpsFrames = 0;
    this.slowFor = fps < PERF.minFps ? this.slowFor + PERF.sampleTime : 0;
    if (this.slowFor >= PERF.slowSeconds) {
      this.lowQuality = true;
      // phones also give up the extra resolution
      if (isTouch) this.app.renderer.resize(window.innerWidth, window.innerHeight, 1);
    }
  }

  private layout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.scale = Math.min(w / VIEW_W, h / VIEW_H);
    this.offX = Math.floor((w - VIEW_W * this.scale) / 2);
    this.offY = Math.floor((h - VIEW_H * this.scale) / 2);
    this.stage.scale.set(this.scale);
    this.stage.position.set(this.offX, this.offY);

    // letterbox bars already keep content away from part of the notch
    const ins = safeAreaInsets();
    this.safe = {
      top: Math.max(0, ins.top - this.offY) / this.scale,
      right: Math.max(0, ins.right - this.offX) / this.scale,
      bottom: Math.max(0, ins.bottom - this.offY) / this.scale,
      left: Math.max(0, ins.left - this.offX) / this.scale,
    };
    // a 56px menu row should end up at least ~44 css px tall
    this.uiScale = Math.min(PERF.maxUiScale, Math.max(1, PERF.minTapPx / (56 * this.scale)));

    const b = this.bars;
    b.clear();
    const cw = VIEW_W * this.scale;
    const ch = VIEW_H * this.scale;
    // oversized so shake never reveals scene content in the bars
    if (this.offX > 0) {
      b.rect(-10, -10, this.offX + 10, h + 20).fill(0x000000);
      b.rect(this.offX + cw, -10, w - this.offX - cw + 10, h + 20).fill(0x000000);
    }
    if (this.offY > 0) {
      b.rect(-10, -10, w + 20, this.offY + 10).fill(0x000000);
      b.rect(-10, this.offY + ch, w + 20, h - this.offY - ch + 10).fill(0x000000);
    }

    const portrait = isPortrait();
    if (this.rotate) this.rotate.visible = portrait;
    if (portrait) {
      this.scenes.autoPause();
      this.input.releaseAll();
    }
    this.updateTicker();
  }
}
