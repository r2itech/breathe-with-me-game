import { TEXT_TIMING } from '../data/levels';

// seconds a piece of text should stay fully readable, fades not included
export function readTime(text: string, min: number = TEXT_TIMING.minSeconds): number {
  return Math.max(min, TEXT_TIMING.base + TEXT_TIMING.perChar * text.length);
}

// alpha for something that fades in, holds for `hold`, then fades out; t = seconds since it appeared
export function textAlpha(t: number, hold: number, fadeIn: number = TEXT_TIMING.fadeIn, fadeOut: number = TEXT_TIMING.fadeOut): number {
  if (t < fadeIn) return t / fadeIn;
  if (t < fadeIn + hold) return 1;
  return Math.max(0, 1 - (t - fadeIn - hold) / fadeOut);
}

export function textLifetime(hold: number, fadeIn: number = TEXT_TIMING.fadeIn, fadeOut: number = TEXT_TIMING.fadeOut): number {
  return fadeIn + hold + fadeOut;
}
