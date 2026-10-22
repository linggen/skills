export enum SlingshotState {
  IDLE = "IDLE",
  READY = "READY",
  AIMING = "AIMING",
  FIRED = "FIRED",
}

export interface PullData {
  distance: number;
  angle: number;
  vector: Phaser.Math.Vector2;
  powerRatio: number;
  atMaxPower: boolean;
}

export interface SlingshotConfig {
  MAX_PULL: number;
  MIN_PULL: number;
  POST_WIDTH: number;
  POST_HEIGHT: number;
  VELOCITY_MULTIPLIER: number;
  /** The aim dots' reach in trajectory steps; unset, the simulator's default. */
  AIM_STEPS?: number;
}

export interface SlingshotCallbacks {
  onLaunch?: (velocity: Phaser.Math.Vector2) => void;
  onPullChange?: (pullData: PullData) => void;
  onBirdStateChanged?: (state: SlingshotState, bird?: Phaser.GameObjects.Image) => void;
}

export { PouchPhysics, type PouchPhysicsConfig } from "./PouchPhysics";
export { SlingshotParticles } from "./SlingshotParticles";
