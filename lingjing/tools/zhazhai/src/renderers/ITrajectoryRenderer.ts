import Phaser from "phaser";

/**
 * Trajectory point data
 */
export interface TrajectoryPoint {
  x: number;
  y: number;
}

/**
 * Interface for trajectory visualization
 * Separated from Slingshot class following SRP
 */
export interface ITrajectoryRenderer {
  /**
   * Draw trajectory points
   */
  draw(points: TrajectoryPoint[]): void;

  /**
   * Clear the trajectory
   */
  clear(): void;

  /**
   * Destroy graphics objects
   */
  destroy(): void;
}

/**
 * Dependencies for trajectory renderer
 */
export interface TrajectoryRendererDeps {
  scene: Phaser.Scene;
  levelHeight: number;
  levelWidth: number;
}
