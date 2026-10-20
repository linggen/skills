import Phaser from "phaser";
import Matter from "matter-js";
import { CollisionCategory } from "../constants";
import { AbilityRegistry } from "../abilities";
import type { BirdAbilityContext } from "../types/BirdAbilityContext";
import { BirdType } from "../types/BirdType";
import { BirdState } from "../types/BirdState";
import type { Position, Velocity } from "../types/Vector2";
import { generateUniqueId } from "../utils/IdGenerator";
import { gameEvents } from "../events/EventBus";
import type { IBird } from "../types/IBird";
import {
  BIRD_PHYSICS,
  BIRD_ASSET_MAP,
  BOUNCE_CONFIG,
  MIN_IMPACT_THRESHOLD_SQ,
  BIRD_FLIGHT_CONFIG,
  BIRD_LAUNCH_ANIMATION_CONFIG,
} from "../config/PhysicsConfig";
import { DesignTokens } from "../config/DesignTokens";
import { BodyLabelHelpers } from "../constants/BodyLabels";
import { DamageCalculator } from "../systems/DamageCalculator";
import { BlockMaterial } from "../constants/Materials";
import { BirdStateMachine } from "./bird/BirdStateMachine";
import type { IWakeCascadeManager } from "../interfaces/IWakeCascadeManager";
import { TimeScaleCompensator } from "../utils/TimeScaleCompensator";

export { BirdType, BirdState };

export interface BirdCallbacks {
  onAbilityActivated?: (bird: Bird) => void;
  onLanded?: (bird: Bird) => void;
  onCollision?: (bird: Bird, impactSpeed: number) => void;
}

export class Bird implements IBird {
  public readonly scene: Phaser.Scene;
  public readonly type: BirdType;
  public readonly id: string;
  public state: BirdState = BirdState.IDLE;

  private stateMachine: BirdStateMachine;
  private matterImage: Phaser.Physics.Matter.Image | null = null;
  private launched: boolean = false;
  private abilityActivated: boolean = false;
  public callbacks: BirdCallbacks = {};
  private wakeManager: IWakeCascadeManager | undefined;
  private boundHandleCollision: (event: Phaser.Types.Physics.Matter.MatterCollisionData) => void;

  private bounceCount: number = 0;
  private flightRotation: number = 0;
  private penetrationCount: number = 0;
  private _destroyed: boolean = false;

  private static defaultAbilityRegistry: AbilityRegistry = new AbilityRegistry();
  private abilityRegistry: AbilityRegistry | null = null;

  public static setDefaultAbilityRegistry(registry: AbilityRegistry): void {
    Bird.defaultAbilityRegistry = registry;
  }

  public setAbilityRegistry(registry: AbilityRegistry): void {
    this.abilityRegistry = registry;
  }

  private getAbilityRegistry(): AbilityRegistry {
    return this.abilityRegistry ?? Bird.defaultAbilityRegistry;
  }

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    type: BirdType = BirdType.RED,
    id?: string,
    wakeManager?: IWakeCascadeManager
  ) {
    this.scene = scene;
    this.type = type;
    this.id = id ?? generateUniqueId("bird");
    this.wakeManager = wakeManager;

    this.stateMachine = new BirdStateMachine(this);
    this.boundHandleCollision = this.handleCollision.bind(this);
    this.createPhysicsBody(x, y);
  }

  private wakeSelf(): void {
    if (this.matterImage?.body && this.wakeManager) {
      const body = this.matterImage.body as Matter.Body;
      this.wakeManager.wakeBodyDirectly(body);
    }
  }

  private createPhysicsBody(x: number, y: number): void {
    const config = BIRD_PHYSICS[this.type];
    const assetKey = BIRD_ASSET_MAP[this.type];

    let bodyShape: { type: string; radius?: number; width?: number; height?: number };

    if (config.width && config.height) {
      bodyShape = { type: "rectangle", width: config.width, height: config.height };
    } else {
      bodyShape = { type: "circle", radius: config.radius };
    }

    this.matterImage = this.scene.matter.add.image(x, y, "level", assetKey, {
      shape: bodyShape,
      density: config.density,
      restitution: config.restitution,
      friction: config.friction,
      frictionAir: config.frictionAir,
      label: `bird-${this.type}`,
    });

    const texture = this.matterImage.texture;
    const frame = texture.get(assetKey);
    const frameWidth = frame ? frame.cutWidth : texture.source[0].width;
    const frameHeight = frame ? frame.cutHeight : texture.source[0].height;

    if (config.width && config.height) {
      const scaleX = config.width / frameWidth;
      const scaleY = config.height / frameHeight;
      this.matterImage.setScale(scaleX, scaleY);
    } else {
      const visualDiameter = config.radius * 2;
      const scale = visualDiameter / frameWidth;
      this.matterImage.setScale(scale);
    }

    this.matterImage.setCollisionCategory(CollisionCategory.BIRD);
    this.matterImage.setStatic(true);
    this.matterImage.setDepth(DesignTokens.depth.bird);

    this.matterImage.setOnCollide(this.boundHandleCollision);
  }

  private handleCollision(event: Phaser.Types.Physics.Matter.MatterCollisionData): void {
    if (!this.launched) return;

    this.wakeSelf();

    const bodyA = event.bodyA;
    const bodyB = event.bodyB;
    const ownBody = this.matterImage?.body as Matter.Body | undefined;
    const birdBody = ownBody === bodyA ? bodyA : ownBody === bodyB ? bodyB : bodyA;
    const otherBody = birdBody === bodyA ? bodyB : bodyA;
    const collidedBlockMaterial = this.getCollidedBlockMaterial(bodyA.label, bodyB.label);
    const velocityA = birdBody.velocity;
    const velocityB = otherBody.velocity;

    const relativeVelocity = {
      x: velocityA.x - velocityB.x,
      y: velocityA.y - velocityB.y,
    };

    const speedSquared = relativeVelocity.x ** 2 + relativeVelocity.y ** 2;

    // Skip expensive collision processing for low-impact collisions
    if (speedSquared < MIN_IMPACT_THRESHOLD_SQ) {
      const config = BIRD_PHYSICS[this.type];

      if (config.activateOnCollision && !this.abilityActivated) {
        this.activateAbility();
      }

      return;
    }

    const rawImpactSpeed = Math.sqrt(speedSquared);
    const impactSpeed = TimeScaleCompensator.compensateImpactSpeed(rawImpactSpeed, this.scene);

    this.callbacks.onCollision?.(this, impactSpeed);

    if (
      collidedBlockMaterial !== null &&
      DamageCalculator.shouldOneShot(this.type, collidedBlockMaterial, impactSpeed, Infinity)
    ) {
      const preVelX = velocityA.x;
      const preVelY = velocityA.y;
      const decayFactor = Math.pow(
        BIRD_FLIGHT_CONFIG.penetrationDecayFactor,
        this.penetrationCount
      );

      this.penetrationCount++;

      if (this.matterImage?.body) {
        const img = this.matterImage;
        const vx = preVelX * decayFactor;
        const vy = preVelY * decayFactor;
        this.scene.time.delayedCall(0, () => {
          img.setVelocity(vx, vy);
        });
      }
    } else {
      const shouldPreserveMomentum =
        collidedBlockMaterial !== null &&
        DamageCalculator.isEffective(this.type, collidedBlockMaterial);

      if (!shouldPreserveMomentum && this.bounceCount < BOUNCE_CONFIG.maxMeaningfulBounces) {
        this.handleBounceEnergy();
      }
    }

    this.emitCollisionEvent(event, {
      impactSpeed,
      target: otherBody.label,
      x: birdBody.position.x,
      y: birdBody.position.y,
    });

    const config = BIRD_PHYSICS[this.type];
    if (config.activateOnCollision && !this.abilityActivated) {
      this.activateAbility();
    }
  }

  private static readonly BLOCK_MATERIALS = new Set<string>(Object.values(BlockMaterial));

  private getCollidedBlockMaterial(labelA: string, labelB: string): BlockMaterial | null {
    const collidedLabel = BodyLabelHelpers.isBlock(labelA)
      ? labelA
      : BodyLabelHelpers.isBlock(labelB)
        ? labelB
        : null;

    if (!collidedLabel) return null;

    const material = collidedLabel.slice(7);
    return Bird.BLOCK_MATERIALS.has(material) ? (material as BlockMaterial) : null;
  }

  public launch(velocityX: number, velocityY: number): void {
    if (!this.matterImage || this.launched) return;

    this.matterImage.setStatic(false);
    this.matterImage.setVelocity(velocityX, velocityY);

    const body = this.matterImage.body as Matter.Body;
    if (body) {
      Matter.Sleeping.set(body, false);
      body.sleepThreshold = BIRD_FLIGHT_CONFIG.launchedSleepThreshold;
    }

    const launchAngle = Math.atan2(velocityY, velocityX);
    const stretchX =
      1.0 + Math.abs(Math.cos(launchAngle)) * BIRD_LAUNCH_ANIMATION_CONFIG.stretchFactor;
    const stretchY =
      1.0 + Math.abs(Math.sin(launchAngle)) * BIRD_LAUNCH_ANIMATION_CONFIG.stretchFactor;

    this.scene.tweens.add({
      targets: this.matterImage,
      scaleX: stretchX,
      scaleY: stretchY,
      duration: BIRD_LAUNCH_ANIMATION_CONFIG.duration,
      yoyo: true,
      ease: "Power2",
    });

    this.launched = true;
    this.transitionToState("FLYING");

    gameEvents.emit("birdLaunched", {
      bird: this,
      velocity: { x: velocityX, y: velocityY },
    });
  }

  public transitionToState(stateName: string): void {
    this.stateMachine.transitionTo(stateName);
    this.state = BirdState[stateName as keyof typeof BirdState];
  }

  public setFlightRotation(angle: number): void {
    this.flightRotation += (angle - this.flightRotation) * BIRD_FLIGHT_CONFIG.flightRotationLerp;
    if (this.matterImage) {
      this.matterImage.setRotation(this.flightRotation);
    }
  }

  public handleBounceEnergy(): void {
    if (this.bounceCount >= BOUNCE_CONFIG.maxMeaningfulBounces) return;

    this.bounceCount++;

    const body = this.matterImage?.body as Matter.Body | undefined;
    if (!body) return;

    const multiplier = Math.pow(1 - BOUNCE_CONFIG.energyLossPerBounce, this.bounceCount);

    if (this.matterImage?.body) {
      const img = this.matterImage;
      const vx = this.matterImage.body.velocity.x * multiplier;
      const vy = this.matterImage.body.velocity.y * multiplier;
      this.scene.time.delayedCall(0, () => {
        img.setVelocity(vx, vy);
      });
    }
  }

  public emitCollisionEvent(
    event: Phaser.Types.Physics.Matter.MatterCollisionData,
    precomputed?: { impactSpeed: number; target: string; x: number; y: number }
  ): void {
    if (precomputed) {
      gameEvents.emit("birdCollision", {
        bird: this,
        impactSpeed: precomputed.impactSpeed,
        target: precomputed.target,
        x: precomputed.x,
        y: precomputed.y,
      });
      return;
    }

    const bodyA = event.bodyA;
    const bodyB = event.bodyB;
    const ownBody = this.matterImage?.body as Matter.Body | undefined;
    const birdBody = ownBody === bodyA ? bodyA : ownBody === bodyB ? bodyB : bodyA;
    const otherBody = birdBody === bodyA ? bodyB : bodyA;

    gameEvents.emit("birdCollision", {
      bird: this,
      impactSpeed: 0,
      target: otherBody.label,
      x: birdBody.position.x,
      y: birdBody.position.y,
    });
  }

  public notifyLanded(): void {
    this.callbacks.onLanded?.(this);
    gameEvents.emit("birdLanded", { bird: this });
  }

  public update(delta: number): void {
    this.stateMachine.update(delta);
  }

  public activateAbility(): void {
    if (!this.canActivateAbility()) return;

    this.abilityActivated = true;
    this.transitionToState("ABILITY_ACTIVATED");

    const config = BIRD_PHYSICS[this.type];
    const registry = this.getAbilityRegistry();
    const ability = registry.get(this.type);

    if (ability) {
      const context: BirdAbilityContext = {
        bird: this,
        position: this.getPosition(),
        velocity: this.getVelocity(),
        scene: this.scene,
        config: {
          abilityMultiplier: config.abilityMultiplier,
          explosionRadius: config.explosionRadius,
          splitCount: config.splitCount,
          splitAngle: config.splitAngle,
          splitVelocityRatio: config.splitVelocityRatio,
        },
      };

      ability.activate(context);
    }

    this.callbacks?.onAbilityActivated?.(this);
    gameEvents.emit("birdAbilityActivated", { bird: this, type: this.type });
  }

  public canActivateAbility(): boolean {
    return this.stateMachine.canActivateAbility();
  }

  public getRadius(): number {
    return BIRD_PHYSICS[this.type].radius;
  }

  public getPosition(): Position {
    if (this.matterImage) {
      return { x: this.matterImage.x, y: this.matterImage.y };
    }
    return { x: 0, y: 0 };
  }

  public getVelocity(): Velocity {
    if (this.matterImage?.body) {
      return this.matterImage.body.velocity;
    }
    return { x: 0, y: 0 };
  }

  public setPosition(x: number, y: number): void {
    if (this.matterImage) {
      this.matterImage.setPosition(x, y);
    }
  }

  public setStatic(isStatic: boolean): void {
    if (this.matterImage) {
      this.matterImage.setStatic(isStatic);
    }
  }

  public getMatterImage(): Phaser.Physics.Matter.Image | null {
    return this.matterImage;
  }

  public isLaunched(): boolean {
    return this.launched;
  }

  public destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    this.stateMachine.destroy();

    // Clean up collision callback to prevent memory leak in Matter.js
    if (this.matterImage?.body) {
      this.matterImage.setOnCollide(() => {});
    }

    if (this.matterImage) {
      this.matterImage.destroy();
      this.matterImage = null;
    }

    this.callbacks = null as unknown as BirdCallbacks;
  }

  public isDestroyed(): boolean {
    return this._destroyed;
  }
}
