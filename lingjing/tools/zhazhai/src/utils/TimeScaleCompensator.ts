import type Phaser from "phaser";

export class TimeScaleCompensator {
  static compensateImpactSpeed(rawSpeed: number, scene: Phaser.Scene): number {
    const engine = scene.matter?.world?.engine;
    const timeScale = engine?.timing?.timeScale ?? 1;

    if (timeScale !== 1 && timeScale > 0) {
      return rawSpeed / timeScale;
    }

    return rawSpeed;
  }

  static getEffectiveTimeScale(scene: Phaser.Scene): number {
    return scene.matter?.world?.engine?.timing.timeScale ?? 1;
  }
}
