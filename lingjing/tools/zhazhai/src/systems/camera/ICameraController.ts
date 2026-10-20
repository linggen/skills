import { Pig } from "../../objects/Pig";
import { Block } from "../../objects/Block";
import type { Position, Velocity } from "../../types/Vector2";
import type { ICameraFollow, CameraFollowConfig } from "../../interfaces/camera/ICameraFollow";
import type { ICameraSequencer } from "../../interfaces/camera/ICameraSequencer";
import type { ICameraEffectsController } from "../../interfaces/camera/ICameraEffectsController";
import type { ICameraManualControl } from "../../interfaces/camera/ICameraManualControl";

export type { CameraFollowConfig };

export interface ICameraController
  extends ICameraFollow, ICameraSequencer, ICameraEffectsController, ICameraManualControl {
  setup(slingshotX: number, groundY: number): void;
  update(birdPos: Position, birdVel: Velocity): void;
  setEntities(pigs: Pig[], blocks: Block[]): void;
  destroy(): void;
}

export interface CameraControllerDeps {
  scene: Phaser.Scene;
}
