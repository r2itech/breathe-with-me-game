import * as Tone from 'tone';
import { AUDIO, type InstrumentKind, type MusicConfig } from '../data/levels';
import { makeInstrument, makePad, mtof, type Instrument } from './instruments';

export interface LayerLevels {
  pad: number;
  pulse: number;
  melody: number;
  extra: number;
  // one entry per companion, 0..1
  companions: number[];
}

export function bpmFor(period: number): number {
  const bpm = (AUDIO.beatsPerBreath * 60) / Math.max(0.5, period);
  return Math.min(AUDIO.maxBpm, Math.max(AUDIO.minBpm, bpm));
}

export class LevelSong {
  private out: Tone.Gain;
  private layers: Record<'pad' | 'pulse' | 'melody' | 'extra', Tone.Gain>;
  private companionGains: Tone.Gain[] = [];
  private companionInst: Instrument[] = [];
  private pad: ReturnType<typeof makePad>;
  private lead: Instrument;
  private bell: Instrument;
  private kick: Tone.MembraneSynth;
  private hat: Tone.NoiseSynth;
  private bass: Tone.MonoSynth;
  private loops: Tone.Loop[] = [];
  private disposables: { dispose(): void }[] = [];
  private bar = 0;
  private step = 0;
  private lastBpm = 0;
  private cutoff = 0;
  // layers that are off don't get notes at all, a muted synth still burns CPU
  private on = { pad: false, pulse: false, melody: false, extra: false };
  private companionOn: boolean[] = [];

  constructor(
    private cfg: MusicConfig,
    dest: Tone.ToneAudioNode,
    companions: InstrumentKind[],
    period: number,
  ) {
    this.out = new Tone.Gain(0).connect(dest);
    const mk = () => new Tone.Gain(0).connect(this.out);
    this.layers = { pad: mk(), pulse: mk(), melody: mk(), extra: mk() };

    this.pad = makePad(cfg.padCutoff[0]);
    this.pad.filter.connect(this.layers.pad);
    this.cutoff = cfg.padCutoff[0];

    this.lead = makeInstrument(cfg.signature);
    this.lead.output.connect(this.layers.melody);
    this.bell = makeInstrument('musicbox');
    this.bell.output.connect(this.layers.extra);

    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.2 },
      volume: -10,
    }).connect(this.layers.pulse);
    this.hat = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
      volume: -30,
    });
    const hatFilter = new Tone.Filter({ type: 'highpass', frequency: 6000 });
    this.hat.chain(hatFilter, this.layers.pulse);
    this.bass = new Tone.MonoSynth({
      oscillator: { type: cfg.pulse === 'chip' ? 'square' : 'sine' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.4 },
      filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.3, baseFrequency: 120, octaves: 2.5 },
      volume: cfg.pulse === 'chip' ? -22 : -14,
    }).connect(this.layers.pulse);
    this.disposables.push(hatFilter);

    for (const kind of companions) {
      const g = new Tone.Gain(0).connect(this.out);
      const inst = makeInstrument(kind);
      inst.output.connect(g);
      this.companionGains.push(g);
      this.companionInst.push(inst);
    }

    this.schedule();

    const tr = Tone.getTransport();
    tr.stop();
    tr.position = 0;
    tr.bpm.value = bpmFor(period);
    this.lastBpm = tr.bpm.value;
    tr.start('+0.05');
    this.out.gain.rampTo(1, 1.5);
  }

  private note(degree: number, octave = 0): number {
    const s = this.cfg.scale;
    const n = s.length;
    const oct = Math.floor(degree / n);
    const idx = ((degree % n) + n) % n;
    return this.cfg.root + s[idx] + 12 * (oct + octave);
  }

  private chordDegree(): number {
    const c = this.cfg.chords;
    return c[this.bar % c.length];
  }

  private schedule(): void {
    const cfg = this.cfg;

    this.loops.push(
      new Tone.Loop((time) => {
        const d = this.chordDegree();
        const tones = [d, d + 2, d + 4];
        if (cfg.seventh) tones.push(d + 6);
        const freqs = tones.map((x) => mtof(this.note(x)));
        const barSec = Tone.Time('1m').toSeconds();
        if (this.on.pad) this.pad.synth.triggerAttackRelease(freqs, barSec * 0.95, time, 0.6);
        this.bar++;
      }, '1m').start(0),
    );

    this.loops.push(
      new Tone.Loop((time) => {
        const s = this.step;
        this.step++;
        // 8 eighths per bar, derived from the step so it can't race the pad loop
        const cd = cfg.chords[Math.floor(s / 8) % cfg.chords.length];
        const eighth = Tone.Time('8n').toSeconds();

        const m = cfg.melody[s % cfg.melody.length];
        if (m >= 0 && this.on.melody) this.lead.play(mtof(this.note(m + cd, cfg.melodyOctave)), eighth * 1.6, time, 0.55 + 0.2 * Math.random());

        switch (this.on.pulse ? cfg.pulse : 'none') {
          case 'lofi':
            if (s % 8 === 0 || s % 8 === 5) this.kick.triggerAttackRelease(mtof(this.note(0, -2)), '8n', time, 0.8);
            if (s % 2 === 1) this.hat.triggerAttackRelease('32n', time + eighth * 0.08, 0.35 + 0.2 * Math.random());
            if (s % 8 === 0) this.bass.triggerAttackRelease(mtof(this.note(cd, -1)), eighth * 3, time, 0.7);
            break;
          case 'lullaby':
            if (s % 4 === 0) this.bass.triggerAttackRelease(mtof(this.note(cd + (s % 8 === 4 ? 4 : 0), -1)), eighth * 3.5, time, 0.5);
            break;
          case 'chip': {
            const arp = [0, 4, 7, 4];
            this.bass.triggerAttackRelease(mtof(this.note(cd, -1) + arp[s % 4]), eighth * 0.8, time, 0.6);
            if (s % 2 === 1) this.hat.triggerAttackRelease('32n', time, 0.5);
            if (s % 4 === 0) this.kick.triggerAttackRelease(mtof(this.note(0, -2)), '16n', time, 0.6);
            break;
          }
          case 'sparse':
            if (s % 8 === 0) this.bass.triggerAttackRelease(mtof(this.note(cd, -1)), eighth * 6, time, 0.45);
            break;
          case 'none':
            break;
        }

        // extra sparkle, chord tones up high
        if (s % 2 === 0 && this.on.extra) {
          const tone = [0, 2, 4, 2][(s / 2) % 4];
          this.bell.play(mtof(this.note(cd + tone, 2)), eighth * 2, time, 0.3);
        }

        // companions each take a slice of the beat so they don't pile up
        this.companionInst.forEach((inst, i) => {
          if (!this.companionOn[i] || (s + i * 2) % 4 !== 0) return;
          const tone = [0, 2, 4, 6][(Math.floor(s / 4) + i) % 4];
          inst.play(mtof(this.note(cd + tone, i % 2 === 0 ? 1 : 0)), eighth * 2.5, time + i * 0.01, 0.45);
        });
      }, '8n').start(0),
    );
  }

  setTempo(period: number): void {
    const bpm = bpmFor(period);
    if (Math.abs(bpm - this.lastBpm) < 0.5) return;
    this.lastBpm = bpm;
    Tone.getTransport().bpm.rampTo(bpm, AUDIO.tempoRamp);
  }

  setLayers(l: LayerLevels, calm: number): void {
    const now = Tone.now();
    const mix = this.cfg.mix;
    const live = (v: number) => v > 0.01;
    this.on.pad = live(l.pad * mix.pad);
    this.on.pulse = live(l.pulse * mix.pulse);
    this.on.melody = live(l.melody * mix.melody);
    this.on.extra = live(l.extra * mix.extra);
    this.companionOn = this.companionGains.map((_, i) => live((l.companions[i] ?? 0) * mix.companion));
    this.layers.pad.gain.setTargetAtTime(l.pad * mix.pad, now, 0.4);
    this.layers.pulse.gain.setTargetAtTime(l.pulse * mix.pulse, now, 0.4);
    this.layers.melody.gain.setTargetAtTime(l.melody * mix.melody, now, 0.5);
    this.layers.extra.gain.setTargetAtTime(l.extra * mix.extra, now, 0.6);
    this.companionGains.forEach((g, i) => g.gain.setTargetAtTime((l.companions[i] ?? 0) * mix.companion, now, 0.8));

    const [lo, hi] = this.cfg.padCutoff;
    const cut = lo + (hi - lo) * calm;
    if (Math.abs(cut - this.cutoff) > 10) {
      this.cutoff = cut;
      this.pad.filter.frequency.setTargetAtTime(cut, now, 0.5);
    }
  }

  // bright rising arpeggio on top of whatever is playing
  bloom(): void {
    const now = Tone.now() + 0.05;
    const cd = this.chordDegree();
    const tones = [0, 2, 4, 7, 9, 11, 14];
    tones.forEach((t, i) => {
      this.bell.play(mtof(this.note(cd + t, 1)), 0.3, now + i * 0.14, 0.5);
      this.lead.play(mtof(this.note(cd + t, 0)), 0.3, now + i * 0.14 + 0.07, 0.35);
    });
    this.layers.extra.gain.setTargetAtTime(this.cfg.mix.extra * 1.5, now, 0.3);
  }

  get voices(): number {
    let n = this.pad.synth.activeVoices + this.lead.voices + this.bell.voices;
    for (const i of this.companionInst) n += i.voices;
    return n;
  }

  fadeOut(time = 1.2): void {
    this.out.gain.cancelScheduledValues(Tone.now());
    this.out.gain.rampTo(0, time);
    for (const l of this.loops) l.stop();
    window.setTimeout(() => this.dispose(), (time + 3) * 1000);
  }

  private dispose(): void {
    for (const l of this.loops) l.dispose();
    this.pad.dispose();
    this.lead.dispose();
    this.bell.dispose();
    this.kick.dispose();
    this.hat.dispose();
    this.bass.dispose();
    for (const d of this.disposables) d.dispose();
    for (const i of this.companionInst) i.dispose();
    for (const g of this.companionGains) g.dispose();
    for (const g of Object.values(this.layers)) g.dispose();
    this.out.dispose();
  }
}
