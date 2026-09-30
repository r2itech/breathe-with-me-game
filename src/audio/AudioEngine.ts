import * as Tone from 'tone';
import type { SettingsData } from '../core/Settings';
import { AUDIO, MENU_MUSIC, type InstrumentKind, type MusicConfig } from '../data/levels';
import { BreathVoice } from './BreathVoice';
import { LevelSong, type LayerLevels } from './LevelSong';
import { mtof } from './instruments';

type MenuKind = keyof typeof MENU_MUSIC;

interface SongRequest {
  music: MusicConfig;
  companions: InstrumentKind[];
  period: number;
  menu?: MenuKind;
}

export class AudioEngine {
  ready = false;
  private starting = false;
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

  // must run from inside a user gesture in browsers
  async init(): Promise<void> {
    if (this.ready || this.starting) return;
    this.starting = true;
    try {
      await Tone.start();
    } catch {
      this.starting = false;
      return;
    }
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
      void (Tone.getContext().rawContext as AudioContext).resume();
    } catch {
      // browser will resume it on the next gesture
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
