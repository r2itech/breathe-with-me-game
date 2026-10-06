import * as Tone from 'tone';
import type { InstrumentKind } from '../data/levels';

export interface Instrument {
  output: Tone.ToneAudioNode;
  play(freq: number | number[], dur: number, time: number, vel: number): void;
  readonly voices: number;
  dispose(): void;
}

// per instrument, anything past this gets dropped instead of piling up
export const MAX_VOICES = 6;

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// any voice type, PolySynth<FMSynth> doesn't assign to PolySynth<Synth>
function wrap(synth: Tone.PolySynth<any>, extra: Tone.ToneAudioNode[] = []): Instrument {
  synth.maxPolyphony = MAX_VOICES;
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

export function makeInstrument(kind: InstrumentKind): Instrument {
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
      return wrap(s, [lp, trem]);
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
      return wrap(s, [hp]);
    }
    case 'chip': {
      const s = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'square' },
        envelope: { attack: 0.004, decay: 0.12, sustain: 0.35, release: 0.08 },
        volume: -22,
      });
      const lp = new Tone.Filter({ frequency: 3200, type: 'lowpass' });
      return wrap(s, [lp]);
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
      return wrap(s, [lp]);
    }
  }
}

export function makePad(cutoff: number): { synth: Tone.PolySynth; filter: Tone.Filter; dispose(): void } {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fattriangle', count: 2, spread: 18 },
    envelope: { attack: 1.4, decay: 0.5, sustain: 0.8, release: 1.6 },
    volume: -20,
  });
  // one chord ringing out under the next, 4 notes each
  synth.maxPolyphony = 8;
  const filter = new Tone.Filter({ frequency: cutoff, type: 'lowpass', rolloff: -24, Q: 0.4 });
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
