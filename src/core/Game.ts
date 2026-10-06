import { Application, Container, Graphics } from 'pixi.js';
import { AudioEngine } from '../audio/AudioEngine';
import { PERF } from '../data/levels';
import { TEXT } from '../data/text';
import { Input } from './Input';
import { RotatePrompt, showToast, SoundButton } from './overlays';
import { canFullscreen, isElectron, isIOS, isPortrait, isTouch, safeAreaInsets } from './platform';
import { SceneManager } from './SceneManager';
import { Save } from './Save';
import { Settings } from './Settings';
import { VIEW_W, VIEW_H } from './view';

const IOS_HINT_KEY = 'breathe-with-me.ios-hint';

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
  private soundButton: SoundButton | null = null;
  // seconds left before it shows, -1 once it's not needed anymore this session
  private soundButtonTimer = -1;
  private fpsTime = 0;
  private fpsFrames = 0;
  private slowFor = 0;
  private sinceStart = 0;
  private historyArmed = false;

  private constructor(app: Application) {
    this.app = app;
    this.input = new Input(app.canvas);
    this.audio = new AudioEngine(this.settings.data);
    // audio context can only start from a real input event, and on mobile the
    // first try often isn't enough, so every gesture gets to have another go
    this.input.onGesture(() => void this.audio.init());
    this.input.onFirstInput(() => {
      this.maybeIOSHint();
      // give the automatic unlock a couple of seconds before offering the button
      if (this.soundButton) this.soundButtonTimer = 1.2;
    });
    this.settings.onChange((s) => this.audio.applySettings(s));

    const sceneLayer = new Container();
    const overlayLayer = new Container();
    const fadeLayer = new Container();
    this.stage.addChild(sceneLayer, overlayLayer, fadeLayer);
    this.app.stage.addChild(this.stage, this.bars);
    this.scenes = new SceneManager(sceneLayer, overlayLayer, fadeLayer);

    if (isTouch) {
      this.rotate = new RotatePrompt(TEXT.platform.rotate);
      // last-resort unlock: a tap on this real <button> is the one gesture every
      // mobile engine accepts, for when the passive listeners in Input.ts don't
      this.soundButton = new SoundButton(TEXT.platform.enableSound, () => {
        this.soundButton!.visible = false;
        this.soundButtonTimer = 1.5;
        void this.audio.init();
      });
    }
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
      this.updateSoundButton(dt);
      this.input.update(dt);
      this.scenes.update(dt);
      this.stage.position.set(this.offX + this.shakeX * this.scale, this.offY + this.shakeY * this.scale);
    });
  }

  static async create(): Promise<Game> {
    const app = new Application();
    await app.init({
      background: 0x000000,
      resizeTo: window,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      powerPreference: 'high-performance',
    });
    document.body.appendChild(app.canvas);
    return new Game(app);
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
      this.app.ticker.stop();
      this.audio.hold('hidden', true);
    } else {
      this.app.ticker.start();
      this.audio.hold('hidden', false);
    }
  }

  // shows the explicit sound button once the passive unlock has had a couple
  // of seconds to work and clearly hasn't; hides it again the moment audio
  // is actually running, from the passive path or the button itself
  private updateSoundButton(dt: number): void {
    if (!this.soundButton) return;
    if (this.audio.unlocked) {
      if (this.soundButtonTimer !== -1) {
        this.soundButtonTimer = -1;
        this.soundButton.visible = false;
      }
      return;
    }
    if (this.soundButtonTimer < 0) return;
    this.soundButtonTimer -= dt;
    if (this.soundButtonTimer <= 0) this.soundButton.visible = true;
  }

  private trackFps(dt: number): void {
    if (this.lowQuality) return;
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
    if (this.slowFor >= PERF.slowSeconds) this.lowQuality = true;
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
  }
}
