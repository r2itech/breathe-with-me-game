import * as Tone from 'tone';

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

  constructor(out: Tone.ToneAudioNode, pan: number, private level: number) {
    this.noise = new Tone.Noise('pink');
    this.filter = new Tone.Filter({ type: 'bandpass', frequency: 700, Q: 0.9 });
    this.gain = new Tone.Gain(0);
    this.panner = new Tone.Panner(pan);
    this.noise.chain(this.filter, this.gain, this.panner, out);
  }

  update(dt: number, lung: number, inhaling: boolean, mute = false): void {
    if (dt <= 0) return;
    const speed = Math.abs(lung - this.lastLung) / dt;
    this.lastLung = lung;
    const now = Tone.now();
    // inhale is airier and brighter, exhale lower and softer
    const amp = mute ? 0 : Math.min(1, speed * 1.4) * this.level * (inhaling ? 1 : 0.8);
    if (amp > 0.002) {
      this.quiet = 0;
      if (!this.on) {
        this.noise.start();
        this.on = true;
      }
    } else if (this.on && (this.quiet += dt) > 0.5) {
      this.off();
      return;
    }
    if (!this.on) return;
    const freq = inhaling ? 600 + 1300 * lung : 280 + 700 * lung;
    this.gain.gain.setTargetAtTime(amp, now, 0.06);
    this.filter.frequency.setTargetAtTime(freq, now, 0.08);
  }

  // no dt = right now (pause), otherwise after a short fade
  silence(dt = 0): void {
    if (!this.on) return;
    this.gain.gain.setTargetAtTime(0, Tone.now(), 0.05);
    this.quiet += dt;
    if (dt === 0 || this.quiet > 0.4) this.off();
  }

  private off(): void {
    this.gain.gain.setTargetAtTime(0, Tone.now(), 0.03);
    this.noise.stop('+0.2');
    this.on = false;
    this.quiet = 0;
  }

  dispose(): void {
    this.noise.dispose();
    this.filter.dispose();
    this.gain.dispose();
    this.panner.dispose();
  }
}
