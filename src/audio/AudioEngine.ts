import * as Tone from 'tone';
import type { SettingsData } from '../core/Settings';
import { AUDIO, MENU_MUSIC, type InstrumentKind, type MusicConfig } from '../data/levels';
import { BreathVoice } from './BreathVoice';
import { LevelSong, type LayerLevels } from './LevelSong';
import { mtof } from './instruments';

type MenuKind = keyof typeof MENU_MUSIC;

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

interface SongRequest {
  music: MusicConfig;
  companions: InstrumentKind[];
  period: number;
  menu?: MenuKind;
}

export class AudioEngine {
  ready = false;
  private starting = false;
  // last thing that went wrong building or unlocking, if anything did.
  // nothing upstream of this surfaced it before, so a real failure here
  // looked identical to "the browser just won't unlock"
  private lastError = '';
  private master!: Tone.Gain;
  private musicBus!: Tone.Gain;
  private sfxBus!: Tone.Gain;
  private reverb!: Tone.Reverb;
  private playerBreath!: BreathVoice;
  private npcBreath!: BreathVoice;
  private heart!: Tone.MembraneSynth;
  private blip!: Tone.PolySynth;
  private thud!: Tone.MembraneSynth;
  private stab!: Tone.FMSynth;
  private song: LevelSong | null = null;
  private pending: SongRequest | null = null;
  private currentMenu: MenuKind | null = null;
  private heartTimer = 0;
  private settings: SettingsData;
  private paused = false;

  constructor(settings: SettingsData) {
    this.settings = settings;
  }

  // catches anything that doesn't go through init()'s own try/catch — Tone.Reverb
  // generates its impulse response fire-and-forget internally, for one, so a
  // failure there would otherwise never reach `lastError` at all
  recordUnhandledError(reason: unknown): void {
    this.lastError = `unhandled: ${reason instanceof Error ? reason.message : String(reason)}`;
  }

  get running(): boolean {
    return (Tone.getContext().rawContext as AudioContext).state === 'running';
  }

  // one line of ground truth for the "still no sound" reports: whatever is
  // wrong, this says whether it's the context, the game's own volume, or
  // neither — ctx=running alone doesn't rule out the mixer sitting at 0
  diagnostics(): string {
    const raw = Tone.getContext().rawContext as AudioContext;
    const gains = this.ready
      ? ` gain=${this.master.gain.value.toFixed(2)}/${this.musicBus.gain.value.toFixed(2)}/${this.sfxBus.gain.value.toFixed(2)}`
      : ' gain=n/a(not built)';
    const vol = `vol=${this.settings.master}/${this.settings.music}/${this.settings.sfx}`;
    const err = this.lastError ? ` err=${this.lastError}` : '';
    return `ctx=${raw.state} sr=${raw.sampleRate} ready=${this.ready}${gains} ${vol} session=${navigator.audioSession?.type ?? 'n/a'}${err}`;
  }

  // a raw oscillator straight to the context's destination, nothing from Tone's
  // graph involved. if this is inaudible, the problem is the context or the
  // device, not our code: Tone can't be reached before this is.
  testBeep(): void {
    try {
      const ctx = Tone.getContext().rawContext as AudioContext;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
    } catch {
      // surfaced through diagnostics() instead of thrown
    }
  }

  // iOS mutes Web Audio with the ring/silent switch on unless the page asks for
  // a playback session. Safari 16.4+ only, and harmless to miss elsewhere.
  private claimPlaybackSession(): void {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      // older Safari, the silent-switch hint covers it
    }
  }

  // must run from inside a user gesture in browsers. mobile browsers can resolve
  // resume() while leaving the context suspended, so this never latches on a
  // failed attempt: every later gesture calls it again until audio really runs.
  //
  // some mobile browsers also leave the resume() promise pending forever instead
  // of rejecting it when a gesture doesn't qualify, rather than settling it either
  // way, so this races it against a timeout — without that, `starting` would stay
  // true forever and silently swallow every later retry too.
  async init(): Promise<void> {
    if (this.starting || (this.ready && this.running)) return;
    this.starting = true;
    this.claimPlaybackSession();
    try {
      await Promise.race([this.unlock(), timeout(2500)]);
      this.lastError = '';
    } catch (err) {
      // record it instead of swallowing it: a build() failure here used to
      // look identical to "the browser just won't unlock", when it's really
      // the context being perfectly fine and something in our own graph
      // throwing partway through, leaving `ready` false for a different reason
      this.lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    } finally {
      this.starting = false;
    }
  }

  private async unlock(): Promise<void> {
    await Tone.start();
    const raw = Tone.getContext().rawContext as AudioContext;
    if (raw.state !== 'running') await raw.resume();
    // if it's already ready the graph survived a suspend and only needed waking
    if (this.running && !this.ready) this.build();
  }

  private build(): void {
    Tone.getContext().lookAhead = 0.05;

    this.master = new Tone.Gain(1).toDestination();
    this.musicBus = new Tone.Gain(1).connect(this.master);
    this.sfxBus = new Tone.Gain(1).connect(this.master);
    this.reverb = new Tone.Reverb({ decay: 5, preDelay: 0.02, wet: 0.3 }).connect(this.musicBus);

    this.playerBreath = new BreathVoice(this.sfxBus, 0, AUDIO.breathGain);
    this.npcBreath = new BreathVoice(this.sfxBus, AUDIO.npcPan, AUDIO.npcBreathGain);

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
    this.thud = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 3,
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
      volume: -14,
    }).connect(this.sfxBus);
    this.stab = new Tone.FMSynth({
      harmonicity: 1.41,
      modulationIndex: 8,
      envelope: { attack: 0.02, decay: 0.8, sustain: 0.1, release: 1 },
      volume: -18,
    }).connect(this.sfxBus);

    this.ready = true;
    this.applySettings(this.settings);
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      this.startSongInternal(p);
    }
  }

  applySettings(s: SettingsData): void {
    this.settings = s;
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
    if (this.song) {
      this.song.fadeOut(fade);
      this.song = null;
    }
  }

  private requestSong(req: SongRequest): void {
    // a new song always means we're not paused anymore (restart from the pause menu)
    this.paused = false;
    if (!this.ready) {
      this.pending = req;
      return;
    }
    this.startSongInternal(req);
  }

  private startSongInternal(req: SongRequest): void {
    if (this.song) this.song.fadeOut(1);
    this.reverb.wet.rampTo(req.music.reverb, 1);
    this.song = new LevelSong(req.music, this.reverb, req.companions, req.period);
    if (req.menu) {
      const l = MENU_MUSIC[req.menu].layers;
      this.song.setLayers({ ...l, companions: req.companions.map(() => 0.6) }, 1);
    }
  }

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
    if (!this.ready || this.paused) return;
    if (player) this.playerBreath.update(dt, player.lung, player.inhaling);
    else this.playerBreath.silence();
    if (npc) this.npcBreath.update(dt, npc.lung, npc.inhaling);
    else this.npcBreath.silence();

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

  uiMove(): void {
    if (!this.ready) return;
    this.blip.triggerAttackRelease(mtof(88), 0.05, Tone.now() + 0.01, 0.25);
  }

  uiSelect(): void {
    if (!this.ready) return;
    const now = Tone.now() + 0.01;
    this.blip.triggerAttackRelease(mtof(81), 0.08, now, 0.3);
    this.blip.triggerAttackRelease(mtof(88), 0.12, now + 0.07, 0.3);
  }

  // tab hidden: stop the whole audio context, not just the transport
  suspend(): void {
    if (!this.ready) return;
    try {
      void (Tone.getContext().rawContext as AudioContext).suspend();
    } catch {
      // already suspended
    }
  }

  wake(): void {
    if (!this.ready) return;
    try {
      void (Tone.getContext().rawContext as AudioContext).resume().catch(() => {});
    } catch {
      // mobile refuses this outside a gesture, so init() retries on the next tap
    }
  }

  pause(): void {
    if (!this.ready) return;
    this.paused = true;
    this.playerBreath.silence();
    this.npcBreath.silence();
    Tone.getTransport().pause();
  }

  resume(): void {
    if (!this.ready) return;
    this.paused = false;
    Tone.getTransport().start();
  }
}
