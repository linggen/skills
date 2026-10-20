import Phaser from "phaser";
import Matter from "matter-js";
import { CollisionCategory } from "../constants";
import type { IPhysicsSettleDetector } from "../interfaces/IPhysicsSettleDetector";
import { TimingConfig } from "../config/TimingConfig";
import { PHYSICS_SETTLE_CONFIG } from "../config/PhysicsConfig";
import { logger } from "../utils/Logger";
import { BodyCache } from "../utils/BodyCache";

export interface PhysicsSettleConfig {
  velocityThreshold: number;
  angularThreshold: number;
  requiredSettleFrames: number;
  minWaitAfterLaunch: number;
  maxWaitTime: number;
}

export interface PhysicsSettleCallbacks {
  onSettled: () => void;
  onProgress?: (stillCount: number, movingCount: number, reason?: string) => void;
  canEarlySettle?: () => boolean;
  hasQueuedFragments?: () => boolean;
  getLastDestructionTime?: () => number;
  getDestructionCount?: () => number;
}

const DEFAULT_CONFIG: PhysicsSettleConfig = {
  velocityThreshold: TimingConfig.physicsSettle.velocityThreshold,
  angularThreshold: TimingConfig.physicsSettle.angularThreshold,
  requiredSettleFrames: TimingConfig.physicsSettle.requiredFrames,
  minWaitAfterLaunch: TimingConfig.physicsSettle.minWaitAfterLaunch,
  maxWaitTime: TimingConfig.physicsSettle.maxWaitTime,
};

const EARLY_SETTLE_FRAMES = TimingConfig.physicsSettle.earlySettleFrames;

const FRAGMENT_VELOCITY_THRESHOLD_SQUARED = PHYSICS_SETTLE_CONFIG.fragmentVelocityThreshold ** 2;

export class PhysicsSettleDetector implements IPhysicsSettleDetector {
  private scene: Phaser.Scene;
  private config: PhysicsSettleConfig;
  private callbacks: PhysicsSettleCallbacks | null = null;

  private isMonitoring: boolean = false;
  private settleFrameCount: number = 0;
  private launchTime: number = 0;
  private updateEvent: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, config?: Partial<PhysicsSettleConfig>) {
    this.scene = scene;
    this.config = { ...DEFAULT_CONFIG, ...config };
    BodyCache.getInstance().initialize(scene);
  }

  startMonitoring(callbacks: PhysicsSettleCallbacks): void {
    if (this.isMonitoring) {
      this.stopMonitoring();
    }

    this.callbacks = callbacks;
    this.isMonitoring = true;
    this.settleFrameCount = 0;
    this.launchTime = this.scene.time.now;

    this.updateEvent = this.scene.time.addEvent({
      delay: PHYSICS_SETTLE_CONFIG.checkIntervalMs,
      callback: this.checkSettle,
      callbackScope: this,
      loop: true,
    });
  }

  stopMonitoring(): void {
    if (this.updateEvent) {
      this.updateEvent.destroy();
      this.updateEvent = null;
    }
    this.isMonitoring = false;
    this.callbacks = null;
    this.settleFrameCount = 0;
  }

  reset(): void {
    this.settleFrameCount = 0;
  }

  private checkSettle(): void {
    if (!this.isMonitoring || !this.callbacks) return;

    const elapsed = this.scene.time.now - this.launchTime;

    if (elapsed >= this.config.maxWaitTime) {
      logger.warn("[SettleDetector] Max wait time exceeded, forcing settle");
      this.onSettled();
      return;
    }

    if (elapsed < this.config.minWaitAfterLaunch) {
      return;
    }

    // Check for queued fragments before settling
    if (this.callbacks.hasQueuedFragments?.()) {
      this.settleFrameCount = 0;
      this.callbacks.onProgress?.(0, 0, "fragments_queued");
      return;
    }

    // Check for recent destruction (quiet period requirement)
    const lastDestruction = this.callbacks.getLastDestructionTime?.() ?? 0;
    const destructionQuietPeriod = TimingConfig.physicsSettle.destructionQuietPeriodMs ?? 500;
    if (lastDestruction > 0 && this.scene.time.now - lastDestruction < destructionQuietPeriod) {
      this.settleFrameCount = 0;
      return;
    }

    const matterWorld = this.scene.matter.world;
    if (!matterWorld) return;

    const engine = matterWorld.engine as Matter.Engine;
    if (!engine) return;

    const bodies = BodyCache.getInstance().getAllBodies(engine);

    // Pre-compute squared threshold to avoid sqrt in loop
    const velocityThresholdSquared = this.config.velocityThreshold ** 2;

    let movingCount = 0;
    let monitoredBodyCount = 0;
    let movingFragmentCount = 0;

    for (const body of bodies) {
      if (body.isStatic || body.isSleeping) continue;

      const collisionFilter = body.collisionFilter;
      if (collisionFilter?.category === CollisionCategory.DEBRIS) continue;

      const label = (body as Matter.Body & { label?: string }).label;
      const isFragment = label === "fragment" || label === "debris";

      const vx = body.velocity.x;
      const vy = body.velocity.y;
      const speedSquared = vx * vx + vy * vy;

      if (isFragment) {
        if (speedSquared >= FRAGMENT_VELOCITY_THRESHOLD_SQUARED) {
          movingFragmentCount++;
          if (movingFragmentCount > PHYSICS_SETTLE_CONFIG.maxMovingFragmentsBeforeSettle) break;
        }

        continue;
      }

      monitoredBodyCount++;

      const angularSpeed = Math.abs(body.angularVelocity);

      if (
        speedSquared >= velocityThresholdSquared ||
        angularSpeed >= this.config.angularThreshold
      ) {
        movingCount++;
      }
    }

    if (this.callbacks.onProgress) {
      this.callbacks.onProgress(monitoredBodyCount - movingCount, movingCount);
    }

    if (movingFragmentCount > 0) {
      this.settleFrameCount = 0;
      return;
    }

    if (this.callbacks.canEarlySettle?.()) {
      this.settleFrameCount++;
      if (this.settleFrameCount >= EARLY_SETTLE_FRAMES) {
        this.onSettled();
      }
      return;
    }

    if (monitoredBodyCount === 0) {
      this.settleFrameCount++;
      if (this.settleFrameCount >= EARLY_SETTLE_FRAMES) {
        this.onSettled();
      }
      return;
    }

    if (movingCount > 0) {
      this.settleFrameCount = 0;
      return;
    }

    // Adaptive frame count based on destruction complexity
    const requiredFrames = this.getRequiredFrames();

    this.settleFrameCount++;
    if (this.settleFrameCount >= requiredFrames) {
      this.onSettled();
    }
  }

  /**
   * Get adaptive required frames based on destruction complexity
   */
  private getRequiredFrames(): number {
    // Early settle uses minimal frames
    if (this.callbacks?.canEarlySettle?.()) {
      return EARLY_SETTLE_FRAMES;
    }

    const destructionCount = this.callbacks?.getDestructionCount?.() ?? 0;
    const adaptiveConfig = TimingConfig.physicsSettle.adaptive;

    if (!adaptiveConfig?.enabled) {
      return this.config.requiredSettleFrames;
    }

    // No destruction - use simple/fast settle
    if (destructionCount === 0) {
      return adaptiveConfig.requiredFramesSimple;
    }

    // Complex cascade - use longer settle time
    if (destructionCount >= adaptiveConfig.complexityThreshold) {
      return adaptiveConfig.requiredFramesComplex;
    }

    // Normal destruction
    return adaptiveConfig.requiredFramesNormal;
  }

  private onSettled(): void {
    if (!this.isMonitoring) return;

    // Stop monitoring FIRST to prevent re-entry from callback
    const callbacks = this.callbacks;
    this.stopMonitoring();

    callbacks?.onSettled();
  }

  isActive(): boolean {
    return this.isMonitoring;
  }

  getSettleFrameCount(): number {
    return this.settleFrameCount;
  }
}
