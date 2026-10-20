import type { Bird } from "../objects/Bird";
import type { Pig } from "../objects/Pig";
import type { Block } from "../objects/Block";
import { BirdFactory, type BirdCreateOptions } from "./BirdFactory";
import { PigFactory, type PigCreateOptions } from "./PigFactory";
import { BlockFactory, type BlockCreateOptions } from "./BlockFactory";

export interface IGameObjectFactory {
  createBird(scene: Phaser.Scene, options: BirdCreateOptions): Bird;
  createPig(scene: Phaser.Scene, options: PigCreateOptions): Pig;
  createBlock(scene: Phaser.Scene, options: BlockCreateOptions): Block;
}

export class GameObjectFactory implements IGameObjectFactory {
  private birdFactory?: BirdFactory;
  private pigFactory?: PigFactory;
  private blockFactory?: BlockFactory;

  constructor(birdFactory?: BirdFactory, pigFactory?: PigFactory, blockFactory?: BlockFactory) {
    this.birdFactory = birdFactory;
    this.pigFactory = pigFactory;
    this.blockFactory = blockFactory;
  }

  private getBirdFactory(): BirdFactory {
    if (!this.birdFactory) {
      this.birdFactory = new BirdFactory();
    }
    return this.birdFactory;
  }

  private getPigFactory(): PigFactory {
    if (!this.pigFactory) {
      this.pigFactory = new PigFactory();
    }
    return this.pigFactory;
  }

  private getBlockFactory(): BlockFactory {
    if (!this.blockFactory) {
      this.blockFactory = new BlockFactory();
    }
    return this.blockFactory;
  }

  public createBird(scene: Phaser.Scene, options: BirdCreateOptions): Bird {
    return this.getBirdFactory().create(scene, options);
  }

  public createPig(scene: Phaser.Scene, options: PigCreateOptions): Pig {
    return this.getPigFactory().create(scene, options);
  }

  public createBlock(scene: Phaser.Scene, options: BlockCreateOptions): Block {
    return this.getBlockFactory().create(scene, options);
  }
}

let _gameObjectFactory: GameObjectFactory | undefined;

export function getGameObjectFactory(): GameObjectFactory {
  if (!_gameObjectFactory) {
    _gameObjectFactory = new GameObjectFactory();
  }
  return _gameObjectFactory;
}

export const gameObjectFactory = getGameObjectFactory();
