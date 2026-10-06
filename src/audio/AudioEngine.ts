import * as Tone from 'tone';
import { isAndroid, isIOS, isTouch } from '../core/platform';
import type { SettingsData } from '../core/Settings';
import { AUDIO, AUDIO_AUTOMATION, AUDIO_TIERS, MENU_MUSIC, type AudioTier, type InstrumentKind, type MusicConfig } from '../data/levels';
import { BreathVoice } from './BreathVoice';
import { LevelSong, type LayerLevels } from './LevelSong';
import { mtof } from './instruments';

type MenuKind = keyof typeof MENU_MUSIC;

// Tone makes a default context on import, swap it before anything builds on it.
// iOS keeps Tone's own (wrapped) context, which is known to work there. Everywhere
// else Tone gets a plain AudioContext, so unlocking talks to the real thing and
// not to standardized-audio-context's view of it. Never a sampleRate. The latency
// hint can't change later, so it's picked from the tier we start on.
function setupContext(tier: AudioTier): void {
  if (isIOS) {
    Tone.setContext(new Tone.Context({ latencyHint: 'playback' }), true);
  } else if (typeof AudioContext === 'function') {
    let ctx: AudioContext;
    try {
      // low tier: bigger buffers, so a busy main thread doesn't underrun it
      ctx = tier === 'low' ? new AudioContext({ latencyHint: 'playback' }) : new AudioContext();
    } catch {
      ctx = new AudioContext();
    }
    Tone.setContext(ctx, true);
  }
}

// events that count as user activation for audio (touchstart/pointerdown don't on Android)
const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'] as const;

// still not running this long after a tap = keep listening, the next tap retries
const UNLOCK_CHECK_MS = 500;

// things that put the whole context to sleep
type Hold = 'hidden' | 'muted' | 'paused';

// paused this long and the context gets suspended
const PAUSE_SUSPEND_MS = 4000;

// 0.5 s of 8-bit silence, for the old-iOS silent switch trick
function silentWavUrl(): string {
  const n = 4000;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o: number, t: string) => {
    for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

interface SongRequest {
  music: MusicConfig;
  companions: InstrumentKind[];
  period: number;
  menu?: MenuKind;
}

export class AudioEngine {
  ready = false;
  private master!: Tone.Gain;
  private musicBus!: Tone.Gain;
  private sfxBus!: Tone.Gain;
  private reverb!: Tone.Reverb;
  private playerBreath!: BreathVoice;
  private npcBreath!: BreathVoice;
  private heart!: Tone.MembraneSynth;
  private blip!: Tone.PolySynth;
  private thud!: Tone.MembraneSynth;
  private stab!: Tone.FMSynth | Tone.Synth;
  private song: LevelSong | null = null;
  private pending: SongRequest | null = null;
  private currentMenu: MenuKind | null = null;
  private heartTimer = 0;
  private settings: SettingsData;
  private paused = false;
  private holds = new Set<Hold>();
  private pauseTimer = 0;
  private silentEl: HTMLAudioElement | null = null;
  private listening = false;
  private automationAcc = 0;
  private currentReq: SongRequest | null = null;
  tier: AudioTier;
  // auto quality saw the device struggle, stays low for the session
  private autoLow = false;
  onTierChange: ((tier: AudioTier) => void) | null = null;
  private unlockAttempts = 0;
  private lastError = '';
  // fired whenever running/unlocked may have changed
  onStateChange: (() => void) | null = null;

  constructor(settings: SettingsData) {
    this.settings = settings;
    this.tier = this.resolveTier();
    setupContext(this.tier);
    this.applyLookAhead();
    this.hold('muted', AudioEngine.isMuted(settings));
    Tone.getContext().on('statechange', () => this.checkState());
    this.listen(true);
  }

  private static isMuted(s: SettingsData): boolean {
    return s.master <= 0 || (s.music <= 0 && s.sfx <= 0);
  }

  get context(): AudioContext {
    return Tone.getContext().rawContext as AudioContext;
  }

  get running(): boolean {
    return this.context.state === 'running';
  }

  // unlocked and either playing or asleep on purpose
  get unlocked(): boolean {
    return this.ready && (this.running || this.holds.size > 0);
  }

  private listen(on: boolean): void {
    if (on === this.listening) return;
    this.listening = on;
    for (const type of UNLOCK_EVENTS) {
      if (on) window.addEventListener(type, this.unlockAudio, { capture: true });
      else window.removeEventListener(type, this.unlockAudio, { capture: true });
    }
  }

  // runs inside the gesture. resume() goes first and synchronously, before
  // anything else gets a chance to use up the activation
  private unlockAudio = (): void => {
    // asleep on purpose (muted, paused): a tap shouldn't wake it
    if (this.ready && this.holds.size) return;
    this.unlockAttempts++;
    const ctx = this.context;
    try {
      ctx.resume().then(
        () => this.checkState(),
        (err: unknown) => this.noteError(err),
      );
    } catch (err) {
      this.noteError(err);
    }
    // classic unlock: one silent sample through the context, same gesture
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start(0);
    } catch (err) {
      this.noteError(err);
    }
    if (isIOS) this.claimPlaybackSession();
    window.setTimeout(() => this.checkState(), UNLOCK_CHECK_MS);
  };

  // tap-to-retry from the speaker icon
  retryUnlock(): void {
    this.unlockAudio();
  }

  // Settings > Test sound: a raw oscillator straight to the speakers, no Tone
  // graph and no game volume, so silence here means the device/browser
  testBeep(): void {
    const ctx = this.context;
    try {
      void ctx.resume().catch((err: unknown) => this.noteError(err));
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.45);
    } catch (err) {
      this.noteError(err);
    }
    // muted/paused: let it ring, then back to sleep
    if (this.ready && this.holds.size) window.setTimeout(() => this.applyHolds(), 700);
  }

  private noteError(err: unknown): void {
    this.lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }

  private checkState(): void {
    if (this.running) {
      if (!this.ready) {
        try {
          this.build();
        } catch (err) {
          this.noteError(err);
        }
      }
      this.listen(false);
    } else if (this.holds.size === 0 || !this.ready) {
      // never unlocked, or the OS knocked it out (calls, other apps): next tap fixes it
      this.listen(true);
    }
    this.onStateChange?.();
  }

  // iOS only. Web Audio is muted with the ring/silent switch on unless the page
  // asks for a playback session: Safari 16.4+ has an API for it, older iOS needs
  // a looping silent <audio> to move the page onto the media channel.
  private claimPlaybackSession(): void {
    try {
      if (navigator.audioSession) {
        navigator.audioSession.type = 'playback';
        return;
      }
    } catch {
      // fall through to the <audio> trick
    }
    if (this.silentEl) return;
    try {
      const el = document.createElement('audio');
      el.src = silentWavUrl();
      el.loop = true;
      el.setAttribute('playsinline', '');
      el.setAttribute('x-webkit-airplay', 'deny');
      this.silentEl = el;
      this.playSilent();
    } catch {
      // no keep-alive, the hint toast covers it
    }
  }

  private playSilent(): void {
    try {
      const p = this.silentEl?.play();
      if (p) p.catch(() => {});
    } catch {
      // never let this get in the way of the unlock
    }
  }

  private resolveTier(): AudioTier {
    const q = this.settings.audioQuality;
    if (q !== 'auto') return q;
    return this.autoLow || isAndroid ? 'low' : 'high';
  }

  private applyLookAhead(): void {
    const t = AUDIO_TIERS;
    Tone.getContext().lookAhead = this.tier === 'low' ? t.low.lookAhead : isTouch ? t.high.lookAhead : t.high.lookAheadDesktop;
  }

  // auto quality: the device is struggling, go low for the rest of the session
  degrade(): void {
    if (this.autoLow) return;
    this.autoLow = true;
    this.refreshTier();
  }

  private refreshTier(): void {
    const tier = this.resolveTier();
    if (tier === this.tier) return;
    this.tier = tier;
    this.applyLookAhead();
    if (this.ready) this.rebuildTier();
    this.onTierChange?.(tier);
  }

  // everything that depends on the tier, built fresh; the old nodes fade and go
  private buildTierNodes(): void {
    const t = AUDIO_TIERS[this.tier];
    const mono = this.tier === 'low';
    this.reverb = new Tone.Reverb({ decay: t.reverbDecay, preDelay: 0.02, wet: Math.min(0.3, t.reverbWetMax) }).connect(this.musicBus);
    this.playerBreath = new BreathVoice(this.sfxBus, 0, AUDIO.breathGain, mono);
    this.npcBreath = new BreathVoice(this.sfxBus, AUDIO.npcPan, AUDIO.npcBreathGain, mono);
    // spike stab: FM on high, a plain oscillator on low
    this.stab =
      this.tier === 'low'
        ? new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.02, decay: 0.8, sustain: 0.1, release: 0.6 }, volume: -18 })
        : new Tone.FMSynth({
            harmonicity: 1.41,
            modulationIndex: 8,
            envelope: { attack: 0.02, decay: 0.8, sustain: 0.1, release: 1 },
            volume: -18,
          });
    this.stab.connect(this.sfxBus);
  }

  private rebuildTier(): void {
    this.playerBreath.silence();
    this.npcBreath.silence();
    const old = [this.reverb, this.playerBreath, this.npcBreath, this.stab];
    this.buildTierNodes();
    this.blip.maxPolyphony = AUDIO_TIERS[this.tier].polyphony;
    const req = this.currentReq;
    if (req) {
      this.startSongInternal(req, 0.3);
      if (this.paused) Tone.getTransport().pause();
    }
    // after the old song's fade + dispose
    window.setTimeout(() => {
      for (const n of old) n.dispose();
    }, 4000);
  }

  private build(): void {
    this.master = new Tone.Gain(1).toDestination();
    this.musicBus = new Tone.Gain(1).connect(this.master);
    this.sfxBus = new Tone.Gain(1).connect(this.master);
    this.buildTierNodes();

    const heartLp = new Tone.Filter({ type: 'lowpass', frequency: 180 }).connect(this.sfxBus);
    this.heart = new Tone.MembraneSynth({
      pitchDecay: 0.06,
      octaves: 2.5,
      envelope: { attack: 0.002, decay: 0.28, sustain: 0, release: 0.1 },
      volume: -2,
    }).connect(heartLp);

    this.blip = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.18, sustain: 0, release: 0.12 },
      volume: -16,
    }).connect(this.sfxBus);
    this.blip.maxPolyphony = AUDIO_TIERS[this.tier].polyphony;
    this.thud = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 3,
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
      volume: -14,
    }).connect(this.sfxBus);

    this.ready = true;
    this.applySettings(this.settings);
    this.applyHolds();
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      this.startSongInternal(p);
    }
  }

  applySettings(s: SettingsData): void {
    this.settings = s;
    this.hold('muted', AudioEngine.isMuted(s));
    this.refreshTier();
    if (!this.ready) return;
    this.master.gain.rampTo(s.master, 0.1);
    this.musicBus.gain.rampTo(s.music, 0.1);
    this.sfxBus.gain.rampTo(s.sfx, 0.1);
  }

  startLevelSong(music: MusicConfig, companions: InstrumentKind[], period: number): void {
    this.currentMenu = null;
    this.requestSong({ music, companions, period });
  }

  playMenuMusic(kind: MenuKind, companions: InstrumentKind[] = []): void {
    if (this.currentMenu === kind && (this.song || this.pending)) return;
    this.currentMenu = kind;
    const m = MENU_MUSIC[kind];
    this.requestSong({ music: m.music, companions, period: m.period, menu: kind });
  }

  stopSong(fade = 1.2): void {
    this.pending = null;
    this.currentMenu = null;
    this.currentReq = null;
    if (this.song) {
      this.song.fadeOut(fade);
      this.song = null;
    }
  }

  private requestSong(req: SongRequest): void {
    // a new song always means we're not paused anymore (restart from the pause menu)
    this.paused = false;
    this.clearPauseHold();
    if (!this.ready) {
      this.pending = req;
      return;
    }
    this.startSongInternal(req);
  }

  private startSongInternal(req: SongRequest, fade = 1): void {
    if (this.song) this.song.fadeOut(fade);
    this.currentReq = req;
    this.reverb.wet.rampTo(Math.min(req.music.reverb, AUDIO_TIERS[this.tier].reverbWetMax), 1);
    this.song = new LevelSong(req.music, this.reverb, req.companions, req.period, this.tier);
    if (req.menu) {
      const l = MENU_MUSIC[req.menu].layers;
      this.song.setLayers({ ...l, companions: req.companions.map(() => 0.6) }, 1);
    }
  }

  // every frame from the game loop; the actual param pushes happen ~10x a second
  update(dt: number): void {
    if (!this.ready || this.holds.size) return;
    this.automationAcc += dt;
    if (this.automationAcc < AUDIO_AUTOMATION.interval) return;
    this.song?.update(this.automationAcc);
    this.automationAcc = 0;
  }

  // only records targets, safe to call every frame
  setSongState(period: number, layers: LayerLevels, calm: number): void {
    if (!this.song) return;
    this.song.setTempo(period);
    this.song.setLayers(layers, calm);
  }

  songBloom(): void {
    this.song?.bloom();
  }

  // per-frame breath noise + heartbeat
  // panic sets the heart rate, loudness defaults to the same (the lose meter makes it louder)
  updateBreath(
    dt: number,
    player: { lung: number; inhaling: boolean } | null,
    npc: { lung: number; inhaling: boolean } | null,
    panic: number,
    loudness = panic,
  ): void {
    if (!this.ready || this.paused || this.holds.size) return;
    if (player) this.playerBreath.update(dt, player.lung, player.inhaling);
    else this.playerBreath.silence(dt);
    if (npc) this.npcBreath.update(dt, npc.lung, npc.inhaling);
    else this.npcBreath.silence(dt);

    if (panic > 0.06) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        const interval = AUDIO.heartMaxInterval + (AUDIO.heartMinInterval - AUDIO.heartMaxInterval) * panic;
        this.heartTimer = interval;
        const now = Tone.now() + 0.02;
        const v = Math.min(1, Math.max(loudness, 0.25 * panic)) * AUDIO.heartGain;
        this.heart.triggerAttackRelease(52, 0.12, now, v);
        this.heart.triggerAttackRelease(46, 0.1, now + Math.min(0.2, interval * 0.3), v * 0.65);
      }
    } else {
      this.heartTimer = 0;
    }
  }

  // notification-ish ding for intrusive thoughts
  ping(): void {
    if (!this.ready || this.paused) return;
    const now = Tone.now() + 0.01;
    const base = 84 + Math.floor(Math.random() * 3) * 2;
    this.blip.triggerAttackRelease(mtof(base), 0.08, now, 0.5);
    this.blip.triggerAttackRelease(mtof(base + 5), 0.1, now + 0.09, 0.45);
  }

  pop(): void {
    if (!this.ready || this.paused) return;
    this.thud.triggerAttackRelease(mtof(60 + Math.random() * 12), 0.05, Tone.now() + 0.01, 0.5);
  }

  spike(): void {
    if (!this.ready) return;
    const now = Tone.now() + 0.01;
    this.stab.triggerAttackRelease(mtof(41), 1.2, now, 0.6);
    this.thud.triggerAttackRelease(mtof(36), 0.2, now, 0.9);
  }

  // a calm-ring segment filled up
  chime(): void {
    if (!this.ready) return;
    const now = Tone.now() + 0.01;
    [76, 81, 88].forEach((m, i) => this.blip.triggerAttackRelease(mtof(m), 0.25, now + i * 0.09, 0.35));
  }

  // input sounds go out right away, not through the lookahead
  uiMove(): void {
    if (!this.ready) return;
    this.blip.triggerAttackRelease(mtof(88), 0.05, Tone.immediate(), 0.25);
  }

  uiSelect(): void {
    if (!this.ready) return;
    const now = Tone.immediate();
    this.blip.triggerAttackRelease(mtof(81), 0.08, now, 0.3);
    this.blip.triggerAttackRelease(mtof(88), 0.12, now + 0.07, 0.3);
  }

  // anything holding = context suspended, Tone's clock stopped and the
  // keep-alive <audio> paused, so nothing ticks while nobody can hear it
  hold(reason: Hold, on: boolean): void {
    const was = this.holds.size > 0;
    if (on) this.holds.add(reason);
    else this.holds.delete(reason);
    if (was !== this.holds.size > 0) this.applyHolds();
  }

  private applyHolds(): void {
    if (!this.ready) return;
    const ctx = Tone.getContext() as Tone.Context;
    try {
      if (this.holds.size) {
        ctx.clockSource = 'offline';
        void this.context.suspend().catch(() => {});
        this.silentEl?.pause();
        this.listen(false);
      } else {
        ctx.clockSource = 'worker';
        // may be refused outside a gesture, so the next tap gets to retry too
        void this.context.resume().then(
          () => this.checkState(),
          () => {},
        );
        this.playSilent();
        this.listen(true);
      }
    } catch {
      // closed or mid-transition, the next change sorts it out
    }
    this.onStateChange?.();
  }

  pause(): void {
    if (!this.ready) return;
    this.paused = true;
    this.playerBreath.silence();
    this.npcBreath.silence();
    Tone.getTransport().pause();
    window.clearTimeout(this.pauseTimer);
    this.pauseTimer = window.setTimeout(() => this.hold('paused', true), PAUSE_SUSPEND_MS);
  }

  resume(): void {
    if (!this.ready) return;
    this.paused = false;
    this.clearPauseHold();
    Tone.getTransport().start();
  }

  private clearPauseHold(): void {
    window.clearTimeout(this.pauseTimer);
    this.hold('paused', false);
  }

  // live numbers for the ?perf=1 overlay
  stats(): { state: string; voices: number; sampleRate: number; baseLatency: number; outputLatency: number; attempts: number; error: string } {
    const ctx = this.context;
    let voices = this.song?.voices ?? 0;
    if (this.ready) voices += this.blip.activeVoices;
    return {
      state: ctx.state,
      voices,
      sampleRate: ctx.sampleRate,
      baseLatency: ctx.baseLatency ?? 0,
      // Safari/older Chrome don't report it
      outputLatency: ctx.outputLatency ?? 0,
      attempts: this.unlockAttempts,
      error: this.lastError,
    };
  }
}
