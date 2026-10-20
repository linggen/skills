import Phaser from "phaser";
import { ExplosionTier } from "../../config/PhysicsConfig";
import { ParticleEmitterService } from "./ParticleEmitterService";
import { EXPLOSION_VFX_CONFIG } from "../../config/VFXConfig";
import { PerformanceManager } from "../PerformanceManager";

interface TierParticleConfig {
  sparkCount: number;
  smokeCount: number;
  debrisCount: number;
}

interface PooledDebris {
  image: Phaser.GameObjects.Image;
  inUse: boolean;
}

interface DebrisPoolEntry {
  pool: PooledDebris[];
  nextAvailable: number;
}

export class ExplosionEffects {
  private debrisPool: Map<string, DebrisPoolEntry> = new Map();
  private debrisLookup: Map<Phaser.GameObjects.Image, PooledDebris> = new Map();
  private isLowEndDevice: boolean;
  private tierConfigs: Record<ExplosionTier, TierParticleConfig>;
  private destroyed: boolean = false;
  private pendingTimers: Phaser.Time.TimerEvent[] = [];

  constructor(
    private scene: Phaser.Scene,
    private particleEmitter: ParticleEmitterService
  ) {
    this.isLowEndDevice = PerformanceManager.isLowEndGPU(scene);
    this.tierConfigs = this.isLowEndDevice
      ? (EXPLOSION_VFX_CONFIG.tierConfigs.low as Record<ExplosionTier, TierParticleConfig>)
      : (EXPLOSION_VFX_CONFIG.tierConfigs.normal as Record<ExplosionTier, TierParticleConfig>);
  }

  spawnExplosionParticles(x: number, y: number, tier: ExplosionTier = "tntMedium"): void {
    if (this.destroyed) return;

    const config = this.tierConfigs[tier];

    this.particleEmitter.emitExplosionSparks(
      x,
      y,
      config.sparkCount,
      EXPLOSION_VFX_CONFIG.sparkDepth
    );

    const timer1 = this.scene.time.delayedCall(EXPLOSION_VFX_CONFIG.sparkDelay, () => {
      if (this.destroyed) return;
      this.particleEmitter.emitExplosionSmoke(
        x,
        y,
        config.smokeCount,
        EXPLOSION_VFX_CONFIG.smokeDepth
      );
    });
    this.pendingTimers.push(timer1);

    const timer2 = this.scene.time.delayedCall(EXPLOSION_VFX_CONFIG.debrisDelay, () => {
      if (this.destroyed) return;
      this.spawnDebrisBatched(x, y, config.debrisCount);
    });
    this.pendingTimers.push(timer2);
  }

  private spawnDebrisBatched(x: number, y: number, count: number): void {
    const debrisConfig = EXPLOSION_VFX_CONFIG.debris;
    const maxDebris = this.isLowEndDevice
      ? debrisConfig.lowEndMaxCount
      : debrisConfig.normalMaxCount;
    const scaledCount = Math.min(count, maxDebris);
    if (scaledCount <= 0) return;

    const debrisTextures = ["smoke_01", "fire_01"];

    for (let i = 0; i < scaledCount; i++) {
      const texture = debrisTextures[i % debrisTextures.length];
      const duration = Phaser.Math.Between(debrisConfig.durationMin, debrisConfig.durationMax);
      const endRotation = Phaser.Math.FloatBetween(
        debrisConfig.rotationMin,
        debrisConfig.rotationMax
      );

      const debris = this.acquireDebris(texture);
      debris.setPosition(x, y);
      debris.setScale(Phaser.Math.FloatBetween(debrisConfig.scaleMin, debrisConfig.scaleMax));
      debris.setDepth(EXPLOSION_VFX_CONFIG.debrisDepth);
      debris.setTint(debrisConfig.tint);
      debris.setAlpha(1);
      debris.setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2));

      this.scene.tweens.add({
        targets: debris,
        rotation: endRotation,
        alpha: 0,
        duration: duration,
        ease: "Sine.easeOut",
        onComplete: () => this.releaseDebris(texture, debris),
      });
    }
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.pendingTimers.forEach((t) => t.remove());
    this.pendingTimers = [];

    for (const entry of this.debrisPool.values()) {
      for (const pooled of entry.pool) {
        pooled.image.destroy();
      }
    }

    this.debrisPool.clear();
    this.debrisLookup.clear();
  }

  private acquireDebris(texture: string): Phaser.GameObjects.Image {
    let entry = this.debrisPool.get(texture);
    if (!entry) {
      entry = { pool: [], nextAvailable: 0 };
      this.debrisPool.set(texture, entry);
    }

    const { pool, nextAvailable } = entry;
    const pooled = nextAvailable < pool.length ? pool[nextAvailable] : null;

    if (pooled && !pooled.inUse) {
      pooled.inUse = true;
      entry.nextAvailable = this.findNextAvailable(pool, nextAvailable + 1);

      const debris = pooled.image;
      this.scene.tweens.killTweensOf(debris);
      debris.setVisible(true);
      debris.setActive(true);
      return debris;
    }

    const debris = this.scene.add.image(0, 0, "vfx", texture);
    const newPooled: PooledDebris = { image: debris, inUse: true };
    pool.push(newPooled);
    this.debrisLookup.set(debris, newPooled);
    entry.nextAvailable = pool.length;

    debris.setVisible(true);
    debris.setActive(true);
    return debris;
  }

  private findNextAvailable(pool: PooledDebris[], start: number): number {
    for (let i = start; i < pool.length; i++) {
      if (!pool[i].inUse) return i;
    }

    return pool.length;
  }

  private releaseDebris(texture: string, debris: Phaser.GameObjects.Image): void {
    const pooled = this.debrisLookup.get(debris);
    if (!pooled) {
      debris.destroy();
      return;
    }

    const entry = this.debrisPool.get(texture);
    if (entry) {
      const idx = entry.pool.indexOf(pooled);

      if (idx >= 0 && idx < entry.nextAvailable) {
        entry.nextAvailable = idx;
      }
    }

    this.scene.tweens.killTweensOf(debris);
    debris.clearTint();
    debris.setVisible(false);
    debris.setActive(false);
    pooled.inUse = false;
  }
}
