import type * as Tone from 'tone';
import { AUDIO_AUTOMATION } from '../data/levels';

// param pushes so far, the perf overlay turns it into a rate
export const automation = { count: 0 };

// exponential approach toward target over dt, snapping once it's close enough
export function approach(shown: number, target: number, dt: number, tau: number, snap: number): number {
  const v = shown + (target - shown) * (1 - Math.exp(-dt / tau));
  return Math.abs(target - v) < snap ? target : v;
}

// ramps param to value if it moved at least `step` since `last` (or just settled
// on `target`, pass NaN for none), returns what the param is now heading to
export function push(param: Tone.Param<any>, value: number, last: number, step: number, target: number, startTime?: number): number {
  if (value === last || (Math.abs(value - last) < step && value !== target)) return last;
  param.rampTo(value, AUDIO_AUTOMATION.interval, startTime);
  automation.count++;
  return value;
}
