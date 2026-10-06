import * as Tone from 'tone';
import { AUDIO_AUTOMATION } from '../data/levels';
import { push } from './automation';

// filtered noise that swells with how fast the lung is moving
export class BreathVoice {
  private noise: Tone.Noise;
  private filter: Tone.Filter;
  private gain: Tone.Gain;
  private panner: Tone.Panner;
  private lastLung = 0;
  // the noise source only runs while there's breath to hear
  private on = false;
  private quiet = 0;
  // params go out ~10x a second, speed is averaged over that window
  private acc = 0;
  private travel = 0;
  private amp = 0;
  private freq = 700;
  private fading = false;

  constructor(out: Tone.ToneAudioNode, pan: number, private level: number) {
    this.noise = new Tone.Noise('pink');
    this.filter = new Tone.Filter({ type: 'bandpass', frequency: 700, Q: 0.9 });
    this.gain = new Tone.Gain(0);
    this.panner = new Tone.Panner(pan);
    this.noise.chain(this.filter, this.gain, this.panner, out);
  }

  update(dt: number, lung: number, inhaling: boolean, mute = false): void {
    if (dt <= 0) return;
    const step = Math.abs(lung - this.lastLung);
    this.lastLung = lung;
    this.travel += step;
    this.acc += dt;
    // inhale is airier and brighter, exhale lower and softer
    const ampFor = (speed: number) => (mute ? 0 : Math.min(1, speed * 1.4) * this.level * (inhaling ? 1 : 0.8));
    const moving = ampFor(step / dt) > 0.002;
    if (moving) {
      this.quiet = 0;
      this.fading = false;
      if (!this.on) {
        // input sound: no lookahead delay
        this.noise.start(Tone.immediate());
        this.on = true;
        this.acc = AUDIO_AUTOMATION.interval;
      }
    } else if (this.on && (this.quiet += dt) > 0.5) {
      this.off();
      return;
    }
    if (!this.on || this.acc < AUDIO_AUTOMATION.interval) return;
    const amp = ampFor(this.travel / this.acc);
    const freq = inhaling ? 600 + 1300 * lung : 280 + 700 * lung;
    this.acc = 0;
    this.travel = 0;
    const now = Tone.immediate();
    this.amp = push(this.gain.gain, amp, this.amp, AUDIO_AUTOMATION.gainStep, 0, now);
    this.freq = push(this.filter.frequency, freq, this.freq, AUDIO_AUTOMATION.breathFreqStep, NaN, now);
  }

  // no dt = right now (pause), otherwise after a short fade
  silence(dt = 0): void {
    if (!this.on) return;
    if (!this.fading) {
      this.fading = true;
      this.amp = push(this.gain.gain, 0, this.amp, AUDIO_AUTOMATION.gainStep, 0, Tone.immediate());
    }
    this.quiet += dt;
    if (dt === 0 || this.quiet > 0.4) this.off();
  }

  private off(): void {
    const now = Tone.immediate();
    this.amp = push(this.gain.gain, 0, this.amp, AUDIO_AUTOMATION.gainStep, 0, now);
    this.noise.stop(now + 0.2);
    this.on = false;
    this.quiet = 0;
    this.fading = false;
    this.acc = 0;
    this.travel = 0;
  }

  dispose(): void {
    this.noise.dispose();
    this.filter.dispose();
    this.gain.dispose();
    this.panner.dispose();
  }
}
