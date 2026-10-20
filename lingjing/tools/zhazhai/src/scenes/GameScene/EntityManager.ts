import type { Pig } from "../../objects/Pig";
import type { Block } from "../../objects/Block";
import type { Bird } from "../../objects/Bird";
import {
  LEVEL_HEIGHT,
  LEVEL_WIDTH,
  BIRD_HORIZONTAL_MARGIN,
  ENTITY_CLEANUP_CONFIG,
} from "../../config/GameConfig";
import Matter from "matter-js";

export class EntityManager {
  private pigs: Pig[] = [];
  private blocks: Block[] = [];
  private birds: Bird[] = [];

  private activePigsCache: Pig[] | null = null;
  private activeBlocksCache: Block[] | null = null;
  private activeBirdsCache: Bird[] | null = null;

  setPigs(pigs: Pig[]): void {
    this.pigs = pigs;
    this.activePigsCache = null;
  }

  getPigs(): Pig[] {
    return this.pigs;
  }

  getActivePigs(): Pig[] {
    if (this.activePigsCache !== null) {
      return this.activePigsCache;
    }

    this.activePigsCache = this.pigs.filter((p) => !p.isDestroyed());
    return this.activePigsCache;
  }

  markPigsDirty(): void {
    this.activePigsCache = null;
  }

  getPigById(id: string): Pig | undefined {
    return this.pigs.find((p) => p.id === id);
  }

  removePig(pig: Pig): void {
    const index = this.pigs.indexOf(pig);
    if (index > -1) {
      this.pigs.splice(index, 1);
      this.activePigsCache = null;
    }
  }

  setBlocks(blocks: Block[]): void {
    this.blocks = blocks;
    this.activeBlocksCache = null;
  }

  getBlocks(): Block[] {
    return this.blocks;
  }

  getActiveBlocks(): Block[] {
    if (this.activeBlocksCache !== null) {
      return this.activeBlocksCache;
    }
    this.activeBlocksCache = this.blocks.filter((b) => !b.isDestroyed());
    return this.activeBlocksCache;
  }

  markBlocksDirty(): void {
    this.activeBlocksCache = null;
  }

  getBlockById(id: string): Block | undefined {
    return this.blocks.find((b) => b.id === id);
  }

  removeBlock(block: Block): void {
    const index = this.blocks.indexOf(block);
    if (index > -1) {
      this.blocks.splice(index, 1);
      this.activeBlocksCache = null;
    }
  }

  addBird(bird: Bird): void {
    this.birds.push(bird);
    this.activeBirdsCache = null;
  }

  getBirds(): Bird[] {
    return this.birds;
  }

  getActiveBirds(): Bird[] {
    if (this.activeBirdsCache !== null) {
      return this.activeBirdsCache;
    }
    this.activeBirdsCache = this.birds.filter((b) => !b.isDestroyed());
    return this.activeBirdsCache;
  }

  markBirdsDirty(): void {
    this.activeBirdsCache = null;
  }

  /**
   * Mark all entity caches as dirty. Call this when entities may have been
   * destroyed externally (e.g., via damage) to ensure caches are refreshed.
   */
  markAllDirty(): void {
    this.activePigsCache = null;
    this.activeBlocksCache = null;
    this.activeBirdsCache = null;
  }

  removeBird(bird: Bird): void {
    const index = this.birds.indexOf(bird);
    if (index > -1) {
      this.birds.splice(index, 1);
      this.activeBirdsCache = null;
    }
  }

  clearAll(): void {
    this.pigs = [];
    this.blocks = [];
    this.birds = [];
    this.activePigsCache = null;
    this.activeBlocksCache = null;
    this.activeBirdsCache = null;
  }

  cleanupFallenEntities(): void {
    let pigDestroyed = false;
    let blockDestroyed = false;
    let birdDestroyed = false;

    this.pigs.forEach((pig) => {
      if (
        !pig.isDestroyed() &&
        pig.getPosition().y > LEVEL_HEIGHT + ENTITY_CLEANUP_CONFIG.yOffset
      ) {
        pig.destroy();
        pigDestroyed = true;
      }
    });

    this.blocks.forEach((block) => {
      if (
        !block.isDestroyed() &&
        block.getPosition().y > LEVEL_HEIGHT + ENTITY_CLEANUP_CONFIG.yOffset
      ) {
        block.destroy();
        blockDestroyed = true;
      }
    });

    this.birds.forEach((bird) => {
      if (!bird.isDestroyed()) {
        const pos = bird.getPosition();
        const outOfBounds =
          pos.y > LEVEL_HEIGHT + ENTITY_CLEANUP_CONFIG.yOffset ||
          pos.x < -BIRD_HORIZONTAL_MARGIN ||
          pos.x > LEVEL_WIDTH + BIRD_HORIZONTAL_MARGIN;
        if (outOfBounds) {
          bird.destroy();
          birdDestroyed = true;
        }
      }
    });

    if (pigDestroyed) this.markPigsDirty();
    if (blockDestroyed) this.markBlocksDirty();
    if (birdDestroyed) this.markBirdsDirty();
  }

  getActiveBodies(): Matter.Body[] {
    const bodies: Matter.Body[] = [];

    this.pigs.forEach((pig) => {
      const body = pig.getMatterImage()?.body;
      if (body && !pig.isDestroyed()) {
        bodies.push(body as Matter.Body);
      }
    });

    this.blocks.forEach((block) => {
      const body = block.getMatterImage()?.body;
      if (body && !block.isDestroyed()) {
        bodies.push(body as Matter.Body);
      }
    });

    this.birds.forEach((bird) => {
      const body = bird.getMatterImage()?.body;
      if (body && !bird.isDestroyed()) {
        bodies.push(body as Matter.Body);
      }
    });

    return bodies;
  }
}
