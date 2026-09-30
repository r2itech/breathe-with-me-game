// every player-facing string
import { isTouch } from '../core/platform';
import { AUTHOR } from './links';

// keyboard vs touch wording
const HOLD = isTouch ? 'Hold the screen' : 'Hold SPACE';
const TAP = isTouch ? 'Tap' : 'Press SPACE';
const ANY = isTouch ? 'Tap to continue' : 'Press any key';

export interface LevelText {
  name: string;
  tagline: string;
  intro: string[];
  outro: string[];
  thoughts: string[];
  objectives: { match: string; lead: string; anchor: string };
  // sync label when the connection is gone
  lost: string;
  // one sentence on the intro card
  goal: string;
  calm: string;
  gameOver: string;
  // what they say (the facade) vs the one honest thing they say at the end
  facade: string[];
  honest: string;
}

// lowercase + trailing ellipsis so they read as someone's thoughts, not as UI
const COMMON_THOUGHTS = ['what if...', 'not enough...', 'too late...', 'hurry...', 'why now...', 'again...?'];

export const TEXT = {
  warning: {
    lines: ['This game depicts moments of anxiety and panic.', 'Take a break anytime.'],
    photo: 'Some scenes contain flickering and screen shake. You can turn these off with "Reduce motion & flashes" in Settings.',
    cont: ANY,
  },
  title: {
    prompt: HOLD,
    promptBreathe: 'Breathe with it',
    name: 'Breathe With Me',
    sub: 'A small game for World Mental Health Day',
    badge: 'World Mental Health Day  \u00b7  10.10',
  },
  menu: {
    cont: 'Continue',
    newGame: 'New Game',
    settings: 'Settings',
    quit: 'Quit',
    resume: 'Resume',
    restart: 'Restart level',
    backToMap: 'Back to map',
    back: 'Back',
    confirmNew: 'Start over? Your progress will be cleared.',
    yes: 'Start over',
    no: 'Keep my progress',
  },
  settings: {
    title: 'Settings',
    master: 'Master volume',
    music: 'Music',
    sfx: 'Sound effects',
    fullscreen: 'Fullscreen',
    reduceMotion: 'Reduce motion & flashes',
    on: 'On',
    off: 'Off',
  },
  pause: 'Paused',
  map: {
    choose: 'Someone needs you tonight',
    locked: 'Not yet',
    helped: 'Helped',
    back: 'Menu',
    enter: isTouch ? 'Tap a window to visit' : 'Enter / click to visit',
    allLit: 'The whole city is breathing a little easier.',
  },
  hints: {
    finalMatch: 'They\'re here. Just breathe',
    finalLead: 'Let their light set the pace',
  },
  tutorial: {
    you: `This is you. ${HOLD} to breathe in.`,
    release: 'Release to breathe out.',
    meet: 'This is Maya. She\'s panicking.',
    line: 'Follow the glowing line \u2014 breathe when she breathes.',
    ring: 'This ring is how calm Maya is. Fill it to help her.',
    synced: 'That\'s it. You\'re with her.',
    thoughts: 'Those are her anxious thoughts. You can\'t stop them \u2014 just keep breathing with her.',
    panic: 'If she panics too much, she\'ll leave.',
    spike: 'Her panic spikes. Don\'t follow the red line \u2014 keep your pace.',
  },
  howTo: {
    title: 'How to play',
    button: 'How to play',
    steps: [
      { name: 'MATCH', text: `Breathe with them. ${HOLD} while the line rises, let go while it falls.` },
      { name: 'LEAD', text: 'Breathe a little slower. Stay together and they slow down with you.' },
      { name: 'STAY STEADY', text: 'Their panic will spike. Don\'t rush with them. Keep your own pace.' },
    ],
    legend: [
      'The glowing line: breathe with it. Up is in, down is out.',
      'Calm ring: how calm they are. It fills as you go and never goes back.',
      'Red arc: their panic. If it fills up, they need more space.',
      'IN SYNC / DRIFTING / LOST: how together you are right now.',
      'Italic words drifting out of them are their anxious thoughts.',
      'Bubbles: what they say. Drifting words: what they don\'t.',
    ],
  },
  links: {
    github: 'Source code on GitHub',
    help: 'Need to talk to someone?',
    helpline: 'Find a helpline near you',
  },
  platform: {
    rotate: 'Rotate your device to landscape',
    silentSwitch: 'No sound? Check your silent switch.',
  },
  wave: {
    key: isTouch ? 'HOLD' : 'SPACE',
  },
  hud: {
    steps: { match: 'MATCH', lead: 'LEAD', anchor: 'STAY STEADY' },
    finalSteps: { match: 'MATCH', lead: 'FOLLOW', anchor: 'HOLD ON' },
    stepOf: (n: number, m: number, name: string) => `STEP ${n} OF ${m}  ·  ${name}`,
    inSync: 'IN SYNC',
    drifting: 'DRIFTING',
    pops: {
      nice: 'Nice',
      tooFast: 'Too fast',
      dontFollow: 'Don\'t follow',
      follow: 'Follow the glowing line',
      done: { match: 'Matched \u2713', lead: 'Slowed down \u2713', anchor: 'Steady \u2713' },
    },
  },
  cards: {
    begin: `${TAP} to begin`,
    tryAgain: 'Try again?',
    retry: 'Retry level',
    backToMap: 'Back to map',
    cont: 'Continue',
    breaths: (n: number) => `Breaths: ${n}`,
    inSync: (pct: number) => `In sync ${pct}% of the time`,
    newBest: 'New best',
    continuePrompt: `${TAP} to continue`,
    choosePrompt: isTouch ? 'Tap a choice' : 'Arrows to choose  \u00b7  SPACE to confirm',
  },
  levels: [
    {
      name: 'Maya',
      tagline: 'Student. Thesis defense in 7 hours',
      intro: ['Maya. Her thesis defense is in seven hours.', 'The pages won\'t stop moving.'],
      outro: ['She reads her first slide out loud. It sounds okay.', '"Thanks for staying."'],
      thoughts: [...COMMON_THOUGHTS, 'my mind is blank...', 'they\'ll see...', 'not ready...'],
      objectives: { match: 'Breathe with Maya', lead: 'Slow down little by little \u2014 she\'ll follow', anchor: 'Don\'t follow her panic. Keep your pace.' },
      lost: 'LOST HER',
      goal: 'Help Maya calm down. Breathe with her.',
      calm: 'Maya is calm.',
      gameOver: 'Maya needed more space.',
      facade: ['I\'m fine, just tired.', 'Totally ready.', 'It\'s just a presentation.'],
      honest: 'I was so scared I\'d freeze.',
    },
    {
      name: 'Sam',
      tagline: 'New parent. 3 AM',
      intro: ['Sam. 3 AM. The baby is finally asleep.', 'Sam isn\'t.'],
      outro: ['The fog thins. The house is just quiet now.', '"I\'m doing better than I thought."'],
      thoughts: [...COMMON_THOUGHTS, 'is that crying...?', 'doing it wrong...', 'so tired...'],
      objectives: { match: 'Breathe with Sam', lead: 'Slow down little by little \u2014 she\'ll follow', anchor: 'Don\'t follow her panic. Keep your pace.' },
      lost: 'LOST HER',
      goal: 'Help Sam calm down. Breathe with her.',
      calm: 'Sam is calm.',
      gameOver: 'Sam needed more space.',
      facade: ['Baby\'s asleep, all good.', 'We\'re managing!', 'I\'m okay, really.'],
      honest: 'I didn\'t know if I was doing any of it right.',
    },
    {
      name: 'Dani',
      tagline: 'Software developer. Release night',
      intro: ['Dani. The release goes live in the morning.', 'Everything is urgent. Nothing is finished.'],
      outro: ['The notifications can wait until morning.', '"I forgot I was allowed to breathe."'],
      thoughts: [...COMMON_THOUGHTS, '@you...', 'urgent...', 'build failed...', '12 new...', 'still not done...', 'eta...?'],
      objectives: { match: 'Breathe with Dani', lead: 'Slow down little by little \u2014 they\'ll follow', anchor: 'Don\'t follow their panic. Keep your pace.' },
      lost: 'LOST THEM',
      goal: 'Help Dani calm down. Breathe with them.',
      calm: 'Dani is calm.',
      gameOver: 'Dani needed more space.',
      facade: ['Almost done :)', 'No worries, I\'ll handle it.', 'Just one more build.'],
      honest: 'I haven\'t slept properly in weeks.',
    },
    {
      name: 'Mr. Harto',
      tagline: 'Lives alone',
      intro: ['Mr. Harto. The phone hasn\'t rung in weeks.', 'The snow is very loud tonight.'],
      outro: ['He puts the kettle on. Two cups, just in case.', '"Come by again sometime."'],
      thoughts: ['what if...', 'no one called...', 'too quiet...', 'forgotten...', 'too late...', 'alone...'],
      objectives: { match: 'Breathe with Mr. Harto', lead: 'Slow down little by little \u2014 he\'ll follow', anchor: 'Don\'t follow his panic. Keep your pace.' },
      lost: 'LOST HIM',
      goal: 'Help Mr. Harto calm down. Breathe with him.',
      calm: 'Mr. Harto is calm.',
      gameOver: 'Mr. Harto needed more space.',
      facade: ['Don\'t worry about me.', 'I\'m used to the quiet.', 'My kids are busy, it\'s fine.'],
      honest: 'It\'s nice to have someone here.',
    },
    {
      name: 'You',
      tagline: 'Your own storm',
      intro: ['Then, on the way home,', 'it\'s your turn.'],
      outro: ['They were there for you.', 'Just like you were there for them.'],
      thoughts: [...COMMON_THOUGHTS, 'who am i to help...', 'fake...', 'they\'ll leave...', 'too much...'],
      objectives: { match: 'Just breathe. They\'re matching you', lead: 'Follow their light as it slows down', anchor: 'Hold on to their rhythm, not the panic' },
      lost: 'LOST THEM',
      goal: 'Let them help you. Breathe with them.',
      calm: 'You are calm.',
      gameOver: 'You needed more space.',
      facade: ['I\'m fine.', 'It\'s nothing.', 'Don\'t worry about me.'],
      honest: 'I\'m not fine. But I\'m not alone.',
    },
  ] as LevelText[],
  final: {
    crack: ['Your chest is tight.', 'Your heart won\'t slow down.'],
    arrive: 'You\'re not alone.',
  },
  ending: {
    helped: 'People helped',
    breaths: 'Breaths taken',
    sync: 'Time breathing together',
    lines: [
      'Did you notice you feel calmer too?',
      'You don\'t need a superpower to be someone\'s hero.',
      'Sometimes you just need to be there.',
      'If you\'re struggling, talk to someone you trust.',
    ],
    mhd: 'October 10 is World Mental Health Day.',
    cont: ANY,
  },
  credits: [
    'Breathe With Me',
    'A small game for World Mental Health Day',
    '',
    `Made by ${AUTHOR}`,
    '',
    'Made with TypeScript, PixiJS, Tone.js and Electron',
    'Every visual is drawn in code, every sound is synthesized',
    'Font: Quicksand, SIL Open Font License',
    '',
    'Thank you for being there.',
  ],
};

export function formatMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
