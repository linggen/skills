import type Phaser from "phaser";
import type { Position, Velocity } from "../../types/Vector2";

export interface FlightFramingInput {
  birdPos: Position;
  birdVel: Velocity;
  slingshotX: number;
  furthestTargetX: number;
  topmostTargetY: number;
  viewportHeight: number;
}

export interface FlightOffset {
  x: number;
  y: number;
}

export interface FlightPhaseOutput {
  zoomTarget: number | null;
  offset: FlightOffset;
}

export interface ScrollBounds {
  minScrollX: number;
  maxScrollX: number;
}

export type ImpactFocusBounds = ScrollBounds;

export interface ImpactFocusStartState {
  lockedScrollY: number;
  lockedZoom: number;
}

export interface BeginImpactFocusInput {
  anchorX: number;
  anchorY: number;
  impactSpeed: number;
  cameraScrollY: number;
  floorAlignedScrollY: number;
  cameraZoom: number;
  minZoom: number;
  maxZoom: number;
}

export interface ExpandImpactFocusInput {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface ImpactFocusScrollInput {
  zoom: number;
  viewportWidth: number;
  bounds: ScrollBounds;
}

export interface BehaviorDeps {
  scene: Phaser.Scene;
  camera: Phaser.Cameras.Scene2D.Camera;
}
