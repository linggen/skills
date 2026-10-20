import { BirdType } from "../types/BirdType";
import { BaseBirdAbility } from "./BirdAbility";
import type { BirdAbilityContext } from "../types/BirdAbilityContext";
import type { Position, Velocity } from "../types/Vector2";
import { SPEED_BOOST_TRAIL } from "../config/VFXConfig";
import { getFastBodyCollisionDetector } from "../utils/FastBodyCollisionDetector";
import Phaser from "phaser";
import { getMobileSafeBlendMode } from "../utils/MobileBlendMode";
import { PerformanceManager } from "../systems/PerformanceManager";
import { MobileManager } from "../systems/mobile/MobileManager";

interface PooledImage {
  image: Phaser.GameObjects.Image;
  inUse: boolean;
}

const MAX_POOL_SIZE = 20;

export class SpeedBoostAbility extends BaseBirdAbility {
  public readonly birdType = BirdType.YELLOW;
  private tracePool: PooledImage[] = [];
  private glowPool: PooledImage[] = [];

  private getFromPool(
    pool: PooledImage[],
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    frame: string
  ): Phaser.GameObjects.Image {
    for (let i = pool.length - 1; i >= 0; i--) {
      const pooled = pool[i];

      if (!pooled.inUse) {
        if (!pooled.image?.scene?.sys) {
          pool.splice(i, 1);
          continue;
        }

        pooled.inUse = true;
        pooled.image.setPosition(x, y);
        pooled.image.setTexture(texture, frame);
        pooled.image.setAlpha(1);
        pooled.image.setScale(1);
        pooled.image.setVisible(true);
        pooled.image.setActive(true);

        return pooled.image;
      }
    }

    if (pool.length < MAX_POOL_SIZE) {
      const image = scene.add.image(x, y, texture, frame);
      pool.push({ image, inUse: true });
      return image;
    }

    return scene.add.image(x, y, texture, frame);
  }

  private releaseToPool(image: Phaser.GameObjects.Image, pool: PooledImage[]): void {
    for (const pooled of pool) {
      if (pooled.image === image) {
        pooled.inUse = false;
        image.setVisible(false);
        image.setActive(false);
        return;
      }
    }
    image.destroy();
  }

  public activate(context: BirdAbilityContext): void {
    const { bird, config } = context;
    const matterImage = bird.getMatterImage();

    if (!matterImage?.body) return;

    const multiplier = config.abilityMultiplier!;
    const currentVelocity = matterImage.body.velocity;

    const boostedVelocity = {
      x: currentVelocity.x * multiplier,
      y: currentVelocity.y * multiplier,
    };

    matterImage.setVelocity(boostedVelocity.x, boostedVelocity.y);

    const detector = getFastBodyCollisionDetector();
    if (detector) {
      detector.registerBoostedBird(bird.id);
    }

    this.createBoostTrail(bird["scene"], bird.getPosition(), boostedVelocity);
  }

  private createBoostTrail(scene: Phaser.Scene, position: Position, velocity: Velocity): void {
    const angle = Math.atan2(velocity.y, velocity.x);
    const cfg = SPEED_BOOST_TRAIL;
    const _blend = getMobileSafeBlendMode(
      PerformanceManager.getQualityMultiplier(scene),
      MobileManager.getInstance().isMobile()
    );

    for (let i = 0; i < cfg.traceParticles; i++) {
      const spreadAngle =
        angle + Math.PI + Phaser.Math.FloatBetween(-cfg.traceSpreadAngle, cfg.traceSpreadAngle);
      const speed = Phaser.Math.Between(cfg.traceSpeedMin, cfg.traceSpeedMax);

      const trace = this.getFromPool(
        this.tracePool,
        scene,
        position.x,
        position.y,
        "vfx",
        `trace_0${(i % 3) + 1}`
      );
      trace.setScale(cfg.traceScale);
      trace.setBlendMode(_blend);
      trace.setTint(cfg.traceTint);

      scene.tweens.add({
        targets: trace,
        x: position.x + Math.cos(spreadAngle) * speed,
        y: position.y + Math.sin(spreadAngle) * speed,
        alpha: 0,
        scaleX: 0,
        scaleY: 0,
        duration: cfg.traceDuration,
        ease: "Sine.easeOut",
        onComplete: () => this.releaseToPool(trace, this.tracePool),
      });
    }

    for (let i = 0; i < cfg.glowCount; i++) {
      const glow = this.getFromPool(
        this.glowPool,
        scene,
        position.x,
        position.y,
        "vfx",
        "light_01"
      );
      glow.setScale(cfg.glowBaseScale + i * cfg.glowScaleStep);
      glow.setBlendMode(_blend);
      glow.setTint(cfg.glowTint);
      glow.setAlpha(cfg.glowAlpha);

      scene.tweens.add({
        targets: glow,
        alpha: 0,
        scaleX: glow.scaleX + cfg.glowScaleIncrease,
        scaleY: glow.scaleY + cfg.glowScaleIncrease,
        duration: cfg.glowDuration,
        ease: "Sine.easeOut",
        onComplete: () => this.releaseToPool(glow, this.glowPool),
      });
    }
  }
}
