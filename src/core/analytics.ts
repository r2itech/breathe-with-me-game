import { inject, type BeforeSend } from '@vercel/analytics';
import { isElectron } from './platform';

// page views only, and just the first one. the back-gesture history entry would otherwise count as another visit
let sentPageview = false;

const beforeSend: BeforeSend = (event) => {
  if (event.type !== 'pageview' || sentPageview) return null;
  sentPageview = true;
  return event;
};

export function initAnalytics(): void {
  if (isElectron) return;
  try {
    inject({ mode: import.meta.env.PROD ? 'production' : 'development', beforeSend });
  } catch {
    // never let analytics break the game
  }
}
