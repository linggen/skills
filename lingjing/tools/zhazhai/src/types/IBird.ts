import type { BirdType } from "./BirdType";
import type { BirdState } from "./BirdState";
import type { Position, Velocity } from "./Vector2";

export interface IBird {
  readonly type: BirdType;
  readonly id: string;
  state: BirdState;

  getPosition(): Position;
  getVelocity(): Velocity;
  setPosition(x: number, y: number): void;
  setStatic(isStatic: boolean): void;
  getRadius(): number;
  isLaunched(): boolean;
  canActivateAbility(): boolean;
  activateAbility(): void;
  launch(velocityX: number, velocityY: number): void;
  destroy(): void;
}
