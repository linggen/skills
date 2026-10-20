import { Pig } from "../../objects/Pig";
import { Block } from "../../objects/Block";
import { LevelData } from "../../data/levels";
import type { IVFXManager } from "../../interfaces/IVFXManager";
import type { IWakeCascadeManager } from "../../interfaces/IWakeCascadeManager";

export interface LevelBuildResult {
  pigs: Pig[];
  blocks: Block[];
}

export interface LevelBuilderCallbacks {
  onPigDestroyed: (pig: Pig) => void;
  onBlockDestroyed: (
    block: Block,
    impactSpeed: number,
    impactAngle: number,
    impactX?: number,
    impactY?: number
  ) => void;
  onBlockDamaged: (
    block: Block,
    damage: number,
    health: number,
    impactSpeed: number,
    impactAngle: number,
    impactX?: number,
    impactY?: number
  ) => void;
  onBlockExplode: (block: Block) => void;
}

export interface ILevelBuilder {
  build(levelData: LevelData, groundY: number, callbacks: LevelBuilderCallbacks): LevelBuildResult;
  enableBlockPhysics(): void;
  getPigs(): Pig[];
  getBlocks(): Block[];
  destroy(): void;
}

export interface LevelBuilderDeps {
  scene: Phaser.Scene;
  vfxManager: IVFXManager;
  wakeManager: IWakeCascadeManager;
}
