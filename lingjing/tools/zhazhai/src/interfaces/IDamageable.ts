/**
 * Interface for entities that can take damage
 * Implemented by Block and Pig classes
 */
import type { Position } from "../types/Vector2";

export interface IDamageable {
  readonly id: string;
  readonly maxHealth: number;
  currentHealth: number;
  takeDamage(amount: number, impactSpeed?: number, impactAngle?: number): void;
  isDestroyed(): boolean;
  getHealthPercent(): number;
  getPosition(): Position;
  getMatterImage(): Phaser.Physics.Matter.Image | null;
}
