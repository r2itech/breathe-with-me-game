// all gameplay tuning lives here

export const BREATH = {
  // time constants of the player's lung curve (seconds)
  tauIn: 0.9,
  tauOut: 1.1,
  // used when the player is the panicked one
  panicTauIn: 0.32,
  panicTauOut: 0.55,
  // taps shorter than this don't count as a new breath for period tracking
  minInterval: 0.35,
  historySize: 3,
};

export const SYNC = {
  rise: 0.55,
  fall: 0.8,
  // no state change for this long counts as not breathing together
  idleMin: 3,
  idleCycles: 1.3,
  // fraction of the phase error absorbed per player transition, times connection
  coupling: 0.35,
  couplingMin: 0.25,
  // only pull the NPC if the edges are this close (seconds)
  couplingWindow: 0.9,
  // above this counts as "in sync" for stats and music
  syncedAt: 0.8,
};

// web/mobile performance + sizing
export const PERF = {
  // ignore the first seconds (loading, shader compiles)
  warmup: 5,
  sampleTime: 1,
  // below this for slowSeconds -> low quality for the rest of the session
  minFps: 45,
  slowSeconds: 3,
  // particle share kept in low quality
  lowParticles: 0.45,
  // menu rows should be at least this many css px tall on phones
  minTapPx: 44,
  maxUiScale: 1.7,
};

// how long on-screen text stays fully readable: max(min, base + perChar * characters)
export const TEXT_TIMING = {
  base: 0.8,
  perChar: 0.07,
  minSeconds: 1.2,
  fadeIn: 0.3,
  fadeOut: 0.5,
  // per-kind minimums
  thoughtMin: 3,
  thoughtFadeIn: 0.4,
  thoughtFadeOut: 0.8,
  popMin: 1.2,
  popFadeIn: 0.15,
  // same pop label won't show again within this many seconds
  popCooldown: 2,
  tutorialMin: 3,
  // card prompt ("Press SPACE") shows up after this, presses before it are ignored
  cardPromptDelay: 1,
};

export const FEEDBACK = {
  // an inhale sooner than this fraction of the guide period reads as "too fast"
  tooFastRatio: 0.7,
  tooFastCooldown: 4,
  // sync label thresholds on connection
  inSyncAt: 0.7,
  driftingAt: 0.35,
  // seconds a phase intro banner stays up before shrinking into the panel
  bannerTime: 3.5,
};

export interface Palette {
  bgTop: number;
  bgBottom: number;
  // background after the bloom
  warmTop: number;
  warmBottom: number;
  npc: number;
  player: number;
  tether: number;
  ring: number;
  weather: number;
  star: number;
  text: number;
}

export type WeatherKind = 'paper' | 'fog' | 'cards' | 'snow' | 'storm';

export const PALETTES: Record<string, Palette> = {
  maya: {
    bgTop: 0x0a0c26,
    bgBottom: 0x1f1b4a,
    warmTop: 0x2b1a44,
    warmBottom: 0x8a4c5c,
    npc: 0x9fb6ff,
    player: 0xffc9a3,
    tether: 0xffe3bd,
    ring: 0xdfe4ff,
    weather: 0xe4e9ff,
    star: 0xfff0c8,
    text: 0xf2ecff,
  },
  sam: {
    bgTop: 0x0b1320,
    bgBottom: 0x1d2b3a,
    warmTop: 0x2a2436,
    warmBottom: 0x86606a,
    npc: 0xa9d6e8,
    player: 0xffcfa8,
    tether: 0xffe8c6,
    ring: 0xd6eef5,
    weather: 0xb8c8d8,
    star: 0xfff2d0,
    text: 0xeef6fb,
  },
  dani: {
    bgTop: 0x120a1c,
    bgBottom: 0x2a0f35,
    warmTop: 0x2a1535,
    warmBottom: 0x9a5460,
    npc: 0xc79bff,
    player: 0xffc49a,
    tether: 0xffe0b6,
    ring: 0xf0dcff,
    weather: 0xf5f0ff,
    star: 0xffeccc,
    text: 0xf6eeff,
  },
  harto: {
    bgTop: 0x0c1016,
    bgBottom: 0x232a33,
    warmTop: 0x2c2530,
    warmBottom: 0x8c6450,
    npc: 0xc8d4e0,
    player: 0xffd0a0,
    tether: 0xffe6c0,
    ring: 0xe8eef4,
    weather: 0xf4f8ff,
    star: 0xfff3d6,
    text: 0xf2f5f8,
  },
  you: {
    bgTop: 0x08070f,
    bgBottom: 0x1e1226,
    warmTop: 0x3a2040,
    warmBottom: 0xc0705a,
    npc: 0xffe0b0,
    player: 0xb5c2ff,
    tether: 0xffe6c4,
    ring: 0xfff0dc,
    weather: 0xe6e0f0,
    star: 0xfff2cc,
    text: 0xfff6ee,
  },
};

export type InstrumentKind = 'keys' | 'musicbox' | 'chip' | 'piano';
export type PulseKind = 'lofi' | 'lullaby' | 'chip' | 'sparse' | 'none';

export interface MusicConfig {
  // midi note of the tonic
  root: number;
  scale: number[];
  // chord root as a scale degree, one per bar
  chords: number[];
  seventh: boolean;
  // this level's instrument, it joins later levels as a companion
  signature: InstrumentKind;
  pulse: PulseKind;
  // eighth-note steps as scale degrees, -1 = rest
  melody: number[];
  melodyOctave: number;
  // pad lowpass at panic -> at calm
  padCutoff: [number, number];
  reverb: number;
  mix: { pad: number; pulse: number; melody: number; extra: number; companion: number };
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

export const MUSIC: Record<string, MusicConfig> = {
  maya: {
    root: 53,
    scale: MAJOR,
    chords: [0, 5, 3, 4],
    seventh: true,
    signature: 'keys',
    pulse: 'lofi',
    melody: [4, -1, 2, -1, 1, -1, 0, -1, 2, -1, -1, 4, 5, -1, 4, -1],
    melodyOctave: 1,
    padCutoff: [500, 1800],
    reverb: 0.3,
    mix: { pad: 0.5, pulse: 0.7, melody: 0.45, extra: 0.3, companion: 0.35 },
  },
  sam: {
    root: 55,
    scale: MAJOR,
    chords: [0, 3, 0, 4],
    seventh: false,
    signature: 'musicbox',
    pulse: 'lullaby',
    melody: [7, -1, 9, -1, 7, -1, 4, -1, 5, -1, 4, -1, 2, -1, -1, -1],
    melodyOctave: 1,
    padCutoff: [400, 1400],
    reverb: 0.45,
    mix: { pad: 0.45, pulse: 0.5, melody: 0.5, extra: 0.3, companion: 0.3 },
  },
  dani: {
    root: 57,
    scale: MINOR,
    chords: [0, 5, 2, 6],
    seventh: false,
    signature: 'chip',
    pulse: 'chip',
    melody: [0, 2, 4, 2, 7, 4, 2, 4, 5, 4, 2, 0, 1, 2, -1, -1],
    melodyOctave: 1,
    padCutoff: [600, 2400],
    reverb: 0.2,
    mix: { pad: 0.35, pulse: 0.5, melody: 0.3, extra: 0.25, companion: 0.3 },
  },
  harto: {
    root: 50,
    scale: MAJOR,
    chords: [0, 4, 5, 3],
    seventh: false,
    signature: 'piano',
    pulse: 'sparse',
    melody: [4, -1, -1, -1, 2, -1, -1, -1, 1, -1, -1, 2, 0, -1, -1, -1],
    melodyOctave: 1,
    padCutoff: [350, 1100],
    reverb: 0.5,
    mix: { pad: 0.35, pulse: 0.45, melody: 0.55, extra: 0.25, companion: 0.3 },
  },
  you: {
    root: 53,
    scale: MAJOR,
    chords: [0, 5, 3, 4],
    seventh: true,
    signature: 'keys',
    pulse: 'lofi',
    melody: [4, -1, 5, 4, 2, -1, 0, -1, 1, -1, 2, -1, 4, -1, -1, -1],
    melodyOctave: 1,
    padCutoff: [450, 2200],
    reverb: 0.35,
    mix: { pad: 0.5, pulse: 0.6, melody: 0.4, extra: 0.3, companion: 0.4 },
  },
};

export const MENU_MUSIC: Record<'title' | 'map' | 'ending', { music: MusicConfig; period: number; layers: { pad: number; pulse: number; melody: number; extra: number } }> = {
  title: {
    music: { ...MUSIC.maya, chords: [0, 3], pulse: 'none', padCutoff: [900, 900] },
    period: 6,
    layers: { pad: 0.7, pulse: 0, melody: 0, extra: 0 },
  },
  map: {
    music: { ...MUSIC.sam, root: 53, signature: 'musicbox', pulse: 'none', melody: [4, -1, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, 1, -1, -1, -1] },
    period: 6,
    layers: { pad: 0.6, pulse: 0, melody: 0.5, extra: 0 },
  },
  ending: {
    music: MUSIC.you,
    period: 6,
    layers: { pad: 0.7, pulse: 0.5, melody: 0.6, extra: 0.4 },
  },
};

export const AUDIO = {
  // bpm = beatsPerBreath * 60 / period, so 8 beats per breath = 480 / T
  beatsPerBreath: 8,
  minBpm: 60,
  maxBpm: 240,
  tempoRamp: 1.2,
  breathGain: 0.55,
  npcBreathGain: 0.35,
  npcPan: -0.35,
  heartMinInterval: 0.42,
  heartMaxInterval: 1.1,
  heartGain: 0.9,
};

export interface SpikeConfig {
  // seconds of calm before this spike
  delay: number;
  // their period while it lasts (ignored in the final level, the spike hits you)
  period: number;
}

export type PlayPhase = 'match' | 'lead' | 'anchor';

// how a single breath is graded against the guide line
export const SCORING = {
  // "close" is within this many grace windows
  closeFactor: 2,
  closeValue: 0.5,
  syncValue: 1,
  // this many misses in a row shows the "follow the glowing line" hint
  missStreak: 3,
};

export interface LevelConfig {
  id: string;
  mode: 'lead' | 'follow';
  // which phases this level has, in order
  phases: PlayPhase[];
  panicPeriod: number;
  targetPeriod: number;
  inhaleFraction: number;
  // seconds around the guide's transitions where your inhale/exhale start counts as on time
  grace: number;
  // ±fraction of per-cycle period randomness during Match
  matchJitter: number;
  // breath points to finish each phase (in sync = 1, close = 0.5)
  matchBreaths: number;
  leadBreaths: number;
  // steady breaths needed to bring them back from each spike
  anchorSteadyBreaths: number;
  // the lose meter, per second
  panic: {
    fill: number;
    drain: number;
    // fills below this connection, drains above `safe`
    low: number;
    safe: number;
    // added on every missed breath
    missBump: number;
  };
  guide: {
    // opacity of the glowing line, lower = player has to feel it more
    alpha: number;
    spaceIcon: boolean;
  };
  anchor: {
    spikes: SpikeConfig[];
    // a breath during a spike is steady within ±this fraction of the target period
    tolerance: number;
    // s/s their period moves toward the spike period
    spikeRamp: number;
    // s/s back to the target, and how fast their phase slides back onto the guide
    recoverRate: number;
    outro: number;
  };
  // final level only, the guide circle leads and you follow
  follow?: {
    adaptRate: number;
    minPeriod: number;
    coupling: number;
    panicBoostRise: number;
    panicBoostFall: number;
  };
  // intrusive thoughts, pure visual/audio pressure
  distractions: {
    // seconds between thoughts in Lead/Anchor
    interval: [number, number];
    // extra thoughts per second while a spike is on
    spikeRate: number;
    pingChance: number;
    maxAlive: number;
    size: number;
  };
  bloomTime: number;
  // basics = the gated level 1 walkthrough, spike = one pause on the first spike
  tutorial?: 'basics' | 'spike';
  palette: Palette;
  weather: WeatherKind;
  // particle count multiplier
  weatherDensity: number;
  glitch: boolean;
  music: MusicConfig;
}

export const VISUAL = {
  npcX: 430,
  playerX: 850,
  centerY: 330,
  minRadius: 46,
  maxRadius: 128,
  // how far each circle slides toward the middle at high connection
  drift: 150,
  lockDrift: 210,
  lockAt: 0.95,
  lockHold: 1.5,
  ringGap: 26,
  // panic arc sits this far outside the calm ring
  panicGap: 16,
  maxShake: 7,
};

export const TUTORIAL = {
  // full breaths needed after the release line
  breaths: 2,
  // an inhale this long counts as a full breath
  minInhale: 0.5,
  // seconds each intro line stays before the next one (the ungated ones)
  meetTime: 3,
  lineTime: 4,
  ringTime: 3.5,
  // the first-spike pause in level 2
  spikePause: 2.8,
  // panic arc counts as "shown" past this
  panicShownAt: 0.08,
};

export const RESULT = {
  // fraction of play time spent in sync for 2 and 3 hearts, 1 heart is just finishing
  twoHearts: 0.45,
  threeHearts: 0.7,
  // game over: how long the circle takes to shrink away before the card shows
  fadeAway: 2,
};

// how anxious thoughts react to how you're doing
export const THOUGHTS = {
  // spawn interval multiplier: in sync -> slower, lost -> faster
  syncInterval: 2.2,
  lostInterval: 0.6,
  // never more than this many at once, never closer together than minGap seconds
  maxOnScreen: 3,
  minGap: 1.5,
  scaleSync: 0.8,
  scaleLost: 1.15,
  // dimmer when you're in sync, but they stay just as long
  alphaSync: 0.5,
  alphaLost: 0.9,
  // px/s outward from the circle, kept slow so they can be read
  speed: 12,
  // px/s pull toward the player when things are going badly
  towardPlayer: 14,
  // extra space kept between two thoughts
  spacing: 14,
  // keep out of the phase panel (top) and the breath wave (bottom)
  minY: 150,
  bottomMargin: 30,
};

// the speech bubble: what they say out loud
export const FACADE = {
  firstDelay: 2.5,
  // seconds between lines during Match, and the quieter pace after
  matchInterval: [6, 8] as [number, number],
  laterInterval: [13, 18] as [number, number],
  minTime: 2.5,
  // the honest line at the end stays a bit longer
  honestMin: 3.5,
  // gap between the honest line fading and the result card
  afterHonest: 0.4,
  fill: 0xf6f3ee,
  text: 0x1d1a2b,
};

export const WAVE = {
  height: 110,
  // "now" line position as a fraction of the width
  nowAt: 0.3,
  previewCycles: 2,
  // seconds of history kept for the player trace
  historySeconds: 20,
};

const ANCHOR_DEFAULTS: Omit<LevelConfig['anchor'], 'spikes'> = {
  tolerance: 0.15,
  spikeRamp: 2.5,
  recoverRate: 1.2,
  outro: 4,
};

// the difficulty curve lives in these per-level numbers:
// matchBreaths / leadBreaths / anchorSteadyBreaths, grace, panic.fill + missBump, spikes
export const LEVELS: LevelConfig[] = [
  {
    // ~60s, tutorial + Match + a short Lead, no Anchor
    id: 'maya',
    mode: 'lead',
    phases: ['match', 'lead'],
    panicPeriod: 3.0,
    targetPeriod: 4.5,
    inhaleFraction: 0.45,
    grace: 0.4,
    matchJitter: 0,
    matchBreaths: 3,
    leadBreaths: 4,
    anchorSteadyBreaths: 0,
    // very slow: only an idle player (connection ~0) loses, after ~20s
    panic: { fill: 0.05, drain: 0.2, low: 0.2, safe: 0.4, missBump: 0.02 },
    anchor: { ...ANCHOR_DEFAULTS, spikes: [] },
    guide: { alpha: 1, spaceIcon: true },
    distractions: { interval: [5, 8], spikeRate: 0, pingChance: 0.2, maxAlive: 2, size: 26 },
    bloomTime: 5,
    tutorial: 'basics',
    palette: PALETTES.maya,
    weather: 'paper',
    weatherDensity: 0.8,
    glitch: false,
    music: MUSIC.maya,
  },
  {
    // ~90s, all three phases, one short spike
    id: 'sam',
    mode: 'lead',
    phases: ['match', 'lead', 'anchor'],
    panicPeriod: 2.6,
    targetPeriod: 5.0,
    inhaleFraction: 0.45,
    grace: 0.35,
    matchJitter: 0,
    matchBreaths: 4,
    leadBreaths: 5,
    anchorSteadyBreaths: 3,
    panic: { fill: 0.07, drain: 0.16, low: 0.3, safe: 0.5, missBump: 0.04 },
    anchor: { ...ANCHOR_DEFAULTS, spikes: [{ delay: 5, period: 2.0 }], outro: 3 },
    guide: { alpha: 1, spaceIcon: true },
    distractions: { interval: [3.5, 6], spikeRate: 0.6, pingChance: 0.4, maxAlive: 3, size: 27 },
    bloomTime: 6,
    tutorial: 'spike',
    palette: PALETTES.sam,
    weather: 'fog',
    weatherDensity: 1,
    glitch: false,
    music: MUSIC.sam,
  },
  {
    // ~2 min, heavy thoughts
    id: 'dani',
    mode: 'lead',
    phases: ['match', 'lead', 'anchor'],
    panicPeriod: 2.2,
    targetPeriod: 5.5,
    inhaleFraction: 0.45,
    grace: 0.3,
    matchJitter: 0,
    matchBreaths: 5,
    leadBreaths: 6,
    anchorSteadyBreaths: 3,
    panic: { fill: 0.1, drain: 0.13, low: 0.35, safe: 0.55, missBump: 0.06 },
    anchor: {
      ...ANCHOR_DEFAULTS,
      spikes: [
        { delay: 6, period: 1.7 },
        { delay: 7, period: 1.6 },
      ],
    },
    guide: { alpha: 1, spaceIcon: false },
    distractions: { interval: [1.5, 3], spikeRate: 1, pingChance: 0.9, maxAlive: 3, size: 26 },
    bloomTime: 6,
    palette: PALETTES.dani,
    weather: 'cards',
    weatherDensity: 1.2,
    glitch: true,
    music: MUSIC.dani,
  },
  {
    // ~2 min, irregular breath in Match, faint guide
    id: 'harto',
    mode: 'lead',
    phases: ['match', 'lead', 'anchor'],
    panicPeriod: 2.6,
    targetPeriod: 6.0,
    inhaleFraction: 0.45,
    grace: 0.25,
    matchJitter: 0.2,
    matchBreaths: 5,
    leadBreaths: 7,
    anchorSteadyBreaths: 4,
    panic: { fill: 0.1, drain: 0.13, low: 0.35, safe: 0.55, missBump: 0.06 },
    anchor: {
      ...ANCHOR_DEFAULTS,
      spikes: [
        { delay: 7, period: 2.2 },
        { delay: 8, period: 2.0 },
      ],
    },
    guide: { alpha: 0.4, spaceIcon: false },
    distractions: { interval: [5, 9], spikeRate: 0.5, pingChance: 0.1, maxAlive: 2, size: 26 },
    bloomTime: 6,
    palette: PALETTES.harto,
    weather: 'snow',
    weatherDensity: 1,
    glitch: false,
    music: MUSIC.harto,
  },
  {
    // ~2.5 min, reversed: the band leads. slow panic, it's about being held
    id: 'you',
    mode: 'follow',
    phases: ['match', 'lead', 'anchor'],
    // where the guide starts before it has read your rhythm
    panicPeriod: 1.9,
    targetPeriod: 6,
    inhaleFraction: 0.45,
    grace: 0.3,
    matchJitter: 0,
    matchBreaths: 5,
    leadBreaths: 6,
    anchorSteadyBreaths: 3,
    panic: { fill: 0.06, drain: 0.16, low: 0.3, safe: 0.5, missBump: 0.03 },
    anchor: {
      ...ANCHOR_DEFAULTS,
      spikes: [
        { delay: 7, period: 6 },
        { delay: 8, period: 6 },
      ],
      outro: 5,
    },
    follow: {
      adaptRate: 0.8,
      minPeriod: 1.3,
      coupling: 0.25,
      panicBoostRise: 1.2,
      panicBoostFall: 0.5,
    },
    guide: { alpha: 1, spaceIcon: false },
    distractions: { interval: [2.5, 5], spikeRate: 1, pingChance: 0.6, maxAlive: 3, size: 28 },
    bloomTime: 9,
    palette: PALETTES.you,
    weather: 'storm',
    weatherDensity: 1,
    glitch: true,
    music: MUSIC.you,
  },
];

export const FINAL = {
  levelIndex: 4,
  crackTime: 1.4,
  arriveTime: 2.5,
  orbitGap: 24,
  // companion k joins once Match progress passes (k + 1) / count
  companionColors: [PALETTES.maya.npc, PALETTES.sam.npc, PALETTES.dani.npc, PALETTES.harto.npc],
};
