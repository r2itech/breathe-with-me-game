import { Circle, Container, Graphics, Text } from 'pixi.js';
import type { LayerLevels } from '../audio/LevelSong';
import { LevelRun, type Phase } from '../breath/LevelRun';
import type { Game } from '../core/Game';
import type { Action } from '../core/Input';
import { Scene } from '../core/Scene';
import { FONT, VIEW_H, VIEW_W } from '../core/view';
import { FACADE, LEVELS, RESULT, TEXT_TIMING, TUTORIAL, VISUAL, WAVE, type InstrumentKind, type PlayPhase } from '../data/levels';
import { TEXT } from '../data/text';
import { Distractions } from '../fx/Distractions';
import { LevelVisuals } from '../fx/LevelVisuals';
import { PANIC_RED, Vignette } from '../fx/PanicArc';
import { BreathWave } from '../ui/BreathWave';
import { Caption } from '../ui/Caption';
import { Card } from '../ui/Card';
import { DebugOverlay } from '../ui/DebugOverlay';
import { Menu, type MenuItem } from '../ui/Menu';
import { PhaseBanner } from '../ui/PhaseBanner';
import { PhasePanel } from '../ui/PhasePanel';
import { Pops } from '../ui/Pops';
import { SpeechBubble } from '../ui/SpeechBubble';
import { SyncLabel } from '../ui/SyncLabel';
import { Tutorial } from '../ui/Tutorial';
import { goLevel, goMap } from './flow';
import { PauseOverlay } from './PauseOverlay';

type Stage = 'card' | 'tutorial' | 'intro' | 'play' | 'honest' | 'failing' | 'failed' | 'result' | 'leaving';

const NICE_COOLDOWN = 6;

export class LevelScene extends Scene {
  protected run: LevelRun;
  protected stage: Stage = 'card';
  protected world = new Container();
  protected ui = new Container();
  protected visuals: LevelVisuals;
  protected thoughts: Distractions;
  protected wave: BreathWave;
  protected caption: Caption;
  protected panel: PhasePanel;
  protected banner: PhaseBanner;
  protected pops = new Pops();
  protected syncLabel: SyncLabel;
  protected vignette = new Vignette();
  private hint: Text;
  private pauseButton = new Container();
  private hintAlpha = 0;
  private introCard: Card;
  private beginPrompt!: Text;
  private endCard: Card | null = null;
  private cardMenu: Menu | null = null;
  private endPrompt: Text | null = null;
  private cardTime = 0;
  private prevHeld = true;
  private failT = 0;
  private debug = new DebugOverlay();
  private offInput: (() => void) | null = null;
  private paused = false;
  private resumedAt = 0;
  private lastNice = -99;
  private hudAlpha = 0;
  protected tutorial: Tutorial | null;
  // level 2's first spike stops the clock for a moment
  private freezeT = 0;
  // what they say out loud, on a timer
  protected bubble = new SpeechBubble();
  private facadeTimer: number = FACADE.firstDelay;
  private facadeIndex = 0;
  private honestWait = 0;

  constructor(
    protected game: Game,
    readonly index: number,
    protected onFinish: () => void,
  ) {
    super();
    this.run = new LevelRun(LEVELS[index]);
    const run = this.run;
    const cfg = run.cfg;
    const accent = cfg.palette.player;

    this.visuals = this.makeVisuals();
    this.world.addChild(this.visuals.root);

    this.hint = new Text({
      text: '',
      style: { fontFamily: FONT, fontSize: 24, fill: 0xffffff, fontWeight: '600', align: 'center', wordWrap: true, wordWrapWidth: 940 },
    });
    this.hint.anchor.set(0.5);
    this.hint.position.set(VIEW_W / 2, VIEW_H - WAVE.height - 32);
    this.hint.alpha = 0;

    this.caption = new Caption(VIEW_W / 2, VIEW_H - WAVE.height - 60);

    const names = run.phases.map((p) => (run.follow ? TEXT.hud.finalSteps : TEXT.hud.steps)[p]);
    this.panel = new PhasePanel(names, accent);
    this.banner = new PhaseBanner(accent);
    this.banner.onLanded = () => this.panel.flash();
    this.syncLabel = new SyncLabel(this.levelText.lost);

    this.introCard = this.buildIntroCard();

    // their thoughts wear their color; in the final level they're yours
    this.thoughts = new Distractions(cfg.distractions, this.levelText.thoughts, run.follow ? cfg.palette.player : cfg.palette.npc);
    this.thoughts.onSpawn = (ping) => (ping ? this.game.audio.ping() : this.game.audio.pop());
    this.tutorial = cfg.tutorial ? new Tutorial(cfg.tutorial) : null;
    this.thoughts.onFirst = () => this.tutorial?.notice('thoughts');
    if (this.tutorial) {
      this.visuals.npcAlpha = this.tutorial.npc;
      this.visuals.ringAlpha = this.tutorial.ring;
    }
    this.wave = new BreathWave(accent, cfg.guide.spaceIcon);

    this.ui.addChild(
      this.vignette.root,
      this.thoughts.root,
      this.bubble.root,
      this.wave.root,
      this.syncLabel.root,
      this.pops.root,
      this.panel.root,
      this.hint,
      this.caption.root,
      this.banner.root,
      this.pauseButton,
      this.introCard.root,
      this.debug.root,
    );
    this.buildPauseButton();
    this.root.addChild(this.world, this.ui);
    this.hookEvents();
  }

  // cards are just text over a slow breath
  get maxFps(): number {
    return this.stage === 'card' || this.stage === 'failed' || this.stage === 'result' ? 30 : 60;
  }

  // left of the pause button
  get soundIconSlot(): number {
    return 76 * this.game.uiScale;
  }

  get levelText() {
    return TEXT.levels[this.index];
  }

  // top-right, mostly for touch; Esc still works everywhere
  private buildPauseButton(): void {
    const b = this.pauseButton;
    const g = new Graphics();
    g.circle(0, 0, 26).fill({ color: 0x0b0918, alpha: 0.55 });
    g.circle(0, 0, 26).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
    g.roundRect(-8, -10, 5, 20, 2).fill({ color: 0xffffff, alpha: 0.85 });
    g.roundRect(3, -10, 5, 20, 2).fill({ color: 0xffffff, alpha: 0.85 });
    b.addChild(g);
    b.eventMode = 'static';
    b.cursor = 'pointer';
    b.hitArea = new Circle(0, 0, 34);
    b.alpha = 0;
    b.on('pointertap', () => {
      if (!this.paused && this.stage !== 'leaving' && this.stage !== 'failed' && this.stage !== 'result') this.openPause();
    });
  }

  // browser back mid-level just pauses, it never throws you out of the level
  back(): void {
    if (this.paused || this.stage === 'leaving' || performance.now() - this.resumedAt < 150) return;
    this.openPause();
  }

  autoPause(): void {
    if (this.paused || this.stage === 'leaving' || this.stage === 'failed' || this.stage === 'result') return;
    this.openPause();
  }

  private buildIntroCard(): Card {
    const lt = this.levelText;
    const pal = this.run.cfg.palette;
    const card = new Card(660, 340, pal.player);
    card.setScale(this.game.uiScale);
    card.addText(lt.name, -110, 44, 0xfff4ea, '700');
    card.addText(lt.intro.join('\n'), -30, 22, 0xd8d0ec, '400', true);
    card.addText(lt.goal, 55, 25, pal.player, '700');
    this.beginPrompt = card.addText(TEXT.cards.begin, 125, 17, 0xb9b3d6, '600');
    return card;
  }

  // shared layout for game over and level complete
  private showEndCard(build: (card: Card) => void, items: MenuItem[]): void {
    const card = new Card(620, 400, this.run.cfg.palette.player, 0.7);
    card.setScale(this.game.uiScale);
    build(card);
    const prompt = items.length > 1 ? TEXT.cards.choosePrompt : TEXT.cards.continuePrompt;
    this.endPrompt = card.addText(prompt, 180, 15, 0xb9b3d6, '600');
    this.endPrompt.alpha = 0;
    const menu = new Menu(this.game, items, { x: VIEW_W / 2, y: VIEW_H / 2 + 100 * this.game.uiScale, spacing: 46, size: 26 });
    // stays until you answer; ignore input for a moment so a held breath can't skip it
    menu.enabled = false;
    card.root.addChild(menu.root);
    this.ui.addChild(card.root);
    card.show();
    this.endCard = card;
    this.cardMenu = menu;
    this.cardTime = 0;
  }

  private showGameOver(): void {
    const lt = this.levelText;
    const game = this.game;
    const index = this.index;
    this.stage = 'failed';
    this.showEndCard(
      (card) => {
        card.addText(lt.gameOver, -90, 34, 0xfff4ea, '700');
        card.addText(TEXT.cards.tryAgain, -35, 24, 0xd8d0ec, '400', true);
      },
      [
        { kind: 'button', label: TEXT.cards.retry, action: () => this.leave(() => goLevel(game, index)) },
        { kind: 'button', label: TEXT.cards.backToMap, action: () => this.leave(() => goMap(game, { focus: index })) },
      ],
    );
  }

  private showResult(): void {
    const run = this.run;
    const lt = this.levelText;
    const pct = run.activeTime > 0 ? run.syncTime / run.activeTime : 0;
    const hearts = 1 + (pct >= RESULT.twoHearts ? 1 : 0) + (pct >= RESULT.threeHearts ? 1 : 0);
    const best = this.game.save.setHearts(this.index, hearts);
    this.stage = 'result';
    this.showEndCard(
      (card) => {
        card.addText(lt.calm, -140, 36, 0xfff4ea, '700');
        card.addText(lt.outro.join('\n'), -78, 19, 0xd8d0ec, '400', true);
        card.addHearts(-8, hearts, 3, 0xff8fa0);
        const pctText = TEXT.cards.inSync(Math.round(pct * 100));
        card.addText(`${TEXT.cards.breaths(run.player.breaths)}   ·   ${pctText}`, 42, 18, 0xb9b3d6, '600');
        if (best) card.addText(TEXT.cards.newBest, 72, 15, run.cfg.palette.player, '700');
      },
      [{ kind: 'button', label: TEXT.cards.cont, action: () => this.leave(() => this.onFinish()) }],
    );
  }

  private leave(go: () => void): void {
    if (this.stage === 'leaving') return;
    this.stage = 'leaving';
    go();
  }
  private hookEvents(): void {
    const ev = this.run.events;
    const audio = this.game.audio;
    ev.phase = (p) => this.onPhase(p);
    ev.spikeStart = () => {
      audio.spike();
      const tut = this.tutorial;
      if (tut?.kind === 'spike' && this.run.spikeIndex === 0 && this.freezeT <= 0) {
        this.freezeT = TUTORIAL.spikePause;
        tut.notice('spike');
      }
    };
    ev.phaseDone = (p, i) => this.onPhaseDone(p, i);
    ev.syncedBreath = () => {
      if (this.run.time - this.lastNice < NICE_COOLDOWN) return;
      this.lastNice = this.run.time;
      this.tutorial?.notice('synced');
      this.pop(TEXT.hud.pops.nice, 'player', this.run.cfg.palette.player);
    };
    ev.tooFast = () => {
      if (this.run.inSpike) return;
      this.pop(TEXT.hud.pops.tooFast, 'player', 0xffe27a);
    };
    ev.followed = () => this.pop(TEXT.hud.pops.dontFollow, 'player', PANIC_RED);
    ev.missStreak = () => {
      this.pop(TEXT.hud.pops.follow, 'player', 0xfff1d8);
      this.wave.pulse();
    };
    ev.failed = () => this.onFailed();
  }

  protected pop(label: string, near: 'player' | 'npc', color: number, big = false): void {
    const v = this.visuals;
    const x = near === 'player' ? v.playerX : v.npcX;
    this.pops.spawn(label, x, v.y - VISUAL.maxRadius - 20, color, big);
  }

  enter(): void {
    this.offInput = this.game.input.on((a) => this.onAction(a));
    this.introCard.show();
    this.cardTime = 0;
    const cfg = this.run.cfg;
    this.game.audio.startLevelSong(cfg.music, this.companionKinds(), cfg.panicPeriod);
  }

  pause(): void {
    this.paused = true;
    if (this.cardMenu) this.cardMenu.enabled = false;
    this.game.audio.pause();
    this.game.shakeX = 0;
    this.game.shakeY = 0;
  }

  resume(): void {
    this.paused = false;
    if (this.cardMenu) this.cardMenu.enabled = true;
    // the Esc that closed the pause menu shouldn't reopen it
    this.resumedAt = performance.now();
    this.game.audio.resume();
  }

  private openPause(): void {
    const game = this.game;
    const index = this.index;
    game.scenes.push(
      new PauseOverlay(game, {
        restart: () => goLevel(game, index),
        toMap: () => goMap(game, { focus: index }),
      }),
    );
  }

  // signature instruments of the people already helped
  protected companionKinds(): InstrumentKind[] {
    return LEVELS.slice(0, Math.min(this.index, 4)).map((l) => l.music.signature);
  }

  protected songLayers(): LayerLevels {
    const run = this.run;
    const c = run.connection;
    const calm = run.calm;
    const playing = this.stage === 'play' || this.stage === 'honest' || this.stage === 'result';
    const blooming = run.phase === 'bloom' || run.phase === 'done';
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    const pulse = !playing ? 0.2 : run.phase === 'match' ? 0.35 + 0.4 * c : 0.6 + 0.4 * c;
    const melody = blooming ? 1 : clamp01((c - 0.4) / 0.4) * (0.3 + 0.7 * calm);
    const extra = blooming ? 1 : clamp01((calm - 0.55) / 0.35);
    const comp = blooming ? 1 : clamp01((c - 0.7) / 0.25) * clamp01(calm * 2);
    return { pad: 1, pulse, melody, extra, companions: this.companionKinds().map(() => comp) };
  }

  protected updateAudio(dt: number): void {
    const run = this.run;
    const audio = this.game.audio;
    audio.setSongState(run.npc.period, this.songLayers(), run.calm);
    const look = run.follow ? run.playerPanic : run.npcPanic;
    const meter = run.active ? run.panicMeter : 0;
    const quiet = this.stage === 'leaving' || this.stage === 'failed' || this.stage === 'result';
    audio.updateBreath(
      dt,
      { lung: run.player.lung, inhaling: run.player.state === 'in' },
      { lung: run.npc.lung, inhaling: run.npc.state === 'in' },
      quiet ? 0 : Math.max(look, meter),
      quiet ? 0 : Math.max(look * 0.35, meter),
    );
  }

  exit(): void {
    this.offInput?.();
    this.offInput = null;
    this.game.shakeX = 0;
    this.game.shakeY = 0;
    const run = this.run;
    this.game.save.addStats(run.player.breaths, run.syncTime, run.time);
    this.cardMenu?.destroy();
    this.cardMenu = null;
  }

  protected makeVisuals(): LevelVisuals {
    return new LevelVisuals(this.run.cfg, () => this.game.settings.reduceMotion, () => this.game.lowQuality);
  }

  protected onAction(a: Action): void {
    if (this.paused) return;
    if (a === 'debug') this.debug.toggle();
    else if (a === 'confirm' && this.stage === 'card') this.closeIntroCard();
    else if (a === 'confirm' && this.stage === 'intro') this.caption.skip();
    else if (a === 'back' && this.stage !== 'leaving' && performance.now() - this.resumedAt > 150) this.openPause();
  }

  private closeIntroCard(): void {
    if (this.stage !== 'card' || this.cardTime < TEXT_TIMING.cardPromptDelay) return;
    this.introCard.hide();
    this.stage = 'intro';
    this.afterIntroCard();
  }

  // the level 1 tutorial slots in here
  protected afterIntroCard(): void {
    const tut = this.tutorial;
    if (tut?.kind === 'basics') {
      this.stage = 'tutorial';
      tut.onReady = () => this.startPlay();
      tut.start();
      this.visuals.npcAlpha = tut.npc;
      this.visuals.ringAlpha = tut.ring;
    } else {
      this.startPlay();
    }
  }

  protected startPlay(): void {
    this.stage = 'play';
    this.showBanner(this.run.phase);
  }

  protected phaseName(p: PlayPhase): string {
    return (this.run.follow ? TEXT.hud.finalSteps : TEXT.hud.steps)[p];
  }

  protected showBanner(p: Phase): void {
    if (p !== 'match' && p !== 'lead' && p !== 'anchor') return;
    const i = this.run.phases.indexOf(p);
    this.banner.show(TEXT.hud.stepOf(i + 1, this.run.phases.length, this.phaseName(p)), this.levelText.objectives[p], p);
  }

  protected onPhase(p: Phase): void {
    if (this.stage !== 'play') return;
    this.showBanner(p);
    if (p === 'bloom') this.game.audio.songBloom();
    if (p === 'done') this.finishLevel();
  }

  protected onPhaseDone(p: PlayPhase, i: number): void {
    this.visuals.calmRing.complete(i);
    this.game.audio.chime();
    this.pop(TEXT.hud.pops.done[p], 'npc', this.run.cfg.palette.ring, true);
  }

  protected onFailed(): void {
    // they shrink away first, then the card
    this.stage = 'failing';
    this.failT = 0;
  }

  // they say the one true thing, then the result card
  protected finishLevel(): void {
    this.stage = 'honest';
    this.bubble.say(this.levelText.honest, FACADE.honestMin);
    this.honestWait = this.bubble.remaining + FACADE.afterHonest;
  }

  // who's talking: them, or you in the final level
  protected facadeSpeaker(): 'npc' | 'player' {
    return this.run.follow ? 'player' : 'npc';
  }

  private updateSpeech(dt: number): void {
    const run = this.run;
    if (this.stage === 'play' && run.active && !this.bubble.busy) {
      this.facadeTimer -= dt;
      if (this.facadeTimer <= 0) {
        const lines = this.levelText.facade;
        this.bubble.say(lines[this.facadeIndex % lines.length]);
        this.facadeIndex++;
        const [a, b] = run.phase === 'match' ? FACADE.matchInterval : FACADE.laterInterval;
        this.facadeTimer = a + Math.random() * (b - a);
      }
    }
    if (this.stage === 'honest') {
      this.honestWait -= dt;
      if (this.honestWait <= 0) this.showResult();
    }
    const v = this.visuals;
    // the honest line comes from whoever wore the facade (you, in the final level)
    const x = this.facadeSpeaker() === 'npc' ? v.npcX : v.playerX;
    this.bubble.update(dt, x, v.y - VISUAL.maxRadius - VISUAL.ringGap - 6);
  }

  update(dt: number): void {
    const held = this.game.input.held;
    const freshPress = held && !this.prevHeld;
    this.prevHeld = held;
    const run = this.run;
    run.panicFrozen = this.banner.active || this.freezePanic();
    // circles keep breathing on cards/intros, phases only advance in play
    const frozen = this.freezeT > 0;
    if (frozen) this.freezeT -= dt;
    else if (this.stage === 'play') run.update(dt, held);
    else run.idle(dt, held);
    const tut = this.tutorial;
    if (tut && (this.stage === 'tutorial' || this.stage === 'play')) tut.update(dt, run);

    this.cardTime += dt;
    if (this.stage === 'card' && freshPress) this.closeIntroCard();
    const promptOn = this.cardTime >= TEXT_TIMING.cardPromptDelay;
    const promptAlpha = promptOn ? Math.min(1, (this.cardTime - TEXT_TIMING.cardPromptDelay) * 3) * (0.6 + 0.3 * Math.sin(this.cardTime * 2.4)) : 0;
    this.beginPrompt.alpha = promptAlpha;
    if (this.endPrompt) this.endPrompt.alpha = promptAlpha;
    if (this.cardMenu && promptOn && !this.paused) {
      this.cardMenu.enabled = true;
      if (freshPress && (this.stage === 'failed' || this.stage === 'result')) this.cardMenu.activateCurrent();
    }
    this.introCard.update(dt);
    this.endCard?.update(dt);
    this.cardMenu?.update(dt);

    if (this.stage === 'failing') {
      this.failT += dt;
      const u = Math.min(1, this.failT / RESULT.fadeAway);
      this.visuals.npcScale = 1 - 0.7 * u;
      this.visuals.npcAlpha = 1 - u;
      if (u >= 1) this.showGameOver();
    }

    this.caption.update(dt);
    this.banner.update(dt);
    this.pops.update(dt);
    this.updateSpeech(dt);
    this.updateHints(dt);
    this.debug.update(dt, run);

    const v = this.visuals;
    const showUi = this.stage === 'play' || this.stage === 'honest' || this.stage === 'tutorial' || this.stage === 'failing' || this.stage === 'result';
    if (tut && this.stage !== 'failing') {
      const k = Math.min(1, dt * 1.2);
      v.npcAlpha += (tut.npc - v.npcAlpha) * k;
      v.ringAlpha += (tut.ring - v.ringAlpha) * k;
    }
    v.uiAlpha += ((showUi ? 1 : 0) - v.uiAlpha) * Math.min(1, dt * 1.5);
    v.update(dt, run);

    this.hudAlpha += ((this.hudVisible() ? 1 : 0) - this.hudAlpha) * Math.min(1, dt * 2);
    this.panel.root.alpha = this.hudAlpha;
    this.layoutHud();
    this.syncLabel.root.alpha = this.hudAlpha;
    if (tut && this.stage === 'tutorial') this.wave.shown += (tut.wave - this.wave.shown) * Math.min(1, dt * 1.5);
    else this.wave.shown = Math.max(this.hudAlpha, this.stage === 'play' ? this.wave.shown : 0);
    if (run.active) this.panel.update(dt, run.phaseIndex, this.levelText.objectives[run.phase as PlayPhase], run.progress);
    this.syncLabel.update(v.playerX, v.y + VISUAL.maxRadius + 30, run.connection, run.player.hasBreathed);
    this.vignette.update(dt, run.active && this.stage === 'play' ? run.panicMeter : 0);
    this.wave.update(dt, run, run.cfg.guide.alpha, frozen);

    if (this.stage === 'play' && !frozen) {
      const src = run.follow
        ? { x: v.playerX, y: v.y, radius: v.radius(run.player.lung) }
        : { x: v.npcX, y: v.y, radius: v.radius(run.npc.lung) };
      this.thoughts.update(dt, run, this.game.settings.reduceMotion, src, { x: v.playerX, y: v.y });
    }
    this.game.shakeX = v.shakeX;
    this.game.shakeY = v.shakeY;
    this.updateAudio(dt);
  }

  // persistent hint when no tutorial line is up, the final level uses it
  protected hintText(): string {
    return '';
  }

  private updateHints(dt: number): void {
    const want = this.tutorial?.line || this.hintText();
    if (this.hint.text !== want) {
      this.hintAlpha = Math.max(0, this.hintAlpha - dt * 2);
      if (this.hintAlpha <= 0) this.hint.text = want;
    } else if (want) {
      this.hintAlpha = Math.min(0.85, this.hintAlpha + dt * 1.2);
    }
    this.hint.alpha = this.hintAlpha;
  }

  // keep HUD bits out of notches and big enough to read on phones
  private layoutHud(): void {
    const g = this.game;
    const k = g.uiScale;
    const safe = g.safe;
    const p = this.panel.root;
    p.pivot.set(VIEW_W / 2, 0);
    p.position.set(VIEW_W / 2, safe.top);
    p.scale.set(k);
    this.hint.scale.set(k);
    if (this.hint.style.wordWrapWidth !== 1100 / k) this.hint.style.wordWrapWidth = 1100 / k;
    this.syncLabel.root.scale.set(k);
    const pb = this.pauseButton;
    pb.scale.set(k);
    pb.position.set(VIEW_W - 44 * k - safe.right, 44 * k + safe.top);
    const showPause = this.stage !== 'leaving' && this.stage !== 'failed' && this.stage !== 'result';
    pb.alpha += ((showPause ? 1 : 0) - pb.alpha) * 0.2;
    pb.eventMode = showPause ? 'static' : 'none';
  }

  protected hudVisible(): boolean {
    return this.stage === 'play' || this.stage === 'failing';
  }

  // tutorial lines hold the meter too
  protected freezePanic(): boolean {
    return !!this.tutorial?.lineActive || this.freezeT > 0;
  }
}
