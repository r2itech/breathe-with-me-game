import * as Tone from 'tone';

// filtered noise that swells with how fast the lung is moving
export class BreathVoice {
  private noise: Tone.Noise;
  private filter: Tone.Filter;
  private gain: Tone.Gain;
  private panner: Tone.Panner;
  private lastLung = 0;

  constructor(out: Tone.ToneAudioNode, pan: number, private level: number) {
    this.noise = new Tone.Noise('pink');
    this.filter = new Tone.Filter({ type: 'bandpass', frequency: 700, Q: 0.9 });
    this.gain = new Tone.Gain(0);
    this.panner = new Tone.Panner(pan);
    this.noise.chain(this.filter, this.gain, this.panner, out);
    this.noise.start();
  }

  update(dt: number, lung: number, inhaling: boolean, mute = false): void {
    if (dt <= 0) return;
    const speed = Math.abs(lung - this.lastLung) / dt;
    this.lastLung = lung;
    const now = Tone.now();
    // inhale is airier and brighter, exhale lower and softer
    const amp = mute ? 0 : Math.min(1, speed * 1.4) * this.level * (inhaling ? 1 : 0.8);
    const freq = inhaling ? 600 + 1300 * lung : 280 + 700 * lung;
    this.gain.gain.setTargetAtTime(amp, now, 0.06);
    this.filter.frequency.setTargetAtTime(freq, now, 0.08);
  }

  silence(): void {
    this.gain.gain.setTargetAtTime(0, Tone.now(), 0.05);
  }

  dispose(): void {
    this.noise.stop();
    this.noise.dispose();
    this.filter.dispose();
    this.gain.dispose();
    this.panner.dispose();
  }
}
