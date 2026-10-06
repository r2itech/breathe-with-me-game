// ?perf=1 turns on the perf overlay, in any build. this file has to load before
// Tone so it can count AudioContexts by wrapping the constructor Tone picks up.

export const perfOn = new URLSearchParams(location.search).get('perf') === '1';

export const audioContexts = { created: 0, live: 0 };

if (perfOn) {
  const w = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const Native = w.AudioContext ?? w.webkitAudioContext;
  if (Native) {
    class Counted extends Native {
      constructor(options?: AudioContextOptions) {
        super(options);
        audioContexts.created++;
        audioContexts.live++;
      }

      close(): Promise<void> {
        if (this.state !== 'closed') audioContexts.live--;
        return super.close();
      }
    }
    w.AudioContext = Counted;
    if (w.webkitAudioContext) w.webkitAudioContext = Counted;
  }
}
