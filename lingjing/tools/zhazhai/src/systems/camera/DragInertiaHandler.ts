import Phaser from "phaser";
import { DRAG_CONFIG } from "../../config/CameraConfig";

export interface DragInertiaHandlerDeps {
  camera: Phaser.Cameras.Scene2D.Camera;
  getScrollBoundsForZoom: (zoom: number) => { minScrollX: number; maxScrollX: number };
  destroyResetTween: () => void;
}

export class DragInertiaHandler {
  private deps: DragInertiaHandlerDeps;
  private velocity: number = 0;
  private isDragging: boolean = false;

  constructor(deps: DragInertiaHandlerDeps) {
    this.deps = deps;
  }

  handleDrag(deltaX: number): void {
    this.isDragging = true;
    this.deps.destroyResetTween();

    const { camera } = this.deps;
    const { minScrollX, maxScrollX } = this.deps.getScrollBoundsForZoom(camera.zoom);
    const newScrollX = Phaser.Math.Clamp(camera.scrollX + deltaX, minScrollX, maxScrollX);

    camera.scrollX = newScrollX;
    this.velocity = deltaX;
  }

  handleDragEnd(): void {
    this.isDragging = false;
  }

  update(): void {
    if (this.isDragging) return;

    if (Math.abs(this.velocity) < DRAG_CONFIG.inertiaThreshold) {
      this.velocity = 0;
      return;
    }

    const { camera } = this.deps;
    const { minScrollX, maxScrollX } = this.deps.getScrollBoundsForZoom(camera.zoom);
    const newScrollX = Phaser.Math.Clamp(camera.scrollX + this.velocity, minScrollX, maxScrollX);

    camera.scrollX = newScrollX;
    this.velocity *= DRAG_CONFIG.inertia;

    if (newScrollX <= minScrollX || newScrollX >= maxScrollX) {
      this.velocity = 0;
    }
  }

  resetVelocity(): void {
    this.velocity = 0;
  }

  destroy(): void {
    this.velocity = 0;
    this.isDragging = false;
  }
}
