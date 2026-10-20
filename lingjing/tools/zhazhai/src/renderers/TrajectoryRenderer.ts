import Phaser from "phaser";
import { DesignTokens } from "../config/DesignTokens";
import { TRAJECTORY_RENDER_CONFIG } from "../config/TrajectoryConfig";
import {
  ITrajectoryRenderer,
  TrajectoryPoint,
  TrajectoryRendererDeps,
} from "./ITrajectoryRenderer";

/**
 * Handles trajectory visualization for the slingshot
 */
export class TrajectoryRenderer implements ITrajectoryRenderer {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private levelHeight: number;
  private levelWidth: number;

  constructor(deps: TrajectoryRendererDeps) {
    this.scene = deps.scene;
    this.levelHeight = deps.levelHeight;
    this.levelWidth = deps.levelWidth;

    this.graphics = this.scene.add.graphics();
    this.graphics.setDepth(DesignTokens.depth.trajectory);
  }

  draw(points: TrajectoryPoint[]): void {
    this.graphics.clear();

    points.forEach((point, i) => {
      if (point.y > this.levelHeight || point.x > this.levelWidth) return;

      const alpha = Math.max(
        TRAJECTORY_RENDER_CONFIG.alphaMin,
        TRAJECTORY_RENDER_CONFIG.alphaMax -
          (i / points.length) * TRAJECTORY_RENDER_CONFIG.alphaFadeMultiplier
      );
      const dotSize = Math.max(
        TRAJECTORY_RENDER_CONFIG.dotMinSize,
        TRAJECTORY_RENDER_CONFIG.dotMaxSize - i * TRAJECTORY_RENDER_CONFIG.dotShrinkRate
      );

      // Shadow
      this.graphics.fillStyle(
        TRAJECTORY_RENDER_CONFIG.shadowColor,
        alpha * TRAJECTORY_RENDER_CONFIG.alphaFadeMultiplier
      );
      this.graphics.fillCircle(point.x, point.y, dotSize + TRAJECTORY_RENDER_CONFIG.shadowOffset);

      // White dot
      this.graphics.fillStyle(TRAJECTORY_RENDER_CONFIG.dotColor, alpha);
      this.graphics.fillCircle(point.x, point.y, dotSize);
    });
  }

  clear(): void {
    this.graphics.clear();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
