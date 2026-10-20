import Phaser from "phaser";
import type { BlockMaterial } from "../constants/Materials";

export interface IFragmentCollidable {
  isDestroyed(): boolean;
  getMatterImage(): Phaser.Physics.Matter.Image | null;
  takeDamage(amount: number): void;
  getPosition(): { x: number; y: number };
}

export type FragmentCollisionSoundCallback = (material: BlockMaterial, impactSpeed: number) => void;

export type FragmentCollisionHapticCallback = (
  material: BlockMaterial,
  impactSpeed: number,
  areaRatio: number
) => void;

export interface IFragmentManager {
  createFragments(
    x: number,
    y: number,
    textureKey: string,
    width: number,
    height: number,
    material: string,
    impactSpeed: number,
    impactAngle?: number,
    rotation?: number
  ): Promise<Phaser.Physics.Matter.Image[]>;
  checkFragmentPigCollisions(targets: IFragmentCollidable[]): void;
  cleanupOutOfBoundsFragments(bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }): void;
  applyExplosionToActiveFragments(
    explosionX: number,
    explosionY: number,
    radius: number,
    pushSpeed: number
  ): void;
  hasQueuedFragments(): boolean;
  setCollisionSoundCallback?(callback: FragmentCollisionSoundCallback | null): void;
  setCollisionHapticCallback?(callback: FragmentCollisionHapticCallback | null): void;
  resetLevelState?(): void;
  destroy(): void;
}
