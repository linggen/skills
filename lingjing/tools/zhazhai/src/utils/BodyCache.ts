import Matter from "matter-js";
import Phaser from "phaser";
import { BODY_CACHE_CONFIG } from "../config/PhysicsConfig";

const MS_PER_FRAME = 16.67;

export class BodyCache {
  private static instance: BodyCache | null = null;
  private cachedBodies: Matter.Body[] | null = null;
  private cacheFrame: number = -1;
  private cacheExpiryMs: number;
  private scene!: Phaser.Scene | null;

  private constructor() {
    this.cacheExpiryMs = BODY_CACHE_CONFIG.normalExpiryFrames * MS_PER_FRAME;
  }

  static getInstance(): BodyCache {
    if (!BodyCache.instance) {
      BodyCache.instance = new BodyCache();
    }
    return BodyCache.instance;
  }

  initialize(scene: Phaser.Scene): void {
    this.scene = scene;
    this.cachedBodies = null;
    this.cacheFrame = -1;
  }

  setDestructionMode(enabled: boolean): void {
    this.cacheExpiryMs = enabled
      ? BODY_CACHE_CONFIG.destructionModeExpiryFrames * MS_PER_FRAME
      : BODY_CACHE_CONFIG.normalExpiryFrames * MS_PER_FRAME;
  }

  reset(): void {
    this.cachedBodies = null;
    this.cacheFrame = -1;
  }

  destroy(): void {
    this.cachedBodies = null;
    this.cacheFrame = -1;
    this.scene = null;
  }

  getAllBodies(engine: Matter.Engine): Matter.Body[] {
    const currentMs = this.scene?.time?.now ?? 0;
    if (this.cachedBodies !== null && currentMs - this.cacheFrame < this.cacheExpiryMs) {
      return this.cachedBodies;
    }

    this.cachedBodies = Matter.Composite.allBodies(engine.world as unknown as Matter.Composite);
    this.cacheFrame = currentMs;
    return this.cachedBodies;
  }

  getBodiesInRegion(
    engine: Matter.Engine,
    bounds: { min: { x: number; y: number }; max: { x: number; y: number } }
  ): Matter.Body[] {
    const allBodies = this.getAllBodies(engine);
    return Matter.Query.region(allBodies, bounds);
  }
}
