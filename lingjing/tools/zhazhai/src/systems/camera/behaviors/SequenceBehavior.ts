import type Phaser from "phaser";
import { SEQUENCE_CONFIG, ZOOM_CONFIG } from "../../../config/CameraConfig";
import { VIEWPORT_WIDTH } from "../../../config";
import type { BehaviorDeps, ScrollBounds } from "../types";

export interface SequenceBehaviorDeps extends BehaviorDeps {
  getFurthestTargetX: () => number;
  getScrollBoundsForZoom: (zoom: number) => ScrollBounds;
  getFloorAlignedScrollY: () => number;
  getInitialScrollForZoom: (zoom: number) => { x: number; y: number };
  setZoomTarget: (zoom: number) => void;
  setZoomVelocity: (velocity: number) => void;
  resetDragVelocity: () => void;
}

export class SequenceBehavior {
  private deps: SequenceBehaviorDeps;
  private introPanActive = false;
  private introPanTweens: Phaser.Tweens.Tween[] = [];
  private introPanOnComplete: (() => void) | null = null;
  private resetTween: Phaser.Tweens.Tween | null = null;
  private aimResetInProgress = false;

  constructor(deps: SequenceBehaviorDeps) {
    this.deps = deps;
  }

  isIntroPanning(): boolean {
    return this.introPanActive;
  }

  isAimResetInProgress(): boolean {
    return this.aimResetInProgress;
  }

  startIntroPan(onComplete: () => void): void {
    this.introPanOnComplete = onComplete;
    this.introPanActive = true;

    const { camera } = this.deps;
    const zoom = ZOOM_CONFIG.max;
    const viewportWidth = VIEWPORT_WIDTH / zoom;

    const { x: endX, y: endY } = this.deps.getInitialScrollForZoom(zoom);

    const furthestX = this.deps.getFurthestTargetX();
    const startScrollX = Math.max(
      0,
      furthestX + SEQUENCE_CONFIG.introPanTargetPadding - viewportWidth
    );

    camera.setScroll(startScrollX, endY);
    camera.setZoom(zoom);

    const panTween = this.deps.scene.tweens.add({
      targets: camera,
      scrollX: endX,
      duration: SEQUENCE_CONFIG.introPanDurationMs,
      ease: SEQUENCE_CONFIG.introPanEase,
      onComplete: () => {
        this.finishIntroPan();
      },
    });

    this.introPanTweens = [panTween];
  }

  skipIntroPan(): void {
    if (!this.introPanActive) return;

    this.killIntroPanTweens();

    const { camera } = this.deps;
    const { x: endX, y: endY } = this.deps.getInitialScrollForZoom(ZOOM_CONFIG.max);
    camera.setScroll(endX, endY);
    camera.setZoom(ZOOM_CONFIG.max);

    this.finishIntroPan();
  }

  resetToInitial(
    immediate: boolean = false,
    callbacks?: { onUpdate?: () => void; onComplete?: () => void }
  ): Phaser.Tweens.Tween | null {
    this.destroyResetTween();

    const { camera } = this.deps;

    if (immediate) {
      const targetZoom = ZOOM_CONFIG.aimMin;
      const { x: targetX, y: targetY } = this.deps.getInitialScrollForZoom(targetZoom);

      this.aimResetInProgress = true;

      this.resetTween = this.deps.scene.tweens.add({
        targets: camera,
        scrollX: targetX,
        scrollY: targetY,
        zoom: ZOOM_CONFIG.aimMin,
        duration: 750,
        ease: "Cubic.easeOut",
        onUpdate: () => {
          this.deps.setZoomTarget(camera.zoom);
          callbacks?.onUpdate?.();
        },
        onComplete: () => {
          this.resetTween = null;
          this.deps.setZoomTarget(ZOOM_CONFIG.aimMin);
          this.deps.setZoomVelocity(0);
          this.aimResetInProgress = false;
          callbacks?.onComplete?.();
        },
      });

      this.deps.resetDragVelocity();
      return this.resetTween;
    }

    const { x: targetX, y: targetY } = this.deps.getInitialScrollForZoom(ZOOM_CONFIG.max);

    this.resetTween = this.deps.scene.tweens.add({
      targets: camera,
      scrollX: targetX,
      scrollY: targetY,
      zoom: ZOOM_CONFIG.max,
      duration: SEQUENCE_CONFIG.resetDurationMs,
      ease: SEQUENCE_CONFIG.resetEase,
      onUpdate: () => {
        this.deps.setZoomTarget(camera.zoom);
        callbacks?.onUpdate?.();
      },
      onComplete: () => {
        this.resetTween = null;
        callbacks?.onComplete?.();
      },
    });

    this.deps.resetDragVelocity();
    return this.resetTween;
  }

  destroyResetTween(): void {
    this.resetTween?.destroy();
    this.resetTween = null;
    this.aimResetInProgress = false;
  }

  getResetTween(): Phaser.Tweens.Tween | null {
    return this.resetTween;
  }

  destroy(): void {
    this.killIntroPanTweens();
    this.destroyResetTween();
    this.introPanOnComplete = null;
  }

  private finishIntroPan(): void {
    this.introPanActive = false;
    this.introPanTweens = [];
    this.introPanOnComplete?.();
    this.introPanOnComplete = null;
  }

  private killIntroPanTweens(): void {
    for (const tween of this.introPanTweens) {
      tween.destroy();
    }
    this.introPanTweens = [];
  }
}
