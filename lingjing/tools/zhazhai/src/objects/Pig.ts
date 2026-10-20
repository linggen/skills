import Phaser from "phaser";
import Matter from "matter-js";
import { CollisionCategory } from "../constants";
import { PhysicsEntity } from "../entities/PhysicsEntity";
import { generateUniqueId } from "../utils/IdGenerator";
import { gameEvents } from "../events/EventBus";
import { PIG_PHYSICS, MIN_IMPACT_THRESHOLD_SQ, PIG_DAMAGE_CONFIG } from "../config/PhysicsConfig";
import { PIG_DEATH_CONFIG, PIG_SIZE_RADIUS_MULTIPLIER } from "../config/VFXConfig";
import { DesignTokens } from "../config/DesignTokens";
import type { IWakeCascadeManager } from "../interfaces/IWakeCascadeManager";
import type { IVFXManager } from "../interfaces/IVFXManager";
import { PigSize } from "../constants/PigSize";
import { applyRadialImpulse } from "../utils/PhysicsUtils";
import { TimeScaleCompensator } from "../utils/TimeScaleCompensator";
import { BodyCache } from "../utils/BodyCache";

export { PigSize } from "../constants/PigSize";

export interface PigCallbacks {
  onDestroyed?: (pig: Pig) => void;
  onDamage?: (pig: Pig, damage: number, currentHealth: number) => void;
  vfxManager?: IVFXManager;
}

const PIG_SHAPE_CONFIGS: Record<PigSize, { type: "circle" | "rectangle" }> = {
  [PigSize.SMALL]: { type: "circle" },
  [PigSize.MEDIUM]: { type: "rectangle" },
  [PigSize.LARGE]: { type: "rectangle" },
};

const PIG_ASSET_MAP: Record<PigSize, string> = {
  [PigSize.SMALL]: "alienGreen_round",
  [PigSize.MEDIUM]: "alienGreen_square",
  [PigSize.LARGE]: "alienGreen_suit",
};

export class Pig extends PhysicsEntity {
  public readonly size: PigSize;

  public callbacks: PigCallbacks = {};
  private minImpactSpeed: number = PIG_DAMAGE_CONFIG.defaultMinImpactSpeed;
  private boundHandleCollision: (event: Phaser.Types.Physics.Matter.MatterCollisionData) => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    size: PigSize = PigSize.MEDIUM,
    id?: string,
    wakeManager?: IWakeCascadeManager
  ) {
    const pigId = id ?? generateUniqueId("pig");
    const config = PIG_PHYSICS[size];
    super(scene, pigId, config.health, wakeManager);

    this.size = size;

    this.boundHandleCollision = this.handleCollision.bind(this);
    this.createPhysicsBody(x, y);
  }

  private createPhysicsBody(x: number, y: number): void {
    const config = PIG_PHYSICS[this.size];
    const textureKey = PIG_ASSET_MAP[this.size];
    const shapeConfig = PIG_SHAPE_CONFIGS[this.size];

    const visualSize = config.visualSize;
    const halfSize = visualSize / 2;

    this.matterImage = this.scene.matter.add.image(x, y, "level", textureKey, {
      density: config.density,
      restitution: PIG_DAMAGE_CONFIG.defaultRestitution,
      friction: PIG_DAMAGE_CONFIG.defaultFriction,
      label: `pig-${this.size}`,
    });

    if (this.matterImage.body) {
      const body = this.matterImage.body as Matter.Body;
      Matter.Sleeping.set(body, false);
    }

    const texture = this.matterImage.texture;
    const frame = texture.get(textureKey);
    const frameSize = frame ? frame.cutWidth : PIG_DAMAGE_CONFIG.defaultFrameSize;
    const scale = visualSize / frameSize;
    this.matterImage.setScale(scale);

    if (shapeConfig.type === "circle") {
      this.matterImage.setCircle(halfSize);
    } else {
      this.matterImage.setRectangle(visualSize, visualSize);
    }

    this.matterImage.setCollisionCategory(CollisionCategory.PIG);
    this.matterImage.setDepth(DesignTokens.depth.pig);

    this.matterImage.setOnCollide(this.boundHandleCollision);
  }

  private handleCollision(event: Phaser.Types.Physics.Matter.MatterCollisionData): void {
    if (this.destroyed) return;

    this.wakeSelf();

    const bodyA = event.bodyA;
    const bodyB = event.bodyB;

    const dvx = bodyA.velocity.x - bodyB.velocity.x;
    const dvy = bodyA.velocity.y - bodyB.velocity.y;
    const speedSquared = dvx * dvx + dvy * dvy;

    // Early exit for low-impact collisions
    if (speedSquared < MIN_IMPACT_THRESHOLD_SQ) return;

    // Only compute sqrt when needed
    const rawImpactSpeed = Math.sqrt(speedSquared);
    const impactSpeed = TimeScaleCompensator.compensateImpactSpeed(rawImpactSpeed, this.scene);

    if (impactSpeed >= this.minImpactSpeed) {
      const damage = Math.floor(impactSpeed * PIG_DAMAGE_CONFIG.impactSpeedDamageMultiplier);
      this.takeDamage(damage);

      gameEvents.emit("pigCollision", {
        pig: this,
        impactSpeed,
        damage,
        target: bodyB.label,
      });

      this.wakeNearbyBodies(PIG_DAMAGE_CONFIG.wakeRadius);
    }
  }

  public takeDamage(amount: number): void {
    if (this.destroyed) return;

    this.currentHealth -= amount;
    this.callbacks.onDamage?.(this, amount, this.currentHealth);

    gameEvents.emit("pigDamaged", {
      pig: this,
      damage: amount,
      currentHealth: this.currentHealth,
      maxHealth: this.maxHealth,
    });

    if (this.currentHealth <= 0) {
      this.destroy();
    }
  }

  public destroy(): void {
    if (this.destroyed) return;

    this.markDestroyed();

    const position = this.getPosition();

    this.applyDeathPush();

    gameEvents.emit("pigDestroyed", {
      pig: this,
      size: this.size,
      position: position,
    });

    if (this.matterImage && this.matterImage.body) {
      this.matterImage.setCollisionCategory(0);
      Matter.Body.setStatic(this.matterImage.body as Matter.Body, true);
    }

    const scale = this.getVisualScale();
    const image = this.matterImage;

    if (image) {
      image.setAlpha(0);
    }

    const vfxManager = this.callbacks.vfxManager;

    this.callbacks.onDestroyed?.(this);

    // Clean up collision callback to prevent memory leak in Matter.js
    if (this.matterImage?.body) {
      this.matterImage.setOnCollide(() => {});
    }

    this.destroyPhysicsBody();
    this.callbacks = null as unknown as PigCallbacks;

    if (vfxManager && image) {
      vfxManager.spawnPigDeathEffect(position.x, position.y, scale, image, () => {});
    }
  }

  private applyDeathPush(): void {
    const pos = this.getPosition();
    const config = PIG_DEATH_CONFIG.pushForce;

    const sizeMultiplier = PIG_SIZE_RADIUS_MULTIPLIER[this.size];
    const radius = config.baseRadius * sizeMultiplier;
    const wakeRadius = radius * config.wakeRadiusMultiplier;

    this.wakeManager?.wakeInRadiusImmediate(pos.x, pos.y, wakeRadius);

    const engine = this.scene.matter?.world?.engine;
    if (!engine) return;

    const bounds = {
      min: { x: pos.x - radius, y: pos.y - radius },
      max: { x: pos.x + radius, y: pos.y + radius },
    };

    const bodiesInRegion = BodyCache.getInstance().getBodiesInRegion(
      engine as unknown as Matter.Engine,
      bounds
    );

    for (const body of bodiesInRegion) {
      if (body.isStatic) continue;
      applyRadialImpulse(body, pos.x, pos.y, radius, config.pushSpeed * sizeMultiplier);
    }
  }

  private getVisualScale(): number {
    const config = PIG_PHYSICS[this.size];
    return config.visualSize / PIG_DAMAGE_CONFIG.defaultFrameSize;
  }

  public setMinImpactSpeed(speed: number): void {
    this.minImpactSpeed = speed;
  }

  public wake(): void {
    this.wakeSelf();
  }

  public sleep(): void {
    if (this.matterImage?.body && !this.destroyed) {
      const body = this.matterImage.body as Matter.Body;
      if (!body.isStatic && !body.isSleeping) {
        Matter.Sleeping.set(body, true);
      }
    }
  }
}
