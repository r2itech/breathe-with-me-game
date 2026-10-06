import * as Tone from 'tone';
import { AUDIO_TIERS, type AudioTier, type InstrumentKind } from '../data/levels';

export interface Instrument {
  output: Tone.ToneAudioNode;
  play(freq: number | number[], dur: number, time: number, vel: number): void;
  readonly voices: number;
  dispose(): void;
}

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// any voice type, PolySynth<FMSynth> doesn't assign to PolySynth<Synth>
function wrap(synth: Tone.PolySynth<any>, tier: AudioTier, extra: Tone.ToneAudioNode[] = []): Instrument {
  // anything past this gets dropped instead of piling up
  synth.maxPolyphony = AUDIO_TIERS[tier].polyphony;
  const last = extra.length ? extra[extra.length - 1] : synth;
  if (extra.length) {
    synth.connect(extra[0]);
    for (let i = 0; i < extra.length - 1; i++) extra[i].connect(extra[i + 1]);
  }
  return {
    output: last,
    play(freq, dur, time, vel) {
      synth.triggerAttackRelease(freq, dur, time, vel);
    },
    get voices() {
      return synth.activeVoices;
    },
    dispose() {
      synth.dispose();
      for (const n of extra) n.dispose();
    },
  };
}

// low tier: plain oscillators, short releases so 3 voices are enough
const LOW_VOICE: Record<InstrumentKind, { type: 'sine' | 'triangle' | 'square'; decay: number; sustain: number; release: number; volume: number }> = {
  keys: { type: 'triangle', decay: 0.6, sustain: 0.2, release: 0.3, volume: -13 },
  musicbox: { type: 'sine', decay: 0.6, sustain: 0, release: 0.2, volume: -14 },
  chip: { type: 'square', decay: 0.12, sustain: 0.35, release: 0.08, volume: -24 },
  piano: { type: 'triangle', decay: 0.9, sustain: 0.05, release: 0.3, volume: -12 },
};

// one simple voice standing in for all companions on low
export function makeSimpleVoice(kind: InstrumentKind = 'keys'): Instrument {
  const v = LOW_VOICE[kind];
  const s = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: v.type },
    envelope: { attack: 0.005, decay: v.decay, sustain: v.sustain, release: v.release },
    volume: v.volume,
  });
  return wrap(s, 'low');
}

export function makeInstrument(kind: InstrumentKind, tier: AudioTier = 'high'): Instrument {
  if (tier === 'low') return makeSimpleVoice(kind);
  switch (kind) {
    case 'keys': {
      // warm lo-fi electric piano
      const s = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2,
        modulationIndex: 1.4,
        envelope: { attack: 0.01, decay: 1.1, sustain: 0.25, release: 1.4 },
        modulationEnvelope: { attack: 0.01, decay: 0.6, sustain: 0.1, release: 0.8 },
        volume: -12,
      });
      const lp = new Tone.Filter({ frequency: 2200, type: 'lowpass', rolloff: -12 });
      const trem = new Tone.Tremolo({ frequency: 3.5, depth: 0.25, spread: 0 }).start();
      return wrap(s, tier, [lp, trem]);
    }
    case 'musicbox': {
      const s = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 5.07,
        modulationIndex: 2.2,
        envelope: { attack: 0.001, decay: 1.4, sustain: 0, release: 0.6 },
        modulationEnvelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.4 },
        volume: -14,
      });
      const hp = new Tone.Filter({ frequency: 400, type: 'highpass' });
      return wrap(s, tier, [hp]);
    }
    case 'chip': {
      const s = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'square' },
        envelope: { attack: 0.004, decay: 0.12, sustain: 0.35, release: 0.08 },
        volume: -22,
      });
      const lp = new Tone.Filter({ frequency: 3200, type: 'lowpass' });
      return wrap(s, tier, [lp]);
    }
    case 'piano': {
      const s = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3,
        modulationIndex: 1.1,
        envelope: { attack: 0.004, decay: 2.2, sustain: 0.04, release: 1.8 },
        modulationEnvelope: { attack: 0.004, decay: 0.35, sustain: 0, release: 0.5 },
        volume: -11,
      });
      const lp = new Tone.Filter({ frequency: 2600, type: 'lowpass', rolloff: -12 });
      return wrap(s, tier, [lp]);
    }
  }
}

export function makePad(cutoff: number, tier: AudioTier = 'high'): { synth: Tone.PolySynth; filter: Tone.Filter; dispose(): void } {
  const low = tier === 'low';
  // low: one plain triangle per note, and a release short enough that the
  // triad is free again before the next bar's chord
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: low ? { type: 'triangle' } : { type: 'fattriangle', count: 2, spread: 18 },
    envelope: low ? { attack: 0.6, decay: 0.5, sustain: 0.8, release: 0.08 } : { attack: 1.4, decay: 0.5, sustain: 0.8, release: 1.6 },
    volume: -20,
  });
  synth.maxPolyphony = AUDIO_TIERS[tier].padPolyphony;
  const filter = new Tone.Filter({ frequency: cutoff, type: 'lowpass', rolloff: low ? -12 : -24, Q: 0.4 });
  synth.connect(filter);
  return {
    synth,
    filter,
    dispose() {
      synth.dispose();
      filter.dispose();
    },
  };
}
