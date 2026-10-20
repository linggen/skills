import type { IFragmentCollidable } from "./IFragmentManager";
import type {
  FragmentCollisionSoundCallback,
  FragmentCollisionHapticCallback,
} from "./IFragmentManager";
import type { ExplosionTier } from "../config/PhysicsConfig";
import type { IWakeCascadeManager } from "./IWakeCascadeManager";
import type { BlockPreWarmConfig } from "../systems/fragment/FragmentAtlasCache";
import type Phaser from "phaser";

export interface IVFXManager {
  spawnDestructionEffect(
    x: number,
    y: number,
    material: string,
    impactSpeed: number,
    impactAngle?: number
  ): void;
  spawnImpactEffect(
    x: number,
    y: number,
    impactSpeed: number,
    material: string,
    impactAngle?: number
  ): void;
  spawnShockwaveRing(x: number, y: number, material: string, impactSpeed: number): void;
  spawnExplosionParticles(x: number, y: number, material: string, tier?: ExplosionTier): void;
  spawnSpriteFragments(
    x: number,
    y: number,
    textureKey: string,
    blockWidth: number,
    blockHeight: number,
    material: string,
    impactSpeed: number,
    impactAngle?: number,
    rotation?: number
  ): void;
  spawnPigDeathEffect(
    x: number,
    y: number,
    scale: number,
    image: Phaser.Physics.Matter.Image | null,
    onComplete: () => void
  ): void;
  setSpriteFragmentation(enabled: boolean): void;
  setWakeCascadeManager(manager: IWakeCascadeManager): void;
  applyExplosionToFragments(
    explosionX: number,
    explosionY: number,
    radius: number,
    pushSpeed: number
  ): void;
  hasQueuedFragments?(): boolean;
  preWarmFragmentAtlases?(configs: BlockPreWarmConfig[]): Promise<void>;
  setFragmentCollisionSoundCallback?(callback: FragmentCollisionSoundCallback | null): void;
  setFragmentCollisionHapticCallback?(callback: FragmentCollisionHapticCallback | null): void;
  update(
    targets: IFragmentCollidable[],
    worldBounds: { minX: number; minY: number; maxX: number; maxY: number }
  ): void;
  getMaterialColor(material: string): number;
  destroy(): void;
}
