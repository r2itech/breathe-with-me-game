export type Action = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'debug' | 'any';

type Listener = (action: Action) => void;

const PAD_A = 0;
const PAD_B = 1;
const PAD_START = 9;
const PAD_UP = 12;
const PAD_DOWN = 13;
const PAD_LEFT = 14;
const PAD_RIGHT = 15;

const KEY_ACTIONS: Record<string, Action> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Escape: 'back',
  F3: 'debug',
};

export class Input {
  private keyHeld = false;
  private mouseHeld = false;
  // every finger currently down, any of them counts as holding
  private touches = new Set<number>();
  private padHeld = false;
  private listeners = new Set<Listener>();
  private firstInput: (() => void)[] = [];
  private gestures = new Set<() => void>();
  private padPrev: boolean[] = [];
  private stickDir = 0;
  private stickRepeat = 0;

  constructor(target: HTMLElement) {
    // Unlocking audio has to happen on a real gesture, and it must not depend on
    // the gesture reaching the canvas: the rotate prompt covers the whole screen
    // on a phone held in portrait, which is where every phone starts. Listening
    // on window in the capture phase sees the tap whatever it lands on.
    //
    // Which event types actually count as "a gesture" for audio unlock is not
    // the same across engines (iOS Safari wants touchend, Chromium's autoplay
    // policy document lists its own set) and isn't worth trusting to one guess,
    // so every event every mobile audio library uses for this is listened for.
    for (const type of ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'click', 'keydown'] as const) {
      window.addEventListener(type, () => this.fireGesture(), { capture: true, passive: true });
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) this.keyHeld = true;
      }
      if (e.code === 'F3' || e.code === 'Tab') e.preventDefault();
      if (e.repeat && e.code !== 'ArrowUp' && e.code !== 'ArrowDown' && e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
      const action = KEY_ACTIONS[e.code];
      if (action) this.emit(action);
      if (!e.repeat) this.emit('any');
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.keyHeld = false;
    });

    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        if (e.button === 0) this.mouseHeld = true;
      } else {
        this.touches.add(e.pointerId);
      }
      this.emit('any');
    });
    // release anywhere, the pointer can leave the canvas mid-breath
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') {
        if (e.button === 0) this.mouseHeld = false;
      } else {
        this.touches.delete(e.pointerId);
      }
    });
    window.addEventListener('pointercancel', (e) => {
      if (e.pointerType === 'mouse') this.mouseHeld = false;
      else this.touches.delete(e.pointerId);
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('blur', () => this.releaseAll());
    // iOS pinch/double-tap zoom still fires these even with touch-action: none
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  get held(): boolean {
    return this.keyHeld || this.mouseHeld || this.padHeld || this.touches.size > 0;
  }

  releaseAll(): void {
    this.keyHeld = false;
    this.mouseHeld = false;
    this.touches.clear();
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onFirstInput(fn: () => void): void {
    this.firstInput.push(fn);
  }

  // fires on every gesture, not just the first: unlocking audio can fail
  // silently on mobile and only the next tap gets to try again
  onGesture(fn: () => void): void {
    this.gestures.add(fn);
  }

  update(dt: number): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        break;
      }
    }
    if (!pad) {
      this.padHeld = false;
      return;
    }

    const pressed = pad.buttons.map((b) => b.pressed);
    const edge = (i: number) => !!pressed[i] && !this.padPrev[i];

    this.padHeld = !!pressed[PAD_A];
    if (pressed.some((p, i) => p && !this.padPrev[i])) {
      this.fireGesture();
      this.emit('any');
    }
    if (edge(PAD_A)) this.emit('confirm');
    if (edge(PAD_B) || edge(PAD_START)) this.emit('back');
    if (edge(PAD_UP)) this.emit('up');
    if (edge(PAD_DOWN)) this.emit('down');
    if (edge(PAD_LEFT)) this.emit('left');
    if (edge(PAD_RIGHT)) this.emit('right');
    this.padPrev = pressed;

    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    let dir = 0;
    if (ay < -0.55) dir = 1;
    else if (ay > 0.55) dir = 2;
    else if (ax < -0.55) dir = 3;
    else if (ax > 0.55) dir = 4;
    if (dir !== this.stickDir) {
      this.stickDir = dir;
      this.stickRepeat = 0.4;
      this.emitStick(dir);
    } else if (dir !== 0) {
      this.stickRepeat -= dt;
      if (this.stickRepeat <= 0) {
        this.stickRepeat = 0.15;
        this.emitStick(dir);
      }
    }
  }

  private emitStick(dir: number): void {
    if (dir === 1) this.emit('up');
    else if (dir === 2) this.emit('down');
    else if (dir === 3) this.emit('left');
    else if (dir === 4) this.emit('right');
  }

  private emit(action: Action): void {
    // copy so listeners can unsubscribe while handling
    for (const fn of [...this.listeners]) fn(action);
  }

  private fireGesture(): void {
    this.fireFirstInput();
    for (const fn of [...this.gestures]) fn();
  }

  private fireFirstInput(): void {
    if (this.firstInput.length === 0) return;
    const fns = this.firstInput;
    this.firstInput = [];
    for (const fn of fns) fn();
  }
}
