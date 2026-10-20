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
import { texOf } from "../zhazhai/skin";

/** 砸寨: a target that is not a weasel (the stag, the 鯥 — zhazhai/targets.ts): its painting, body and toughness. */
export interface PigLook {
  /** An asset key (zhazhai/skin.ts): `zz:<name>` for a painting of its own. */
  texture: string;
  width: number;
  height: number;
  shape: "rect" | "circle";
  health: number;
  density?: number;
  /** Pinned where it stands (the 鯥 in the brambles): never falls or slides. */
  pinned?: boolean;
  label: string;
}

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
  /** 砸寨: what it looks like when it is not a weasel. */
  public readonly look?: PigLook;
  /** 砸寨: whether a blow gets through (`at`: where it landed, null for a blast). The 鯥's hide turns all but one spot. */
  public guard?: (at: { x: number; y: number } | null, impactSpeed: number) => boolean;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    size: PigSize = PigSize.MEDIUM,
    id?: string,
    wakeManager?: IWakeCascadeManager,
    look?: PigLook
  ) {
    const pigId = id ?? generateUniqueId("pig");
    const config = PIG_PHYSICS[size];
    super(scene, pigId, look?.health ?? config.health, wakeManager);

    this.size = size;
    this.look = look;

    this.boundHandleCollision = this.handleCollision.bind(this);
    this.createPhysicsBody(x, y);
  }

  private createPhysicsBody(x: number, y: number): void {
    if (this.look) return this.createLookBody(x, y, this.look);
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

  /** 砸寨: a target of its own painting — a body of its own size (a stag is long, a 鯥 is big). */
  private createLookBody(x: number, y: number, look: PigLook): void {
    const [key, frame] = texOf(look.texture);
    this.matterImage = this.scene.matter.add.image(x, y, key, frame, {
      density: look.density ?? 0.002,
      restitution: PIG_DAMAGE_CONFIG.defaultRestitution,
      friction: 0.8,
      label: look.label,
    });
    if (look.shape === "circle") this.matterImage.setCircle(Math.min(look.width, look.height) / 2);
    else this.matterImage.setRectangle(look.width, look.height);
    this.matterImage.setFixedRotation();
    if (look.pinned) this.matterImage.setStatic(true);
    else Matter.Sleeping.set(this.matterImage.body as Matter.Body, false);
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
      // 砸寨: where the blow landed, for a target whose hide turns all but one spot.
      let at: { x: number; y: number } | undefined;
      if (this.guard) {
        // Where the striking thing is (its middle): a contact's support points are the corners of whichever shape.
        const own = this.matterImage?.body;
        const other = bodyA === own ? bodyB : bodyA;
        at = { x: other.position.x, y: other.position.y };
        if (!this.guard(at, impactSpeed)) return;
      }
      const damage = Math.floor(impactSpeed * PIG_DAMAGE_CONFIG.impactSpeedDamageMultiplier);
      this.takeDamage(damage, impactSpeed, 0, at);

      gameEvents.emit("pigCollision", {
        pig: this,
        impactSpeed,
        damage,
        target: bodyB.label,
      });

      this.wakeNearbyBodies(PIG_DAMAGE_CONFIG.wakeRadius);
    }
  }

  public takeDamage(amount: number, _impactSpeed?: number, _impactAngle?: number, at?: { x: number; y: number }): void {
    if (this.destroyed) return;
    // 砸寨: a blast (no spot) asks the guard too; a blow already asked it in handleCollision.
    if (this.guard && !at && !this.guard(null, 0)) return;

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
