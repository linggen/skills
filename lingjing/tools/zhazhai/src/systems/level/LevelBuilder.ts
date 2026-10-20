import type { Pig } from "../../objects/Pig";
import type { Block } from "../../objects/Block";
import type { IVFXManager } from "../../interfaces/IVFXManager";
import type { IWakeCascadeManager } from "../../interfaces/IWakeCascadeManager";
import { BlockMaterial } from "../../constants/Materials";
import { PigSize } from "../../constants";
import { LevelData } from "../../data/levels";
import { VIEWPORT_WIDTH } from "../../config";
import {
  ILevelBuilder,
  LevelBuilderDeps,
  LevelBuilderCallbacks,
  LevelBuildResult,
} from "./ILevelBuilder";
import { BlockFactory } from "../../factories/BlockFactory";
import { PigFactory } from "../../factories/PigFactory";
import { attachTarget, lookOf } from "../../zhazhai/targets";
import { skinBlock } from "../../zhazhai/props";

export class LevelBuilder implements ILevelBuilder {
  private scene: Phaser.Scene;
  private vfxManager: IVFXManager;
  private wakeManager: IWakeCascadeManager;
  private blockFactory: BlockFactory;
  private pigFactory: PigFactory;
  private pigs: Pig[] = [];
  private blocks: Block[] = [];
  private callbacks: LevelBuilderCallbacks | null = null;
  private isDestroyed: boolean = false;

  constructor(deps: LevelBuilderDeps) {
    this.scene = deps.scene;
    this.vfxManager = deps.vfxManager;
    this.wakeManager = deps.wakeManager;
    this.blockFactory = new BlockFactory(this.wakeManager);
    this.pigFactory = new PigFactory(this.wakeManager);
  }

  build(levelData: LevelData, groundY: number, callbacks: LevelBuilderCallbacks): LevelBuildResult {
    this.callbacks = callbacks;
    this.pigs = [];
    this.blocks = [];

    this.createPigs(levelData, groundY);
    this.createBlocks(levelData);

    return {
      pigs: this.pigs,
      blocks: this.blocks,
    };
  }

  private createPigs(levelData: LevelData, groundY: number): void {
    const pigPositions = levelData.pigs ?? [
      { x: VIEWPORT_WIDTH * 0.7, y: groundY - 40, size: PigSize.MEDIUM },
      { x: VIEWPORT_WIDTH * 0.75, y: groundY - 40, size: PigSize.MEDIUM },
      { x: VIEWPORT_WIDTH * 0.72, y: groundY - 100, size: PigSize.SMALL },
    ];

    // 砸寨: a story throw's target (the stag, the 鯥) is a pig of its own painting and behaviour, its foot where the
    // level puts the pig's.
    const target = levelData.target;
    const look = target ? lookOf(target) : undefined;
    pigPositions.forEach((pos) => {
      const size = pos.size ?? PigSize.MEDIUM;
      const foot = pos.y + ({ [PigSize.SMALL]: 35, [PigSize.MEDIUM]: 70, [PigSize.LARGE]: 105 } as Record<PigSize, number>)[size];
      const y = look ? foot - look.height / 2 : pos.y;
      const pig = this.pigFactory.create(this.scene, { x: pos.x, y, size, look });
      if (target) attachTarget(this.scene, pig, target);

      pig.callbacks.vfxManager = this.vfxManager;
      pig.callbacks.onDestroyed = () => {
        this.callbacks?.onPigDestroyed(pig);
      };

      this.pigs.push(pig);
    });
  }

  private createBlocks(levelData: LevelData): void {
    const blockData = levelData.structures ?? [];

    if (blockData.length === 0) {
      return;
    }

    blockData.forEach((block) => {
      const material = block.material ?? BlockMaterial.WOOD;

      const newBlock = this.blockFactory.create(this.scene, {
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
        material,
        rotation: block.rotation,
        elementIndex: block.elementIndex,
      });

      newBlock.setStatic(true);
      // 砸寨: rooted (stays static, never breaks) and drawn as the thing it is.
      newBlock.fixed = Boolean(block.fixed);
      if (block.skin) skinBlock(this.scene, newBlock, block.skin, block.width, block.height);
      if (block.hidden) newBlock.getMatterImage()?.setAlpha(0);

      newBlock.callbacks.onDestroyed = (
        block: Block,
        impactSpeed: number,
        impactAngle: number,
        impactX?: number,
        impactY?: number
      ) => {
        this.callbacks?.onBlockDestroyed(block, impactSpeed, impactAngle, impactX, impactY);
      };

      newBlock.callbacks.onDamage = (
        block: Block,
        damage: number,
        health: number,
        impactSpeed: number,
        impactAngle: number,
        impactX?: number,
        impactY?: number
      ) => {
        this.callbacks?.onBlockDamaged(
          block,
          damage,
          health,
          impactSpeed,
          impactAngle,
          impactX,
          impactY
        );
      };

      newBlock.callbacks.onExplode = (block: Block) => {
        this.callbacks?.onBlockExplode(block);
      };

      this.blocks.push(newBlock);
    });
  }

  enableBlockPhysics(): void {
    this.blocks.forEach((block) => {
      if (!block.isDestroyed() && !block.fixed) {
        block.setStatic(false);
        block.sleep();
      }
    });

    this.pigs.forEach((pig) => {
      if (!pig.isDestroyed()) {
        pig.sleep();
      }
    });
  }

  getPigs(): Pig[] {
    return this.pigs;
  }

  getBlocks(): Block[] {
    return this.blocks;
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.pigs = [];
    this.blocks = [];
    this.callbacks = null;
  }
}
