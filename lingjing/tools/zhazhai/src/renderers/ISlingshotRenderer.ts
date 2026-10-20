import Phaser from "phaser";

/**
 * Data needed for rendering the slingshot bands
 */
export interface BandRenderData {
  leftPoints: Phaser.Math.Vector2[];
  rightPoints: Phaser.Math.Vector2[];
  pouchPos: Phaser.Math.Vector2;
  powerRatio: number;
  anchorLeft: Phaser.Math.Vector2;
  anchorRight: Phaser.Math.Vector2;
}

/**
 * Interface for slingshot visual rendering
 * Separated from Slingshot class following SRP
 */
export interface ISlingshotRenderer {
  /**
   * Draw the slingshot bands, pouch, and anchors
   */
  drawBands(data: BandRenderData): void;

  /**
   * Clear all graphics
   */
  clear(): void;

  /**
   * Destroy graphics objects
   */
  destroy(): void;
}

/**
 * Dependencies needed for slingshot renderer
 */
export interface SlingshotRendererDeps {
  scene: Phaser.Scene;
}
