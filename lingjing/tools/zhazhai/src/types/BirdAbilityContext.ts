import type { Bird } from "../objects/Bird";
import type { Position, Velocity } from "./Vector2";

export interface BirdAbilityContext {
  bird: Bird;
  position: Position;
  velocity: Velocity;
  scene: Phaser.Scene;
  config: {
    abilityMultiplier?: number;
    explosionRadius?: number;
    splitCount?: number;
    splitAngle?: number;
    splitVelocityRatio?: number;
  };
}
