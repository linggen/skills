import type { PullData } from "../../objects/slingshot-modules/SlingshotConfig";

/**
 * Callbacks for input events
 */
export interface InputHandlerCallbacks {
  onAimStart: () => void;
  onAimUpdate: (worldX: number, worldY: number) => void;
  onAimEnd: (worldX: number, worldY: number, powerRatio: number) => void;
  onAimCancel: () => void;
  onCameraDrag: (deltaX: number) => void;
  onCameraDragEnd: () => void;
  onCameraZoom: (delta: number) => void;
  onPauseToggle: () => void;
  onFire: () => void;
  onAbilityActivate: () => void;
}

/**
 * Input state for queries
 */
export interface InputState {
  isAiming: boolean;
  isDraggingCamera: boolean;
}

/**
 * Interface for Input Handler
 * Handles all pointer and keyboard input
 */
export interface IInputHandler {
  /**
   * Initialize input listeners
   */
  init(callbacks: InputHandlerCallbacks): void;

  /**
   * Check if currently aiming
   */
  isAiming(): boolean;

  /**
   * Check if currently dragging camera
   */
  isDraggingCamera(): boolean;

  /**
   * Set aiming state
   */
  setAiming(aiming: boolean): void;

  /**
   * Cleanup input listeners
   */
  destroy(): void;
}

/**
 * Dependencies for InputHandler
 */
export interface InputHandlerDeps {
  scene: Phaser.Scene;
  slingshotGetBird: () => Phaser.GameObjects.Image | null;
  slingshotStartAiming: () => void;
  slingshotUpdateAim: (x: number, y: number) => PullData | null;
  slingshotCancel: () => void;
  isPaused: () => boolean;
  isGameOver: () => boolean;
  isTransitioning: () => boolean;
  canActivateAbility: () => boolean;
  activateAbility: () => void;
  isTouchDevice: () => boolean;
  getAimHitboxRadius: () => number;
  /** Check if bird is currently in flight (after launch, before settle) */
  isBirdInFlight: () => boolean;
  showTouchFeedback?: (
    screenX: number,
    screenY: number,
    type: "tap" | "aim" | "fire" | "drag"
  ) => void;
}
