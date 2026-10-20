import Phaser from "phaser";
import { BlockMaterial } from "../constants/Materials";
import { ExplosionTier } from "../config/PhysicsConfig";
import { FragmentManager, type FragmentCollisionSoundCallback } from "./FragmentManager";
import type { IVFXManager } from "../interfaces/IVFXManager";
import type {
  IFragmentCollidable,
  FragmentCollisionHapticCallback,
} from "../interfaces/IFragmentManager";
import type { IWakeCascadeManager } from "../interfaces/IWakeCascadeManager";
import { materialRegistry } from "../config/registries/MaterialConfigRegistry";
import { PerformanceManager } from "./PerformanceManager";
import { BodyCache } from "../utils/BodyCache";
import type { BlockPreWarmConfig } from "./fragment/FragmentAtlasCache";
import { VFX_MANAGER_UPDATE_CONFIG } from "../config/VFXConfig";
import {
  ParticleEmitterService,
  ImpactEffects,
  ShockwaveEffects,
  ExplosionEffects,
  PigDeathEffects,
} from "./vfx";

export class VFXManager implements IVFXManager {
  private scene: Phaser.Scene;
  private fragmentManager: FragmentManager;
  private particleEmitter: ParticleEmitterService;
  private impactEffects: ImpactEffects;
  private shockwaveEffects: ShockwaveEffects;
  private explosionEffects: ExplosionEffects;
  private pigDeathEffects: PigDeathEffects;
  private useSpriteFragmentation: boolean = true;
  private isDestroyed: boolean = false;
  private updateTick: number = 0;
  private pendingTimers: Phaser.Time.TimerEvent[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.fragmentManager = new FragmentManager(scene);
    this.particleEmitter = new ParticleEmitterService(scene);
    this.particleEmitter.prewarmPool();
    this.impactEffects = new ImpactEffects(this.particleEmitter);
    this.shockwaveEffects = new ShockwaveEffects(scene);
    this.explosionEffects = new ExplosionEffects(scene, this.particleEmitter);
    this.pigDeathEffects = new PigDeathEffects(scene);
  }

  public spawnDestructionEffect(
    x: number,
    y: number,
    material: string,
    impactSpeed: number,
    impactAngle: number = Math.PI / 2
  ): void {
    const mat = material as BlockMaterial;
    const profile = materialRegistry.getVFX(mat);
    if (!profile) return;

    const intensity = Math.min(
      impactSpeed / VFX_MANAGER_UPDATE_CONFIG.destructionImpactSpeedNormalization,
      1.5
    );

    const emitAngle = impactAngle;
    const downAngle = Math.PI / 2;
    const blendedAngle = emitAngle * (1 - profile.downwardBias) + downAngle * profile.downwardBias;

    this.particleEmitter.emitMaterialParticles(
      mat,
      x,
      y,
      blendedAngle,
      profile.spreadCone,
      Math.floor(profile.particleCount * intensity)
    );

    if (profile.secondaryTexture && profile.secondaryCount) {
      const timer = this.scene.time.delayedCall(profile.stages.secondary, () => {
        this.particleEmitter.emitMaterialParticles(
          mat,
          x,
          y,
          blendedAngle,
          profile.spreadCone * 0.7,
          Math.floor(profile.secondaryCount! * intensity),
          profile.secondaryTexture
        );
      });
      this.pendingTimers.push(timer);
    }

    if (profile.settlingTexture && profile.settlingTint) {
      const timer = this.scene.time.delayedCall(profile.stages.settling, () => {
        this.particleEmitter.emitSettlingDust(x, y, intensity, profile);
      });
      this.pendingTimers.push(timer);
    }
  }

  public spawnImpactEffect(
    x: number,
    y: number,
    impactSpeed: number,
    material: string,
    impactAngle: number = Math.PI / 2
  ): void {
    this.impactEffects.spawnImpactEffect(x, y, impactSpeed, material as BlockMaterial, impactAngle);
  }

  public spawnShockwaveRing(x: number, y: number, material: string, impactSpeed: number): void {
    this.shockwaveEffects.spawnShockwaveRing(x, y, material as BlockMaterial, impactSpeed);
  }

  public static getMaterialColor(material: BlockMaterial): number {
    return materialRegistry.getColor(material);
  }

  public getMaterialColor(material: string): number {
    return materialRegistry.getColor(material as BlockMaterial);
  }

  public spawnExplosionParticles(
    x: number,
    y: number,
    _material: string,
    tier: ExplosionTier = "tntMedium"
  ): void {
    this.explosionEffects.spawnExplosionParticles(x, y, tier);
  }

  public spawnPigDeathEffect(
    x: number,
    y: number,
    scale: number,
    image: Phaser.Physics.Matter.Image | null,
    onComplete: () => void
  ): void {
    this.pigDeathEffects.spawnPigDeathEffect(x, y, scale, image, onComplete);
  }

  public update(
    targets: IFragmentCollidable[],
    worldBounds: { minX: number; minY: number; maxX: number; maxY: number }
  ): void {
    this.particleEmitter.update();
    this.fragmentManager.processQueue();

    if (!this.fragmentManager.hasActiveFragments() && !this.fragmentManager.hasQueuedFragments()) {
      BodyCache.getInstance().setDestructionMode(false);
      return;
    }

    BodyCache.getInstance().setDestructionMode(true);

    this.updateTick++;
    const qualityMultiplier = PerformanceManager.getQualityMultiplier(this.scene);
    const collisionCheckInterval =
      qualityMultiplier >= 0.75
        ? VFX_MANAGER_UPDATE_CONFIG.collisionCheckIntervalHigh
        : qualityMultiplier >= 0.5
          ? VFX_MANAGER_UPDATE_CONFIG.collisionCheckIntervalMedium
          : VFX_MANAGER_UPDATE_CONFIG.collisionCheckIntervalLow;

    if (this.updateTick % collisionCheckInterval === 0) {
      this.fragmentManager.checkFragmentPigCollisions(targets);
    }

    if (this.updateTick % VFX_MANAGER_UPDATE_CONFIG.cleanupIntervalMultiplier === 0) {
      this.fragmentManager.cleanupOutOfBoundsFragments(worldBounds);
    }
  }

  public spawnSpriteFragments(
    x: number,
    y: number,
    textureKey: string,
    blockWidth: number,
    blockHeight: number,
    material: string,
    impactSpeed: number,
    impactAngle: number = Math.PI / 2,
    rotation: number = 0
  ): void {
    if (!this.useSpriteFragmentation) {
      this.spawnDestructionEffect(x, y, material, impactSpeed, impactAngle);
      return;
    }

    this.fragmentManager
      .createFragments(
        x,
        y,
        textureKey,
        blockWidth,
        blockHeight,
        material,
        impactSpeed,
        impactAngle,
        rotation
      )
      .catch((err) => {
        console.warn("Fragment creation failed:", err);
      });

    this.spawnDestructionEffect(x, y, material, impactSpeed, impactAngle);
  }

  public setSpriteFragmentation(enabled: boolean): void {
    this.useSpriteFragmentation = enabled;
  }

  public setWakeCascadeManager(manager: IWakeCascadeManager): void {
    this.fragmentManager.setWakeCascadeManager(manager);
  }

  public setFragmentCollisionSoundCallback(callback: FragmentCollisionSoundCallback | null): void {
    this.fragmentManager.setCollisionSoundCallback(callback);
  }

  public setFragmentCollisionHapticCallback(
    callback: FragmentCollisionHapticCallback | null
  ): void {
    this.fragmentManager.setCollisionHapticCallback(callback);
  }

  public applyExplosionToFragments(
    explosionX: number,
    explosionY: number,
    radius: number,
    pushSpeed: number
  ): void {
    this.fragmentManager.applyExplosionToActiveFragments(explosionX, explosionY, radius, pushSpeed);
  }

  public hasQueuedFragments(): boolean {
    return this.fragmentManager.hasQueuedFragments();
  }

  /**
   * Pre-warm fragment atlases for the given block configurations.
   * This should be called during scene loading to avoid frame spikes during gameplay.
   */
  public async preWarmFragmentAtlases(configs: BlockPreWarmConfig[]): Promise<void> {
    return this.fragmentManager.preWarmForLevel(configs);
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.pendingTimers.forEach((t) => t.remove());
    this.pendingTimers = [];

    BodyCache.getInstance().setDestructionMode(false);

    this.pigDeathEffects.destroy();
    this.shockwaveEffects.destroy();
    this.explosionEffects.destroy();
    this.fragmentManager.destroy();
    this.particleEmitter.destroy();
  }
}

export default VFXManager;
