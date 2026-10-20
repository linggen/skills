import Phaser from "phaser";
import { clamp, lerp } from "../../../utils/RandomHelpers";
import { IMPACT_CONFIG, ZOOM_CONFIG } from "../../../config/CameraConfig";
import { CameraMode } from "../CameraMode";
import type { Position } from "../../../types/Vector2";
import type {
  BehaviorDeps,
  ScrollBounds,
  ImpactFocusStartState,
  BeginImpactFocusInput,
  ImpactFocusScrollInput,
} from "../types";

export interface ImpactBehaviorDeps extends BehaviorDeps {
  getFloorAlignedScrollY: () => number;
  getScrollBoundsForZoom: (zoom: number) => ScrollBounds;
  setCameraMode: (mode: CameraMode) => void;
  stopFollow: () => void;
  resetDragVelocity: () => void;
  destroyResetTween: () => void;
  setZoomTarget: (zoom: number) => void;
  setZoomVelocity: (velocity: number) => void;
}

export class ImpactBehavior {
  private deps: ImpactBehaviorDeps;

  private active = false;
  private anchorX = 0;
  private anchorY = 0;
  private lockedScrollY: number;
  private lockedZoom: number;
  private lookAheadBoostX = 0;
  private clusterMinX = 0;
  private clusterMaxX = 0;
  private clusterMinY = 0;
  private clusterMaxY = 0;

  constructor(deps: ImpactBehaviorDeps) {
    this.deps = deps;
    this.lockedZoom = ZOOM_CONFIG.max;
    this.lockedScrollY = 0;
  }

  isActive(): boolean {
    return this.active;
  }

  reset(): void {
    this.active = false;
    this.anchorX = 0;
    this.anchorY = 0;
    this.lockedScrollY = 0;
    this.lockedZoom = ZOOM_CONFIG.max;
    this.lookAheadBoostX = 0;
    this.clusterMinX = 0;
    this.clusterMaxX = 0;
    this.clusterMinY = 0;
    this.clusterMaxY = 0;
  }

  beginDestructionShowcase(scale: string): void {
    const zoomDelta = IMPACT_CONFIG.showcaseZoomDeltas[scale] ?? 0;
    if (zoomDelta <= 0) return;

    const { camera } = this.deps;
    const newZoom = Phaser.Math.Clamp(camera.zoom - zoomDelta, ZOOM_CONFIG.min, ZOOM_CONFIG.max);
    this.deps.setZoomTarget(newZoom);
  }

  beginImpactFocus(anchorX: number, anchorY: number, impactSpeed: number): boolean {
    const { camera, getFloorAlignedScrollY } = this.deps;

    if (this.active) return false;

    const focusState = this.beginInternal({
      anchorX,
      anchorY,
      impactSpeed,
      cameraScrollY: camera.scrollY,
      floorAlignedScrollY: getFloorAlignedScrollY(),
      cameraZoom: camera.zoom,
      minZoom: ZOOM_CONFIG.min,
      maxZoom: ZOOM_CONFIG.max,
    });

    if (!focusState) return false;

    this.deps.setCameraMode(CameraMode.ImpactFocus);
    this.deps.stopFollow();
    this.deps.resetDragVelocity();
    this.deps.destroyResetTween();
    this.deps.setZoomTarget(focusState.lockedZoom);
    this.deps.setZoomVelocity(0);
    camera.scrollY = focusState.lockedScrollY;

    return true;
  }

  expandImpactFocus(
    x: number,
    y: number,
    viewportWidth: number,
    viewportHeight: number
  ): number | null {
    if (!this.active) return null;

    this.clusterMinX = Math.min(this.clusterMinX, x);
    this.clusterMaxX = Math.max(this.clusterMaxX, x);
    this.clusterMinY = Math.min(this.clusterMinY, y);
    this.clusterMaxY = Math.max(this.clusterMaxY, y);

    const halfSpanX = Math.max(this.anchorX - this.clusterMinX, this.clusterMaxX - this.anchorX, 1);
    const halfSpanY = Math.max(this.anchorY - this.clusterMinY, this.clusterMaxY - this.anchorY, 1);
    const clusterW = halfSpanX * 2 + IMPACT_CONFIG.clusterPadding * 2;
    const clusterH = halfSpanY * 2 + IMPACT_CONFIG.clusterPadding * 2;
    const zoomFit = Math.min(viewportWidth / clusterW, viewportHeight / clusterH);

    return clamp(zoomFit, IMPACT_CONFIG.maxZoomOut, this.lockedZoom);
  }

  getScrollForZoom(input: ImpactFocusScrollInput): Position | null {
    if (!this.active) return null;

    const viewWidth = input.viewportWidth / input.zoom;
    const lockedViewWidth = input.viewportWidth / this.lockedZoom;
    const zoomCompensationX =
      Math.max(0, viewWidth - lockedViewWidth) * IMPACT_CONFIG.zoomCompensation;
    const targetFocusX = this.getFocusX() + zoomCompensationX;

    return {
      x: clamp(
        targetFocusX - viewWidth * IMPACT_CONFIG.screenX,
        input.bounds.minScrollX,
        input.bounds.maxScrollX
      ),
      y: this.lockedScrollY,
    };
  }

  releaseImpactFocus(): void {
    this.reset();
    this.deps.setCameraMode(CameraMode.Idle);
  }

  destroy(): void {
    this.reset();
  }

  private beginInternal(input: BeginImpactFocusInput): ImpactFocusStartState | null {
    if (this.active) return null;

    this.active = true;
    this.anchorX = input.anchorX;
    this.anchorY = input.anchorY;
    this.lockedScrollY = Math.max(input.cameraScrollY, input.floorAlignedScrollY);
    this.lockedZoom = clamp(input.cameraZoom, input.minZoom, input.maxZoom);
    this.lookAheadBoostX = lerp(
      IMPACT_CONFIG.baseLookAhead,
      IMPACT_CONFIG.maxLookAhead,
      clamp(input.impactSpeed / IMPACT_CONFIG.impactSpeedNormalization, 0, 1)
    );
    this.clusterMinX = input.anchorX;
    this.clusterMaxX = input.anchorX;
    this.clusterMinY = input.anchorY;
    this.clusterMaxY = input.anchorY;

    return {
      lockedScrollY: this.lockedScrollY,
      lockedZoom: this.lockedZoom,
    };
  }

  private getFocusX(): number {
    const boostedLeadX = Math.max(IMPACT_CONFIG.baseLookAhead, this.lookAheadBoostX);
    const dominantEdgeX = Math.max(
      this.clusterMaxX + IMPACT_CONFIG.forwardPadding,
      this.anchorX + IMPACT_CONFIG.minRightLead + boostedLeadX
    );
    const edgeTravel = Math.max(0, dominantEdgeX - this.anchorX);
    const leadX = Math.min(edgeTravel * IMPACT_CONFIG.leadFactor, IMPACT_CONFIG.maxLead);

    return dominantEdgeX + leadX;
  }
}
