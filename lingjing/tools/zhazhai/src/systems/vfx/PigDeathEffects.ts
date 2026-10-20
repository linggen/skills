import Phaser from "phaser";
import {
  PIG_DEATH_CONFIG,
  PIG_DEATH_VFX_CONFIG,
  type PigDeathConfig,
} from "../../config/VFXConfig";
import { ImagePool } from "../../utils/ObjectPool";
import { getMobileSafeBlendMode } from "../../utils/MobileBlendMode";
import { PerformanceManager } from "../PerformanceManager";
import { MobileManager } from "../mobile/MobileManager";

export class PigDeathEffects {
  private puffPools: Map<string, ImagePool> = new Map();
  private splatPools: Map<string, ImagePool> = new Map();
  private destroyed: boolean = false;
  private pendingTimers: Set<Phaser.Time.TimerEvent> = new Set();

  constructor(private scene: Phaser.Scene) {
    const puffTextures = ["circle_01", "circle_02", "circle_03"];
    const splatTextures = ["splat02", "splat10", "splat11", "splat12", "splat32", "splat33"];

    for (const texture of puffTextures) {
      this.puffPools.set(
        texture,
        new ImagePool(scene, texture, { initialSize: 4, maxSize: 16 }, "vfx")
      );
    }
    for (const texture of splatTextures) {
      this.splatPools.set(
        texture,
        new ImagePool(scene, texture, { initialSize: 2, maxSize: 12 }, "vfx")
      );
    }
  }

  spawnPigDeathEffect(
    x: number,
    y: number,
    scale: number,
    image: Phaser.Physics.Matter.Image | null,
    onComplete: () => void
  ): void {
    if (this.destroyed) return;

    const config = PIG_DEATH_CONFIG;

    if (image) {
      image.setAlpha(0);
    }

    this.spawnPuffCloud(x, y, scale, config);
    this.spawnSplat(x, y, scale, config);
    this.triggerScreenPulse(config);

    const timer = this.scene.time.delayedCall(PIG_DEATH_VFX_CONFIG.completionDelayMs, () => {
      this.pendingTimers.delete(timer);
      onComplete();
    });
    this.pendingTimers.add(timer);
  }

  private spawnPuffCloud(x: number, y: number, scale: number, config: PigDeathConfig): void {
    const puffConfig = config.puff;
    const puffs: { image: Phaser.GameObjects.Image; pool: ImagePool | undefined }[] = [];
    const _blend = getMobileSafeBlendMode(
      PerformanceManager.getQualityMultiplier(this.scene),
      MobileManager.getInstance().isMobile()
    );

    for (let i = 0; i < puffConfig.count; i++) {
      const texture = puffConfig.textures[i % puffConfig.textures.length];
      const pool = this.puffPools.get(texture);

      let puff: Phaser.GameObjects.Image;
      if (pool) {
        puff = pool.acquire();
        puff.setPosition(x, y);
      } else {
        puff = this.scene.add.image(x, y, "vfx", texture);
      }

      puff.setScale(PIG_DEATH_VFX_CONFIG.initialPuffScale);
      puff.setTint(puffConfig.color);
      puff.setAlpha(puffConfig.alpha);
      puff.setBlendMode(_blend);
      puff.setDepth(PIG_DEATH_VFX_CONFIG.depth);

      puffs.push({ image: puff, pool });
    }

    // Stagger tween creation to reduce frame spike
    puffs.forEach((puffData, i) => {
      const puff = puffData.image;
      const pool = puffData.pool;

      const randomScale =
        Phaser.Math.FloatBetween(puffConfig.scaleMin, puffConfig.scaleMax) * scale;

      const offsetAngle = (Math.PI * 2 * i) / puffConfig.count;
      const offsetDist = Phaser.Math.Between(5, puffConfig.offsetDistance) * scale;

      const timer = this.scene.time.delayedCall(i * PIG_DEATH_VFX_CONFIG.staggerDelayMs, () => {
        this.pendingTimers.delete(timer);
        if (this.destroyed) return;

        this.scene.tweens.add({
          targets: puff,
          scaleX: randomScale,
          scaleY: randomScale,
          x: x + Math.cos(offsetAngle) * offsetDist,
          y: y + Math.sin(offsetAngle) * offsetDist,
          alpha: 0,
          duration: puffConfig.duration + puffConfig.fadeOutDuration,
          ease: "Quad.easeOut",
          onComplete: () => {
            if (pool) pool.release(puff);
            else puff.destroy();
          },
        });
      });

      this.pendingTimers.add(timer);
    });
  }

  private spawnSplat(x: number, y: number, scale: number, config: PigDeathConfig): void {
    const splatConfig = config.splat;
    const texture = Phaser.Utils.Array.GetRandom(splatConfig.textures);
    const pool = this.splatPools.get(texture);

    let splat: Phaser.GameObjects.Image;
    if (pool) {
      splat = pool.acquire();
      splat.setPosition(x, y);
    } else {
      splat = this.scene.add.image(x, y, "vfx", texture);
    }

    splat.setScale(0);
    splat.setTint(splatConfig.color);
    splat.setDepth(PIG_DEATH_VFX_CONFIG.depth);

    this.scene.tweens.add({
      targets: splat,
      scaleX: splatConfig.scale * scale * splatConfig.bounceScale,
      scaleY: splatConfig.scale * scale * splatConfig.bounceScale,
      duration: splatConfig.duration * 0.6,
      ease: "Back.easeOut",
      onComplete: () => {
        this.scene.tweens.add({
          targets: splat,
          scaleX: splatConfig.scale * scale,
          scaleY: splatConfig.scale * scale,
          duration: splatConfig.duration * 0.4,
          ease: "Quad.easeOut",
        });
      },
    });

    const timer = this.scene.time.delayedCall(splatConfig.lingerDuration, () => {
      this.pendingTimers.delete(timer);
      if (this.destroyed) return;

      this.scene.tweens.add({
        targets: splat,
        alpha: 0,
        duration: splatConfig.fadeOutDuration,
        onComplete: () => {
          if (pool) pool.release(splat);
          else splat.destroy();
        },
      });
    });

    this.pendingTimers.add(timer);
  }

  private triggerScreenPulse(config: PigDeathConfig): void {
    const pulseConfig = config.screenPulse;
    this.scene.cameras.main.shake(pulseConfig.duration, pulseConfig.intensity);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.pendingTimers.forEach((t) => t.remove());
    this.pendingTimers.clear();

    this.puffPools.forEach((pool) => pool.destroy());
    this.puffPools.clear();
    this.splatPools.forEach((pool) => pool.destroy());
    this.splatPools.clear();
  }
}
