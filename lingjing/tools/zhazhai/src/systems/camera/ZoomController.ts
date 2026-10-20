import type Phaser from "phaser";
import { ZOOM_CONFIG } from "../../config/CameraConfig";

export interface ZoomControllerDeps {
  scene: Phaser.Scene;
  camera: Phaser.Cameras.Scene2D.Camera;
}

export class ZoomController {
  private deps: ZoomControllerDeps;
  private target: number = ZOOM_CONFIG.max;
  private velocity: number = 0;

  constructor(deps: ZoomControllerDeps) {
    this.deps = deps;
    this.target = ZOOM_CONFIG.max;
  }

  setTarget(zoom: number): void {
    this.target = zoom;
  }

  setVelocity(velocity: number): void {
    this.velocity = velocity;
  }

  getTarget(): number {
    return this.target;
  }

  getVelocity(): number {
    return this.velocity;
  }

  update(delta: number): void {
    const { camera } = this.deps;
    const currentZoom = camera.zoom;

    const smoothTime =
      this.target < currentZoom ? ZOOM_CONFIG.outSmoothingMs : ZOOM_CONFIG.inSmoothingMs;

    const deltaSeconds = Math.max(delta / 1000, 0.0001);
    const omega = 2 / smoothTime;
    const x = omega * deltaSeconds;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = currentZoom - this.target;
    const temp = (this.velocity + omega * change) * deltaSeconds;

    this.velocity = (this.velocity - omega * temp) * exp;
    const nextZoom = this.target + (change + temp) * exp;

    camera.setZoom(nextZoom);
  }

  zoomTo(scale: number, duration: number = ZOOM_CONFIG.defaultDurationMs): void {
    this.target = scale;
    this.velocity = 0;
    this.deps.camera.zoomTo(scale, duration, "Sine.easeInOut");
  }

  reset(): void {
    this.target = ZOOM_CONFIG.max;
    this.velocity = 0;
  }

  destroy(): void {
    this.target = ZOOM_CONFIG.max;
    this.velocity = 0;
  }
}
