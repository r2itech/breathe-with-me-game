// first, so the perf overlay can count AudioContexts before Tone makes one
import './core/perfProbe';
// latin only, the game text is English and the other subsets would just ship unused
import '@fontsource/quicksand/latin-400.css';
import '@fontsource/quicksand/latin-500.css';
import '@fontsource/quicksand/latin-600.css';
import '@fontsource/quicksand/latin-700.css';
import { Game } from './core/Game';
import { goWarning } from './scenes/flow';
import { initAnalytics } from './core/analytics';

initAnalytics();

async function boot(): Promise<void> {
  try {
    await document.fonts.load('600 32px Quicksand');
    await document.fonts.load('700 32px Quicksand');
  } catch {
    // fall back to sans-serif
  }
  const game = await Game.create();
  goWarning(game);
}

void boot();
