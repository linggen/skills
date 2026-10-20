import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import {
  ABILITY_VFX_CONFIG,
  ABILITY_VFX_DEPTHS,
  ABILITY_VFX_POOLS,
  SPLIT_EFFECT_CONFIG,
  EGG_DROP_EFFECT_CONFIG,
  EXPLOSION_ACTIVATION_EFFECT_CONFIG,
} from "../../config/VFXConfig";
import { ImagePool, CirclePool } from "../../utils/ObjectPool";
import { getMobileSafeBlendMode } from "../../utils/MobileBlendMode";
import { PerformanceManager } from "../PerformanceManager";
import { MobileManager } from "../mobile/MobileManager";

export interface RadialBurstConfig {
  x: number;
  y: number;
  particleCount: number;
  texturePrefix: string;
  textureCount: number;
  minSpeed: number;
  maxSpeed: number;
  duration: number;
  startScale: number;
  endScale: number;
  blendMode: Phaser.BlendModes | string;
  depth: number;
  tint?: number;
}

export interface TrailConfig {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  particleCount: number;
  texture: string;
  duration: number;
  stagger: number;
}
const DEFAULT_BURST_CONFIG: Partial<RadialBurstConfig> = {
  particleCount: 8,
  texturePrefix: "spark_0",
  textureCount: 4,
  minSpeed: 150,
  maxSpeed: 300,
  duration: 400,
  startScale: 1,
  endScale: 0,
  blendMode: "ADD",
  depth: ABILITY_VFX_DEPTHS.burstDefault,
};
export class AbilityVFXManager {
  private scene: Phaser.Scene;
  private sparkPools: Map<string, ImagePool> = new Map();
  private lightPool: ImagePool;
  private ringPool: CirclePool;
  private destroyed: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    for (let i = 1; i <= 4; i++) {
      this.sparkPools.set(
        `spark_0${i}`,
        new ImagePool(
          scene,
          `spark_0${i}`,
          { initialSize: ABILITY_VFX_POOLS.sparkPoolInitialSize },
          "vfx"
        )
      );
    }

    this.lightPool = new ImagePool(
      scene,
      "light_01",
      { initialSize: ABILITY_VFX_POOLS.lightPoolInitialSize },
      "vfx"
    );
    this.ringPool = new CirclePool(scene, {
      initialSize: ABILITY_VFX_POOLS.ringPoolInitialSize,
      maxSize: ABILITY_VFX_POOLS.ringPoolMaxSize,
    });
  }

  private getSparkPool(texture: string): ImagePool | undefined {
    return this.sparkPools.get(texture);
  }
  public createRadialBurst(config: Partial<RadialBurstConfig>): void {
    const fullConfig = { ...DEFAULT_BURST_CONFIG, ...config } as RadialBurstConfig;
    const {
      x,
      y,
      particleCount,
      texturePrefix,
      textureCount,
      minSpeed,
      maxSpeed,
      duration,
      startScale,
      endScale,
      depth,
      tint,
    } = fullConfig;
    const _blend = getMobileSafeBlendMode(
      PerformanceManager.getQualityMultiplier(this.scene),
      MobileManager.getInstance().isMobile()
    );

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const speed = Phaser.Math.Between(minSpeed, maxSpeed);
      const textureIndex = Phaser.Math.Between(1, textureCount);
      const texture = `${texturePrefix}${textureIndex}`;

      const pool = this.getSparkPool(texture);
      let particle: Phaser.GameObjects.Image;

      if (pool) {
        particle = pool.acquire();
        particle.setPosition(x, y);
      } else {
        particle = this.scene.add.image(x, y, "vfx", texture);
      }

      particle.setBlendMode(_blend);
      particle.setDepth(depth);
      particle.setScale(startScale);
      particle.setAlpha(1);
      if (tint !== undefined) {
        particle.setTint(tint);
      }

      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scaleX: endScale,
        scaleY: endScale,
        duration,
        ease: "Sine.Out",
        onComplete: () => {
          if (pool) {
            pool.release(particle);
          } else {
            particle.destroy();
          }
        },
      });
    }
  }

  public createBoostTrail(
    startX: number,
    startY: number,
    velocity: { x: number; y: number },
    particleCount: number = 12
  ): void {
    const direction = Math.atan2(velocity.y, velocity.x);
    const _blend = getMobileSafeBlendMode(
      PerformanceManager.getQualityMultiplier(this.scene),
      MobileManager.getInstance().isMobile()
    );

    for (let i = 0; i < particleCount; i++) {
      const offset = (i / particleCount) * ABILITY_VFX_CONFIG.boostTrailOffsetDistance;
      const particleX = startX - Math.cos(direction) * offset;
      const particleY = startY - Math.sin(direction) * offset;
      const radius = Phaser.Math.Between(
        ABILITY_VFX_CONFIG.ringRadiusMin,
        ABILITY_VFX_CONFIG.ringRadiusMax
      );
      const particle = this.ringPool.acquire(particleX, particleY, radius, 0xffff00, 0.8);
      particle.setBlendMode(_blend);
      particle.setDepth(T.depth.hudElements);
      this.scene.tweens.add({
        targets: particle,
        alpha: 0,
        scaleX: 0,
        scaleY: 0,
        duration: ABILITY_VFX_CONFIG.trailFadeDuration,
        delay: i * ABILITY_VFX_CONFIG.staggerDelayMs,
        onComplete: () => this.ringPool.release(particle),
      });
    }
  }

  public createSplitEffect(x: number, y: number): void {
    const config = SPLIT_EFFECT_CONFIG;
    const _blend = getMobileSafeBlendMode(
      PerformanceManager.getQualityMultiplier(this.scene),
      MobileManager.getInstance().isMobile()
    );
    this.createRadialBurst({
      x,
      y,
      particleCount: config.particleCount,
      texturePrefix: "spark_0",
      textureCount: 4,
      minSpeed: config.minSpeed,
      maxSpeed: config.maxSpeed,
      duration: config.duration,
      startScale: config.startScale,
      endScale: config.endScale,
      tint: config.tint,
    });
    for (let i = 0; i < config.lightCount; i++) {
      const offsetX = Phaser.Math.Between(-config.lightOffsetRange, config.lightOffsetRange);
      const offsetY = Phaser.Math.Between(-config.lightOffsetRange, config.lightOffsetRange);
      const light = this.lightPool.acquire();
      light.setPosition(x + offsetX, y + offsetY);
      light.setScale(config.lightInitialScale);
      light.setBlendMode(_blend);
      light.setTint(0xffffff);
      light.setAlpha(1);
      light.setDepth(ABILITY_VFX_DEPTHS.light);
      this.scene.tweens.add({
        targets: light,
        alpha: 0,
        scaleX: config.lightEndScale,
        scaleY: config.lightEndScale,
        duration: config.lightDuration,
        ease: "Sine.Out",
        onComplete: () => this.lightPool.release(light),
      });
    }
  }

  public createEggDropEffect(x: number, y: number): void {
    const config = EGG_DROP_EFFECT_CONFIG;
    const _blend = getMobileSafeBlendMode(
      PerformanceManager.getQualityMultiplier(this.scene),
      MobileManager.getInstance().isMobile()
    );
    this.createRadialBurst({
      x,
      y,
      particleCount: config.particleCount,
      texturePrefix: "spark_0",
      textureCount: 4,
      minSpeed: config.minSpeed,
      maxSpeed: config.maxSpeed,
      duration: config.duration,
      startScale: config.startScale,
      endScale: config.endScale,
      tint: config.tint,
    });
    const glow = this.lightPool.acquire();
    glow.setPosition(x, y);
    glow.setScale(config.glowInitialScale);
    glow.setBlendMode(_blend);
    glow.setTint(0xffffff);
    glow.setAlpha(config.glowInitialAlpha);
    glow.setDepth(ABILITY_VFX_DEPTHS.glow);
    this.scene.tweens.add({
      targets: glow,
      alpha: 0,
      scaleX: config.glowEndScale,
      scaleY: config.glowEndScale,
      duration: config.glowDuration,
      ease: "Sine.Out",
      onComplete: () => this.lightPool.release(glow),
    });
  }

  public createExplosionActivationEffect(x: number, y: number): void {
    const config = EXPLOSION_ACTIVATION_EFFECT_CONFIG;
    const _blend = getMobileSafeBlendMode(
      PerformanceManager.getQualityMultiplier(this.scene),
      MobileManager.getInstance().isMobile()
    );
    const ring = this.ringPool.acquire(
      x,
      y,
      config.ringInitialRadius,
      config.ringColor,
      config.ringInitialAlpha
    );
    ring.setBlendMode(_blend);
    ring.setDepth(ABILITY_VFX_DEPTHS.ring);
    this.scene.tweens.add({
      targets: ring,
      scaleX: config.ringEndScale,
      scaleY: config.ringEndScale,
      alpha: 0,
      duration: config.ringDuration,
      ease: "Sine.Out",
      onComplete: () => this.ringPool.release(ring),
    });
    this.createRadialBurst({
      x,
      y,
      particleCount: config.particleCount,
      texturePrefix: "spark_0",
      textureCount: config.textureCount,
      minSpeed: config.minSpeed,
      maxSpeed: config.maxSpeed,
      duration: config.duration,
    });
  }
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.sparkPools.forEach((pool) => pool.destroy());
    this.sparkPools.clear();
    this.lightPool.destroy();
    this.ringPool.destroy();
  }
}
