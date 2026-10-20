import Phaser from "phaser";
import {
  IInputHandler,
  InputHandlerCallbacks,
  InputHandlerDeps,
  InputState,
} from "./IInputHandler";
import { INPUT_CONFIG } from "../../config/GameConfig";

/**
 * Handles all pointer and keyboard input for the game scene
 * Implements native pinch zoom for mobile using Phaser's pointer management
 */
export class InputHandler implements IInputHandler {
  private scene: Phaser.Scene;
  private deps: InputHandlerDeps;
  private callbacks: InputHandlerCallbacks | null = null;
  private state: InputState = {
    isAiming: false,
    isDraggingCamera: false,
  };
  private cameraDragPrevX: number = 0;

  // Pinch zoom state - using Phaser's built-in pointer tracking
  private pinchPointer1: Phaser.Input.Pointer | null = null;
  private pinchPointer2: Phaser.Input.Pointer | null = null;
  private pinchStartDistance: number = 0;
  private pinchStartZoom: number = 1;
  private isPinching: boolean = false;

  private readonly MIN_PINCH_DISTANCE = 50; // Minimum distance between fingers to register pinch

  constructor(deps: InputHandlerDeps) {
    this.deps = deps;
    this.scene = deps.scene;
  }

  init(callbacks: InputHandlerCallbacks): void {
    this.callbacks = callbacks;
    this.setupPointerInput();
    this.setupKeyboardInput();
  }

  private setupPointerInput(): void {
    this.scene.input.on("pointerdown", this.handlePointerDown, this);
    this.scene.input.on("pointermove", this.handlePointerMove, this);
    this.scene.input.on("pointerup", this.handlePointerUp, this);
    this.scene.input.on("wheel", this.handleWheel, this);
  }

  private setupKeyboardInput(): void {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;

    keyboard.on("keydown-ESC", this.handleEscKey, this);
    keyboard.on("keydown-SPACE", this.handleSpaceKey, this);
    keyboard.on("keydown-E", this.handleEKey, this);
  }

  private handleEscKey(): void {
    this.callbacks?.onPauseToggle();
  }

  private handleSpaceKey(): void {
    if (!this.deps.isPaused() && this.state.isAiming) {
      this.callbacks?.onFire();
    }
  }

  private handleEKey(): void {
    if (this.deps.canActivateAbility()) {
      this.deps.activateAbility();
    }
  }

  private handleWheel(
    _pointer: Phaser.Input.Pointer,
    _gameObjects: unknown[],
    _deltaX: number,
    deltaY: number
  ): void {
    if (
      this.deps.isPaused() ||
      this.deps.isGameOver() ||
      this.deps.isTransitioning() ||
      this.state.isAiming
    ) {
      return;
    }

    // deltaY > 0 = scroll down = zoom out, deltaY < 0 = scroll up = zoom in
    const zoomDelta = -deltaY * 0.001;
    this.callbacks?.onCameraZoom(zoomDelta);
  }

  /**
   * Get all currently active (down) pointers from Phaser's input manager
   */
  private getActivePointers(): Phaser.Input.Pointer[] {
    return this.scene.input.manager.pointers.filter((p) => p.isDown);
  }

  /**
   * Calculate distance between two pointers
   */
  private getPinchDistance(p1: Phaser.Input.Pointer, p2: Phaser.Input.Pointer): number {
    return Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
  }

  /**
   * Start pinch zoom - capture initial state
   */
  private startPinchZoom(p1: Phaser.Input.Pointer, p2: Phaser.Input.Pointer): void {
    const distance = this.getPinchDistance(p1, p2);
    if (distance < this.MIN_PINCH_DISTANCE) {
      return; // Fingers too close together
    }

    this.pinchPointer1 = p1;
    this.pinchPointer2 = p2;
    this.pinchStartDistance = distance;
    this.pinchStartZoom = this.scene.cameras.main.zoom;
    this.isPinching = true;

    // Cancel any camera dragging when pinch starts
    this.state.isDraggingCamera = false;
  }

  /**
   * Process pinch zoom - calculate new zoom based on finger distance
   */
  private processPinchZoom(): void {
    if (!this.isPinching || !this.pinchPointer1 || !this.pinchPointer2) {
      return;
    }

    // LOCK: Disable zoom when aiming (interacting with slingshot)
    if (this.state.isAiming || this.deps.isPaused() || this.deps.isGameOver()) {
      return;
    }

    const currentDistance = this.getPinchDistance(this.pinchPointer1, this.pinchPointer2);
    if (currentDistance < 1) return; // Avoid division by zero

    // Calculate zoom factor: current distance / start distance
    const zoomFactor = currentDistance / this.pinchStartDistance;
    const newZoom = this.pinchStartZoom * zoomFactor;

    // Calculate delta to send to camera controller
    const currentZoom = this.scene.cameras.main.zoom;
    const zoomDelta = newZoom - currentZoom;

    // Apply zoom through callback (which handles clamping)
    this.callbacks?.onCameraZoom(zoomDelta);
  }

  /**
   * End pinch zoom
   */
  private endPinchZoom(): void {
    this.pinchPointer1 = null;
    this.pinchPointer2 = null;
    this.pinchStartDistance = 0;
    this.isPinching = false;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const activePointers = this.getActivePointers();

    // If we have 2 pointers, start pinch zoom mode
    if (activePointers.length === 2) {
      this.startPinchZoom(activePointers[0], activePointers[1]);
      return;
    }

    // If already pinching or more than 2 pointers, ignore
    if (activePointers.length > 2 || this.isPinching) {
      return;
    }

    if (this.deps.isPaused() || this.deps.isGameOver() || this.deps.isTransitioning()) {
      return;
    }

    // Right or middle click = camera drag (desktop)
    if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
      this.state.isDraggingCamera = true;
      this.cameraDragPrevX = pointer.x;
      return;
    }

    // Left click: Check for ability activation during flight (takes priority over camera drag)
    if (this.deps.canActivateAbility()) {
      this.deps.activateAbility();
      return;
    }

    // Left click during flight (after ability used or no ability): Allow camera drag (free camera mode)
    if (this.deps.isBirdInFlight()) {
      this.state.isDraggingCamera = true;
      this.cameraDragPrevX = pointer.x;
      this.deps.showTouchFeedback?.(pointer.x, pointer.y, "drag");
      return;
    }

    // Check if clicking/touching near the bird for aiming
    const bird = this.deps.slingshotGetBird();
    if (!bird) {
      // No bird available - allow camera drag
      this.state.isDraggingCamera = true;
      this.cameraDragPrevX = pointer.x;
      this.deps.showTouchFeedback?.(pointer.x, pointer.y, "drag");
      return;
    }

    const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const distance = Phaser.Math.Distance.Between(worldPoint.x, worldPoint.y, bird.x, bird.y);

    // Use dynamic hitbox radius based on device type
    const hitboxRadius = this.deps.getAimHitboxRadius();

    if (distance < hitboxRadius) {
      this.state.isAiming = true;
      this.deps.slingshotStartAiming();
      this.callbacks?.onAimStart();
      this.deps.showTouchFeedback?.(pointer.x, pointer.y, "aim");
      return;
    }

    // Left click/touch NOT near bird = camera drag (both desktop and mobile)
    this.state.isDraggingCamera = true;
    this.cameraDragPrevX = pointer.x;
    this.deps.showTouchFeedback?.(pointer.x, pointer.y, "drag");
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    // Update pinch pointers if they match
    if (this.isPinching) {
      if (this.pinchPointer1 && pointer.id === this.pinchPointer1.id) {
        this.pinchPointer1 = pointer;
      } else if (this.pinchPointer2 && pointer.id === this.pinchPointer2.id) {
        this.pinchPointer2 = pointer;
      }
      this.processPinchZoom();
      return;
    }

    // Check if we should start pinch (second finger moved)
    const activePointers = this.getActivePointers();
    if (activePointers.length === 2 && !this.isPinching) {
      this.startPinchZoom(activePointers[0], activePointers[1]);
      this.processPinchZoom();
      return;
    }

    // Handle camera dragging with incremental movement
    if (this.state.isDraggingCamera) {
      const deltaX = this.cameraDragPrevX - pointer.x;
      this.cameraDragPrevX = pointer.x;
      this.callbacks?.onCameraDrag(deltaX);
      return;
    }

    // Handle aiming
    if (!this.state.isAiming || this.deps.isPaused()) return;

    const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.deps.slingshotUpdateAim(worldPoint.x, worldPoint.y);
    this.callbacks?.onAimUpdate(worldPoint.x, worldPoint.y);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    const activePointers = this.getActivePointers();

    // End pinch if we drop below 2 pointers
    if (activePointers.length < 2 && this.isPinching) {
      this.endPinchZoom();
    }

    // If still have 2 pointers after lift, update pinch pointers
    if (activePointers.length === 2 && this.isPinching) {
      // One of our pointers was lifted, reassign
      if (
        (this.pinchPointer1 && pointer.id === this.pinchPointer1.id) ||
        (this.pinchPointer2 && pointer.id === this.pinchPointer2.id)
      ) {
        this.pinchPointer1 = activePointers[0];
        this.pinchPointer2 = activePointers[1];
        this.pinchStartDistance = this.getPinchDistance(activePointers[0], activePointers[1]);
        this.pinchStartZoom = this.scene.cameras.main.zoom;
      }
    }

    // Only process drag/aim end if this was the last pointer
    if (activePointers.length > 0) {
      return;
    }

    // End camera drag
    if (this.state.isDraggingCamera) {
      this.state.isDraggingCamera = false;
      this.callbacks?.onCameraDragEnd();
      return;
    }

    // End aiming
    if (!this.state.isAiming) return;

    const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const pullData = this.deps.slingshotUpdateAim(worldPoint.x, worldPoint.y);

    if (pullData && pullData.powerRatio > INPUT_CONFIG.minFirePowerRatio) {
      this.deps.showTouchFeedback?.(pointer.x, pointer.y, "fire");
      this.callbacks?.onAimEnd(worldPoint.x, worldPoint.y, pullData.powerRatio);
    } else {
      this.deps.slingshotCancel();
      this.callbacks?.onAimCancel();
    }

    this.state.isAiming = false;
  }

  isAiming(): boolean {
    return this.state.isAiming;
  }

  isDraggingCamera(): boolean {
    return this.state.isDraggingCamera;
  }

  setAiming(aiming: boolean): void {
    this.state.isAiming = aiming;
  }

  destroy(): void {
    // Remove pointer listeners
    this.scene.input.off("pointerdown", this.handlePointerDown, this);
    this.scene.input.off("pointermove", this.handlePointerMove, this);
    this.scene.input.off("pointerup", this.handlePointerUp, this);
    this.scene.input.off("wheel", this.handleWheel, this);

    // Remove keyboard listeners
    const keyboard = this.scene.input.keyboard;
    if (keyboard) {
      keyboard.off("keydown-ESC", this.handleEscKey, this);
      keyboard.off("keydown-SPACE", this.handleSpaceKey, this);
      keyboard.off("keydown-E", this.handleEKey, this);
    }

    // Clear pinch state
    this.endPinchZoom();

    this.callbacks = null;
  }
}
