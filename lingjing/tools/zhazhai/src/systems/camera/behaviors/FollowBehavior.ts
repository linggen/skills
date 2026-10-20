import Phaser from "phaser";
import { VIEWPORT_WIDTH } from "../../../config";
import { FOLLOW_CONFIG } from "../../../config/CameraConfig";
import { CameraMode, usesReleaseBlend } from "../CameraMode";
import type { BehaviorDeps, ScrollBounds } from "../types";
import type { CameraFollowConfig } from "../ICameraController";
import type { Position } from "../../../types/Vector2";

export interface FollowBehaviorDeps extends BehaviorDeps {
  getScrollBoundsForZoom: (zoom: number) => ScrollBounds;
  getFloorAlignedScrollY: () => number;
  destroyResetTween: () => void;
  resetDragVelocity: () => void;
  getCameraMode: () => CameraMode;
}

export class FollowBehavior {
  private deps: FollowBehaviorDeps;

  private isFollowing = false;
  private currentLerp = FOLLOW_CONFIG.lerp;
  private currentOffset = new Phaser.Math.Vector2();
  private targetOffset = new Phaser.Math.Vector2();
  private offsetsFrozen = false;
  private manualTrackingActive = false;
  private manualTrackingPosition = new Phaser.Math.Vector2();

  constructor(deps: FollowBehaviorDeps) {
    this.deps = deps;
  }

  isActive(): boolean {
    return this.isFollowing;
  }

  setFollowing(following: boolean): void {
    this.isFollowing = following;
  }

  getCurrentOffset(): Phaser.Math.Vector2 {
    return this.currentOffset;
  }

  getTargetOffset(): Phaser.Math.Vector2 {
    return this.targetOffset;
  }

  isOffsetsFrozen(): boolean {
    return this.offsetsFrozen;
  }

  isManualTrackingActive(): boolean {
    return this.manualTrackingActive;
  }

  start(target: Phaser.GameObjects.GameObject, config?: CameraFollowConfig): void {
    const { camera } = this.deps;
    const lerp = config?.lerp ?? FOLLOW_CONFIG.lerp;
    const roundPixels = config?.roundPixels ?? true;
    const preserveOffset = config?.preserveOffset ?? false;
    const manualTracking = config?.manualTracking ?? false;
    const preservedScrollX = camera.scrollX;
    const preservedScrollY = camera.scrollY;

    this.currentLerp = lerp;
    this.deps.destroyResetTween();

    if (!preserveOffset) {
      this.currentOffset.set(0, 0);
      this.targetOffset.set(0, 0);
      this.offsetsFrozen = false;
    } else {
      this.targetOffset.copy(this.currentOffset);
      this.offsetsFrozen = manualTracking;
    }

    this.manualTrackingActive = manualTracking;

    if (this.manualTrackingActive) {
      camera.stopFollow();
      camera.setDeadzone(0, 0);
      camera.setFollowOffset(this.currentOffset.x, this.currentOffset.y);
      const targetPosition = target as unknown as Position;
      this.manualTrackingPosition.set(targetPosition.x, targetPosition.y);
    } else {
      camera.startFollow(target, roundPixels, lerp, FOLLOW_CONFIG.lerpY, 0, 0);
      camera.setDeadzone(FOLLOW_CONFIG.deadzoneWidth, FOLLOW_CONFIG.deadzoneHeight);
      camera.setFollowOffset(this.currentOffset.x, this.currentOffset.y);
    }

    if (preserveOffset) {
      camera.setScroll(preservedScrollX, preservedScrollY);
    }

    this.isFollowing = true;
    this.deps.resetDragVelocity();
  }

  setLerp(lerp: number): void {
    this.currentLerp = lerp;
    if (!this.isFollowing) return;
    this.deps.camera.setLerp(this.currentLerp, FOLLOW_CONFIG.lerpY);
  }

  stop(): void {
    const { camera } = this.deps;
    camera.stopFollow();
    camera.setDeadzone(0, 0);
    camera.setFollowOffset(0, 0);
    this.isFollowing = false;
    this.offsetsFrozen = false;
    this.manualTrackingActive = false;
    this.manualTrackingPosition.set(0, 0);
    this.currentOffset.set(0, 0);
    this.targetOffset.set(0, 0);
  }

  updateTargetPosition(x: number, y: number): void {
    if (this.manualTrackingActive) {
      this.manualTrackingPosition.set(x, y);
    }
  }

  setTargetOffset(x: number, y: number): void {
    this.targetOffset.set(x, y);
  }

  freezeOffsets(frozen: boolean): void {
    this.offsetsFrozen = frozen;
  }

  updateManualScroll(): void {
    const { camera } = this.deps;
    const zoom = camera.zoom;
    const viewportWidth = this.getViewportWidth() / zoom;
    const { minScrollX, maxScrollX } = this.deps.getScrollBoundsForZoom(zoom);
    const targetScrollX = Phaser.Math.Clamp(
      this.manualTrackingPosition.x -
        viewportWidth * FOLLOW_CONFIG.manualFollowViewportRatio +
        this.currentOffset.x,
      minScrollX,
      maxScrollX
    );
    const targetScrollY = this.deps.getFloorAlignedScrollY();

    camera.scrollX = Phaser.Math.Linear(camera.scrollX, targetScrollX, this.currentLerp);
    camera.scrollY = Phaser.Math.Linear(camera.scrollY, targetScrollY, FOLLOW_CONFIG.lerpY);
  }

  updateOffsetBlend(): void {
    if (!this.isFollowing) return;

    const { camera } = this.deps;
    const cameraMode = this.deps.getCameraMode();
    const blendFactor = usesReleaseBlend(cameraMode)
      ? FOLLOW_CONFIG.offsetBlendRelease
      : FOLLOW_CONFIG.offsetBlendDefault;

    const dx = this.targetOffset.x - this.currentOffset.x;
    const dy = this.targetOffset.y - this.currentOffset.y;
    const OFFSET_THRESHOLD = 0.5;

    if (Math.abs(dx) > OFFSET_THRESHOLD) {
      this.currentOffset.x = Phaser.Math.Linear(
        this.currentOffset.x,
        this.targetOffset.x,
        blendFactor
      );
    } else {
      this.currentOffset.x = this.targetOffset.x;
    }

    if (Math.abs(dy) > OFFSET_THRESHOLD) {
      this.currentOffset.y = Phaser.Math.Linear(
        this.currentOffset.y,
        this.targetOffset.y,
        blendFactor
      );
    } else {
      this.currentOffset.y = this.targetOffset.y;
    }

    camera.setFollowOffset(this.currentOffset.x, this.currentOffset.y);
  }

  reset(): void {
    this.isFollowing = false;
    this.currentLerp = FOLLOW_CONFIG.lerp;
    this.currentOffset.set(0, 0);
    this.targetOffset.set(0, 0);
    this.offsetsFrozen = false;
    this.manualTrackingActive = false;
    this.manualTrackingPosition.set(0, 0);
  }

  destroy(): void {
    this.reset();
  }

  private getViewportWidth(): number {
    return VIEWPORT_WIDTH;
  }
}
