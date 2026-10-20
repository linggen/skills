import Phaser from "phaser";
import { ParallaxSystem } from "../../features/parallax";
import { ThemeType } from "../../config/GameConfig";

export class MenuParallaxController {
  private scene: Phaser.Scene;
  private parallaxSystem: ParallaxSystem;
  private isDestroyed: boolean = false;

  constructor(scene: Phaser.Scene, theme?: ThemeType) {
    this.scene = scene;
    this.parallaxSystem = new ParallaxSystem(this.scene, theme);
  }

  getTheme(): ThemeType {
    return this.parallaxSystem.getTheme();
  }

  setTheme(theme: ThemeType): void {
    if (this.isDestroyed) return;
    this.parallaxSystem.setTheme(theme);
  }

  update(time: number, delta: number): void {
    if (this.isDestroyed) return;
    this.parallaxSystem.updateWithDrift(time, delta);
  }

  fadeToBlack(duration: number, callback?: () => void): void {
    if (this.isDestroyed) return;
    this.parallaxSystem.fadeToBlack(duration, callback);
  }

  fadeFromBlack(duration: number, callback?: () => void): void {
    if (this.isDestroyed) return;
    this.parallaxSystem.fadeFromBlack(duration, callback);
  }

  spawnParticleBurst(x: number, y: number, radius: number): void {
    if (this.isDestroyed) return;
    this.parallaxSystem.spawnParticleBurst(x, y, radius);
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.parallaxSystem.destroy();
  }
}
