import type { Velocity } from "../../types/Vector2";

export interface ICameraEffectsController {
  applyAimAssist(angle: number, powerRatio: number): void;
  clearAimAssist(): void;
  beginReleaseHold(): void;
  beginFlight(launchVelocity?: Velocity): void;
  beginDestructionShowcase(scale: string): void;
  beginImpactFocus(anchorX: number, anchorY: number, impactSpeed: number): void;
  expandImpactFocus(x: number, y: number): void;
  isInImpactFocus(): boolean;
  releaseImpactFocus(): void;
}
