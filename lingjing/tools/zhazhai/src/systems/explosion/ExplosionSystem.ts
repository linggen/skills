import Matter from "matter-js";
import type { IExplosionSystem, ExplosionSystemDeps, ExplosionOptions } from "./IExplosionSystem";
import {
  ExplosionTier,
  EXPLOSION_TIERS,
  CHAIN_REACTION_MULTIPLIER,
  EXPLOSION_SYSTEM_CONFIG,
} from "../../config/PhysicsConfig";
import type { Position } from "../../types/Vector2";

type BlockEntity = {
  isDestroyed(): boolean;
  getPosition(): Position;
  getMatterImage(): { body?: unknown } | null;
  isExplosive(): boolean;
  getExplosionTier(): ExplosionTier;
  explode(): void;
  takeDamage(damage: number, speed: number, impactAngle?: number): void;
};

type PigEntity = {
  isDestroyed(): boolean;
  getPosition(): Position;
  getMatterImage(): { body?: unknown } | null;
  takeDamage(damage: number): void;
};

export class ExplosionSystem implements IExplosionSystem {
  private deps: ExplosionSystemDeps;
  private blocks: BlockEntity[] = [];
  private pigs: PigEntity[] = [];
  private isDestroyed: boolean = false;

  constructor(deps: ExplosionSystemDeps) {
    this.deps = deps;
  }

  public setEntities(blocks: BlockEntity[], pigs: PigEntity[]): void {
    this.blocks = blocks;
    this.pigs = pigs;
  }

  public triggerBlockExplosion(block: {
    getPosition: () => Position;
    getExplosionTier(): ExplosionTier;
  }): void {
    const pos = block.getPosition();
    const tier = block.getExplosionTier();
    this.triggerExplosionByTier(pos, tier, false);
  }

  public triggerExplosionByTier(
    position: Position,
    tier: ExplosionTier,
    isChainReaction: boolean = false,
    chainSourcePos?: Position,
    chainSourceRadius?: number,
    options?: ExplosionOptions
  ): void {
    const { x, y } = position;
    const tierConfig = EXPLOSION_TIERS[tier];

    let radius = options?.customRadius ?? tierConfig.radius;
    let pushSpeed = tierConfig.pushSpeed;
    let damage = tierConfig.damage;
    let screenShake = tierConfig.screenShake;

    if (isChainReaction && chainSourcePos && chainSourceRadius) {
      const dx = x - chainSourcePos.x;
      const dy = y - chainSourcePos.y;
      const distSquared = dx * dx + dy * dy;
      const dist = Math.sqrt(distSquared);
      const distRatio = dist / chainSourceRadius;
      let chainMultiplier: number;

      const {
        closeDistanceRatio,
        farDistanceRatio,
        closeMultiplier,
        midMultiplier,
        farMultiplier,
      } = EXPLOSION_SYSTEM_CONFIG.chainReaction;

      if (distRatio < closeDistanceRatio) {
        chainMultiplier = closeMultiplier;
      } else if (distRatio < farDistanceRatio) {
        chainMultiplier = midMultiplier;
      } else {
        chainMultiplier = farMultiplier;
      }

      radius = Math.floor(radius * chainMultiplier);
      pushSpeed = Math.floor(pushSpeed * chainMultiplier);
      damage = Math.floor(damage * chainMultiplier);
      screenShake *= chainMultiplier;
    } else if (isChainReaction) {
      radius = Math.floor(radius * CHAIN_REACTION_MULTIPLIER);
      pushSpeed = Math.floor(pushSpeed * CHAIN_REACTION_MULTIPLIER);
      damage = Math.floor(damage * CHAIN_REACTION_MULTIPLIER);
      screenShake *= CHAIN_REACTION_MULTIPLIER;
    }

    this.deps.explosionShaderManager.triggerExplosion(x, y, radius, "explosive");

    this.deps.vfxManager.spawnExplosionParticles(x, y, "explosive", tier);
    this.deps.vfxManager.spawnDestructionEffect(
      x,
      y,
      "explosive",
      EXPLOSION_SYSTEM_CONFIG.destructionEffectImpactSpeed
    );

    this.deps.cameraEffects.shake(screenShake, EXPLOSION_SYSTEM_CONFIG.shakeDurationMs);
    this.deps.cameraEffects.flashFromImpact(EXPLOSION_SYSTEM_CONFIG.flashImpactSpeed, "explosive");

    this.deps.sfx.playExplosion();

    this.deps.hapticsManager?.triggerExplosionByTier(tier);

    if (tier !== "blackBird") {
      this.deps.scoringSystem.addExplosionBonus();
      this.deps.scorePopupManager.show(x, y, EXPLOSION_SYSTEM_CONFIG.explosionBonusScore);
    }

    // Pass 1: Unified entity pass - impulse + damage for blocks & pigs in single iteration
    // No separate wakeInRadiusImmediate needed - impulse inline wakes sleeping bodies
    this.applyExplosionToEntities(
      x,
      y,
      radius,
      damage,
      pushSpeed,
      options?.excludeBody as Matter.Body | undefined
    );

    // Pass 2: Fragment impulse via FragmentManager (uses shared applyRadialImpulse)
    this.deps.vfxManager.applyExplosionToFragments(x, y, radius, pushSpeed);
  }

  /**
   * Unified explosion pass: computes distance once per entity, applies impulse
   * and damage in the same iteration. Eliminates 3 redundant passes:
   *  - No separate wakeInRadiusImmediate (impulse inline wakes sleeping bodies)
   *  - No separate applyExplosionToWorld (impulse applied per-entity here)
   *  - No separate block/pig damage loops (damage applied alongside impulse)
   */
  private applyExplosionToEntities(
    explosionX: number,
    explosionY: number,
    radius: number,
    maxDamage: number,
    pushSpeed: number,
    excludeBody?: Matter.Body
  ): void {
    const radiusSquared = radius * radius;
    const massFactorConstant = 0.02;
    const pigDamageMax = maxDamage * EXPLOSION_SYSTEM_CONFIG.pigDamageMultiplier;

    // --- Blocks: impulse + damage, single distance computation ---
    for (const block of this.blocks) {
      if (block.isDestroyed()) continue;

      const matterBlock = block.getMatterImage();
      if (!matterBlock?.body) continue;

      const body = matterBlock.body as Matter.Body;
      if (body === excludeBody || body.isStatic) continue;

      const dx = body.position.x - explosionX;
      const dy = body.position.y - explosionY;
      const distSquared = dx * dx + dy * dy;

      if (distSquared > radiusSquared) continue;

      const distance = Math.sqrt(distSquared);
      const distanceRatio = this.getDistanceRatio(distance, radius);

      // Apply impulse inline (reuses distance, includes wake)
      this.applyImpulseToBody(body, dx, dy, distance, distanceRatio, pushSpeed, massFactorConstant);

      // Apply damage using the same distance computation
      if (block.isExplosive()) {
        const chainDelay = Math.floor(
          EXPLOSION_SYSTEM_CONFIG.chainDelayMinMs +
            distanceRatio * EXPLOSION_SYSTEM_CONFIG.chainDelayMaxMs
        );
        const sourcePos = { x: explosionX, y: explosionY };
        const sourceRadius = radius;

        this.deps.scene.time.delayedCall(chainDelay, () => {
          if (!block.isDestroyed()) {
            const blockPos = block.getPosition();
            const blockTier = block.getExplosionTier();
            block.explode();
            this.triggerExplosionByTier(blockPos, blockTier, true, sourcePos, sourceRadius);
          }
        });
      } else {
        const damage = this.calculateBlastDamage(distanceRatio, maxDamage);
        if (damage > 0) {
          const impactAngle = Math.atan2(dy, dx);
          const effectivePushSpeed = pushSpeed * (1 - distanceRatio);
          block.takeDamage(damage, effectivePushSpeed, impactAngle);
        }
      }
    }

    // --- Pigs: impulse + damage, single distance computation ---
    for (const pig of this.pigs) {
      if (pig.isDestroyed()) continue;

      const matterPig = pig.getMatterImage();
      if (!matterPig?.body) continue;

      const body = matterPig.body as Matter.Body;
      if (body === excludeBody || body.isStatic) continue;

      const dx = body.position.x - explosionX;
      const dy = body.position.y - explosionY;
      const distSquared = dx * dx + dy * dy;

      if (distSquared > radiusSquared) continue;

      const distance = Math.sqrt(distSquared);
      const distanceRatio = this.getDistanceRatio(distance, radius);

      // Apply impulse inline (reuses distance, includes wake)
      this.applyImpulseToBody(body, dx, dy, distance, distanceRatio, pushSpeed, massFactorConstant);

      // Apply damage using the same distance computation
      const damage = this.calculateBlastDamage(distanceRatio, pigDamageMax);
      if (damage > 0) {
        pig.takeDamage(damage);
      }
    }
  }

  /**
   * Apply radial impulse to a body using pre-computed distance values.
   * Avoids redundant sqrt when distance is already known from the damage calculation.
   */
  private applyImpulseToBody(
    body: Matter.Body,
    dx: number,
    dy: number,
    distance: number,
    distanceRatio: number,
    pushSpeed: number,
    massFactorConstant: number
  ): void {
    if (body.isSleeping) {
      Matter.Sleeping.set(body, false);
    }

    let impulseSpeed = pushSpeed * (1 - distanceRatio);
    const massFactor = 1 / (1 + body.mass * massFactorConstant);
    impulseSpeed *= massFactor;

    let dirX: number;
    let dirY: number;
    if (distance <= 0) {
      const randomAngle = Math.random() * Math.PI * 2;
      dirX = Math.cos(randomAngle);
      dirY = Math.sin(randomAngle);
    } else {
      dirX = dx / distance;
      dirY = dy / distance;
    }

    Matter.Body.setVelocity(body, {
      x: body.velocity.x + dirX * impulseSpeed,
      y: body.velocity.y + dirY * impulseSpeed,
    });
  }

  private getDistanceRatio(distance: number, radius: number): number {
    if (radius <= 0) {
      return 1;
    }

    return Math.min(Math.max(distance / radius, 0), 1);
  }

  private calculateBlastDamage(distanceRatio: number, maxDamage: number): number {
    return Math.floor((1 - distanceRatio) * maxDamage);
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.blocks = [];
    this.pigs = [];
  }
}
