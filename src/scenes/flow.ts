import type { Game } from '../core/Game';
import { FINAL } from '../data/levels';
import { CityMapScene, type MapOptions } from './CityMapScene';
import { EndingScene } from './EndingScene';
import { FinalLevelScene } from './FinalLevelScene';
import { LevelScene } from './LevelScene';
import { TitleScene } from './TitleScene';
import { WarningScene } from './WarningScene';

export function goWarning(game: Game): void {
  game.scenes.goto(new WarningScene(game), 0.8);
}

export function goTitle(game: Game): void {
  game.scenes.goto(new TitleScene(game), 1);
}

export function goMap(game: Game, opts: MapOptions = {}): void {
  game.scenes.goto(new CityMapScene(game, opts), 1);
}

export function goEnding(game: Game): void {
  game.scenes.goto(new EndingScene(game), 1.5);
}

export function goLevel(game: Game, index: number): void {
  const done = () => finishLevel(game, index);
  const scene = index === FINAL.levelIndex ? new FinalLevelScene(game, done) : new LevelScene(game, index, done);
  game.scenes.goto(scene, 1);
}

function finishLevel(game: Game, index: number): void {
  game.save.completeLevel(index);
  if (index === FINAL.levelIndex - 1) {
    // no map in between, the screen cracks right after the last person
    goLevel(game, FINAL.levelIndex);
  } else if (index === FINAL.levelIndex) {
    game.save.data.finished = true;
    game.save.write();
    goMap(game, { celebrate: true });
  } else {
    goMap(game, { focus: index + 1, justHelped: index });
  }
}
