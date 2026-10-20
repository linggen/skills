import Phaser from "phaser";
import { BlockMaterial } from "../../constants/Materials";
import {
  materialRegistry,
  type MaterialVFXProfile,
} from "../../config/registries/MaterialConfigRegistry";
import { PerformanceManager } from "../PerformanceManager";
import { PARTICLE_EMITTER_CONFIG, PARTICLE_SERVICE_CONFIG } from "../../config/VFXConfig";

type ParticleConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
type ParticleEmitter = Phaser.GameObjects.Particles.ParticleEmitter;

interface PooledEmitter {
  emitter: ParticleEmitter;
  texture: string;
  inUse: boolean;
  releaseTime: number;
}

interface PendingRelease {
  pooled: PooledEmitter;
  releaseTime: number;
}

interface ExplosionEmitterConfig {
  texture: string;
  lifespan: number;
  speedMin: number;
  speedMax: number;
  scaleStart: number;
  scaleEnd: number;
  alphaStart: number;
  alphaEnd: number;
  tints: number[];
  blendMode: string;
}

interface PendingEmission {
  texture: string;
  x: number;
  y: number;
  config: ParticleConfig;
  count: number;
  depth: number;
  releaseDelay: number;
}

const SPREAD_CONE_ANGLES = new Map<number, { min: number; max: number }>([
  [0.15, { min: -8.59, max: 8.59 }],
  [0.3, { min: -17.19, max: 17.19 }],
  [0.4, { min: -22.92, max: 22.92 }],
  [0.5, { min: -28.65, max: 28.65 }],
  [Math.PI, { min: -180, max: 180 }],
]);

function getCachedAngleRange(baseAngle: number, spreadCone: number): { min: number; max: number } {
  const cached = SPREAD_CONE_ANGLES.get(spreadCone);
  if (cached) {
    const baseDeg = Phaser.Math.RadToDeg(baseAngle);
    return { min: baseDeg + cached.min, max: baseDeg + cached.max };
  }
  const minAngle = Phaser.Math.RadToDeg(baseAngle - spreadCone);
  const maxAngle = Phaser.Math.RadToDeg(baseAngle + spreadCone);
  return { min: minAngle, max: maxAngle };
}

export class ParticleEmitterService {
  private scene: Phaser.Scene;
  private emittersByTexture: Map<string, PooledEmitter[]> = new Map();
  private explosionSparkEmitter: ParticleEmitter | null = null;
  private explosionSmokeEmitter: ParticleEmitter | null = null;
  private sparkDeactivationTime: number = 0;
  private smokeDeactivationTime: number = 0;
  private isLowEndDevice: boolean;
  private maxPoolSize: number;
  private destroyed: boolean = false;
  private pendingReleases: PendingRelease[] = [];
  private pendingEmissions: PendingEmission[] = [];
  private vfxProfiles: Map<BlockMaterial, MaterialVFXProfile | undefined> = new Map();
  private currentPoolSize: number = 0;
  private emissionsByTextureCache: Map<string, PendingEmission[]> = new Map();
  private lastCleanupTime: number = 0;
  private inUseCount: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.isLowEndDevice = PerformanceManager.isLowEndGPU(scene);
    this.maxPoolSize = this.isLowEndDevice
      ? PARTICLE_EMITTER_CONFIG.lowEndPoolSize
      : PARTICLE_EMITTER_CONFIG.normalPoolSize;
    this.cacheVFXProfiles();
  }

  private cacheVFXProfiles(): void {
    for (const material of Object.values(BlockMaterial)) {
      this.vfxProfiles.set(material, materialRegistry.getVFX(material));
    }
  }

  private getVFXProfile(material: BlockMaterial): MaterialVFXProfile | undefined {
    return this.vfxProfiles.get(material);
  }

  public prewarmPool(): void {
    for (const texture of PARTICLE_EMITTER_CONFIG.prewarmTextures) {
      const pooled = this.acquireEmitter(texture);

      if (pooled) {
        this.releaseEmitterDirect(pooled);
      }
    }
    this.createExplosionEmitters();
  }

  private createExplosionEmitters(): void {
    const sparkConfig = PARTICLE_EMITTER_CONFIG.spark;
    const smokeConfig = PARTICLE_EMITTER_CONFIG.smoke;

    this.explosionSparkEmitter = this.createConfiguredEmitter({
      texture: sparkConfig.texture,
      lifespan: sparkConfig.lifespan,
      speedMin: sparkConfig.speedMin,
      speedMax: sparkConfig.speedMax,
      scaleStart: sparkConfig.scaleStart,
      scaleEnd: sparkConfig.scaleEnd,
      alphaStart: sparkConfig.alphaStart,
      alphaEnd: sparkConfig.alphaEnd,
      tints: sparkConfig.tints,
      blendMode: sparkConfig.blendMode,
    });

    this.explosionSmokeEmitter = this.createConfiguredEmitter({
      texture: smokeConfig.texture,
      lifespan: smokeConfig.lifespan,
      speedMin: smokeConfig.speedMin,
      speedMax: smokeConfig.speedMax,
      scaleStart: smokeConfig.scaleStart,
      scaleEnd: smokeConfig.scaleEnd,
      alphaStart: smokeConfig.alphaStart,
      alphaEnd: smokeConfig.alphaEnd,
      tints: smokeConfig.tints,
      blendMode: smokeConfig.blendMode,
    });
  }

  private createConfiguredEmitter(config: ExplosionEmitterConfig): ParticleEmitter | null {
    try {
      const emitter = this.scene.add.particles(0, 0, "vfx", {
        frame: config.texture,
        lifespan: config.lifespan,
        speed: { min: config.speedMin, max: config.speedMax },
        scale: { start: config.scaleStart, end: config.scaleEnd },
        alpha: { start: config.alphaStart, end: config.alphaEnd },
        tint: config.tints,
        blendMode: config.blendMode,
        emitting: false,
        frequency: -1,
      });
      emitter.setActive(false);
      emitter.setVisible(false);
      return emitter;
    } catch (e) {
      console.warn("Failed to create configured emitter:", e);
      return null;
    }
  }

  public emitExplosionSparks(x: number, y: number, count: number, depth: number): void {
    if (this.destroyed || !this.explosionSparkEmitter) return;

    const scaledCount = PerformanceManager.getScaledCount(this.scene, count, 1);
    if (scaledCount <= 0) return;

    this.explosionSparkEmitter.setPosition(x, y);
    this.explosionSparkEmitter.setDepth(depth);
    this.explosionSparkEmitter.setActive(true);
    this.explosionSparkEmitter.setVisible(true);
    this.explosionSparkEmitter.explode(scaledCount);

    this.sparkDeactivationTime =
      this.scene.time.now + PARTICLE_SERVICE_CONFIG.sparkDeactivationDelayMs;
  }

  public emitExplosionSmoke(x: number, y: number, count: number, depth: number): void {
    if (this.destroyed || !this.explosionSmokeEmitter) return;

    const scaledCount = PerformanceManager.getScaledCount(this.scene, count, 1);
    if (scaledCount <= 0) return;

    this.explosionSmokeEmitter.setPosition(x, y);
    this.explosionSmokeEmitter.setDepth(depth);
    this.explosionSmokeEmitter.setActive(true);
    this.explosionSmokeEmitter.setVisible(true);
    this.explosionSmokeEmitter.explode(scaledCount);

    this.smokeDeactivationTime =
      this.scene.time.now + PARTICLE_SERVICE_CONFIG.smokeDeactivationDelayMs;
  }

  public update(): void {
    if (this.destroyed) return;

    const currentTime = this.scene.time.now;

    if (
      this.explosionSparkEmitter &&
      currentTime >= this.sparkDeactivationTime &&
      this.sparkDeactivationTime > 0
    ) {
      this.explosionSparkEmitter.setActive(false);
      this.explosionSparkEmitter.setVisible(false);
      this.sparkDeactivationTime = 0;
    }

    if (
      this.explosionSmokeEmitter &&
      currentTime >= this.smokeDeactivationTime &&
      this.smokeDeactivationTime > 0
    ) {
      this.explosionSmokeEmitter.setActive(false);
      this.explosionSmokeEmitter.setVisible(false);
      this.smokeDeactivationTime = 0;
    }

    for (let i = this.pendingReleases.length - 1; i >= 0; i--) {
      const pending = this.pendingReleases[i];
      if (currentTime >= pending.releaseTime) {
        this.releaseEmitterDirect(pending.pooled);
        this.pendingReleases.splice(i, 1);
      }
    }

    if (this.pendingEmissions.length > 0) {
      this.flushEmissions();
    }

    this.cleanupIdleEmitters(currentTime);
  }

  private cleanupIdleEmitters(currentTime: number): void {
    if (currentTime - this.lastCleanupTime < PARTICLE_EMITTER_CONFIG.cleanupIntervalMs) {
      return;
    }

    this.lastCleanupTime = currentTime;
    const maxIdleTime = PARTICLE_EMITTER_CONFIG.maxIdleTimeMs;

    for (const [texture, pool] of this.emittersByTexture) {
      for (let i = pool.length - 1; i >= 0; i--) {
        const pooled = pool[i];

        if (!pooled.inUse && currentTime - pooled.releaseTime > maxIdleTime) {
          if (pooled.emitter.scene) {
            pooled.emitter.destroy();
          }

          pool.splice(i, 1);
          this.currentPoolSize--;
        }
      }

      if (pool.length === 0) {
        this.emittersByTexture.delete(texture);
      }
    }
  }

  private flushEmissions(): void {
    for (const emission of this.pendingEmissions) {
      const existing = this.emissionsByTextureCache.get(emission.texture);

      if (existing) {
        existing.push(emission);
      } else {
        this.emissionsByTextureCache.set(emission.texture, [emission]);
      }
    }

    this.pendingEmissions = [];

    for (const [texture, emissions] of this.emissionsByTextureCache) {
      for (const emission of emissions) {
        this.executeEmission(texture, emission);
      }

      emissions.length = 0;
    }

    this.emissionsByTextureCache.clear();
  }

  private executeEmission(texture: string, emission: PendingEmission): void {
    const scaledCount = PerformanceManager.getScaledCount(this.scene, emission.count, 1);
    if (scaledCount <= 0) return;

    const pooled = this.acquireEmitter(texture);
    if (!pooled) return;

    const emitter = pooled.emitter;
    emitter.setPosition(emission.x, emission.y);
    emitter.setDepth(emission.depth);
    emitter.setVisible(true);
    emitter.setActive(true);

    emitter.setConfig({
      ...emission.config,
      frequency: -1,
    });

    emitter.explode(scaledCount);

    this.pendingReleases.push({
      pooled,
      releaseTime: this.scene.time.now + emission.releaseDelay,
    });
  }

  emitMaterialParticles(
    material: BlockMaterial,
    x: number,
    y: number,
    baseAngle: number,
    spreadCone: number,
    count: number,
    overrideTexture?: string
  ): void {
    if (this.destroyed) return;
    if (count <= 0) return;

    const profile = this.getVFXProfile(material);
    if (!profile) return;

    const texture = overrideTexture || profile.particleTexture;
    const angleRange = getCachedAngleRange(baseAngle, spreadCone);

    this.queueEmission(
      texture,
      x,
      y,
      {
        emitting: false,
        lifespan: profile.particleLifespan,
        speed: profile.particleSpeed,
        scale: profile.particleScale,
        alpha: profile.particleAlpha,
        tint: profile.particleTint,
        blendMode: profile.particleBlendMode,
        gravityY: profile.particleGravity,
        angle: angleRange,
        rotate: {
          min: PARTICLE_SERVICE_CONFIG.rotationMin,
          max: PARTICLE_SERVICE_CONFIG.rotationMax,
        },
      },
      count,
      PARTICLE_SERVICE_CONFIG.defaultDepth,
      profile.particleLifespan + PARTICLE_SERVICE_CONFIG.releaseDelayBufferMs
    );
  }

  private queueEmission(
    texture: string,
    x: number,
    y: number,
    config: ParticleConfig,
    count: number,
    depth: number,
    releaseDelay: number
  ): void {
    this.pendingEmissions.push({ texture, x, y, config, count, depth, releaseDelay });
  }

  emitParticles(
    texture: string,
    x: number,
    y: number,
    config: ParticleConfig,
    count: number,
    depth: number,
    releaseDelay: number
  ): void {
    if (this.destroyed) return;
    if (count <= 0) return;

    this.queueEmission(texture, x, y, config, count, depth, releaseDelay);
  }

  emitSettlingDust(x: number, y: number, intensity: number, profile: MaterialVFXProfile): void {
    if (!profile.settlingTexture || !profile.settlingTint) return;

    const dustConfig = PARTICLE_EMITTER_CONFIG.settlingDust;

    this.queueEmission(
      profile.settlingTexture,
      x,
      y + dustConfig.offsetY,
      {
        emitting: false,
        lifespan: dustConfig.lifespan,
        speed: { min: dustConfig.speedMin, max: dustConfig.speedMax },
        scale: { start: dustConfig.scaleStart, end: dustConfig.scaleEnd },
        alpha: { start: dustConfig.alphaStart, end: dustConfig.alphaEnd },
        tint: profile.settlingTint,
        blendMode: "NORMAL",
        gravityY: dustConfig.gravityY,
        angle: { min: dustConfig.angleMin, max: dustConfig.angleMax },
      },
      Math.floor(dustConfig.countMultiplier * intensity),
      dustConfig.depth,
      dustConfig.releaseDelay
    );
  }

  private acquireEmitter(texture: string): PooledEmitter | null {
    if (this.destroyed) return null;

    const texturePool = this.emittersByTexture.get(texture);

    if (texturePool) {
      for (const pooled of texturePool) {
        if (!pooled.inUse) {
          pooled.inUse = true;
          this.inUseCount++;

          return pooled;
        }
      }
    }

    if (this.currentPoolSize < this.maxPoolSize) {
      const emitter = this.createEmitter(texture);

      if (emitter) {
        const pooled: PooledEmitter = {
          emitter,
          texture,
          inUse: true,
          releaseTime: 0,
        };

        let pool = this.emittersByTexture.get(texture);
        if (!pool) {
          pool = [];
          this.emittersByTexture.set(texture, pool);
        }
        pool.push(pooled);
        this.currentPoolSize++;
        this.inUseCount++;

        return pooled;
      }
      return null;
    }

    for (const [tex, pool] of this.emittersByTexture) {
      for (const pooled of pool) {
        if (!pooled.inUse) {
          if (pooled.emitter.scene) {
            pooled.emitter.destroy();
          }

          const newEmitter = this.createEmitter(texture);
          if (newEmitter) {
            const idx = pool.indexOf(pooled);

            if (idx >= 0) pool.splice(idx, 1);
            if (pool.length === 0) {
              this.emittersByTexture.delete(tex);
            }

            pooled.emitter = newEmitter;
            pooled.texture = texture;
            pooled.inUse = true;
            this.inUseCount++;

            let newPool = this.emittersByTexture.get(texture);
            if (!newPool) {
              newPool = [];
              this.emittersByTexture.set(texture, newPool);
            }
            newPool.push(pooled);
            return pooled;
          }
        }
      }
    }

    return null;
  }

  private createEmitter(texture: string): ParticleEmitter | null {
    try {
      const emitter = this.scene.add.particles(0, 0, "vfx", {
        frame: texture,
        emitting: false,
        frequency: -1,
      });

      return emitter;
    } catch (e) {
      console.warn("Failed to create particle emitter:", e);
      return null;
    }
  }

  private releaseEmitterDirect(pooled: PooledEmitter): void {
    if (this.destroyed) return;

    pooled.inUse = false;
    this.inUseCount--;
    pooled.releaseTime = this.scene.time.now;
    pooled.emitter.setActive(false);
    pooled.emitter.setVisible(false);
    pooled.emitter.stop();
  }

  getPoolStats(): { total: number; inUse: number; available: number } {
    return {
      total: this.currentPoolSize,
      inUse: this.inUseCount,
      available: this.currentPoolSize - this.inUseCount,
    };
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.pendingReleases = [];
    this.pendingEmissions = [];

    if (this.explosionSparkEmitter) {
      this.explosionSparkEmitter.destroy();
      this.explosionSparkEmitter = null;
    }

    if (this.explosionSmokeEmitter) {
      this.explosionSmokeEmitter.destroy();
      this.explosionSmokeEmitter = null;
    }

    for (const pool of this.emittersByTexture.values()) {
      for (const pooled of pool) {
        if (pooled.emitter.scene) {
          pooled.emitter.destroy();
        }
      }
    }

    this.emittersByTexture.clear();
    this.vfxProfiles.clear();
    this.emissionsByTextureCache.clear();
    this.currentPoolSize = 0;
    this.inUseCount = 0;
  }
}
