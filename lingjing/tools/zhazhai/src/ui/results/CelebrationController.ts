import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { LayoutManager } from "../LayoutManager";
import { gameEvents } from "../../events/EventBus";
import type { Position } from "../../types/Vector2";
import { getMobileSafeBlendMode } from "../../utils/MobileBlendMode";
import { PerformanceManager } from "../../systems/PerformanceManager";
import { MobileManager } from "../../systems/mobile/MobileManager";

export interface CelebrationConfig {
  scene: Phaser.Scene;
  won: boolean;
  birdPositions?: { x: number; y: number; texture: string }[];
  pigPositions?: Position[];
}

export class CelebrationController {
  private scene: Phaser.Scene;
  private particles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private static sharedEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor(config: CelebrationConfig) {
    this.scene = config.scene;

    if (config.won) {
      this.emitConfetti();
      gameEvents.emit("celebration-birds", {
        positions: config.birdPositions ?? [],
      });
    } else {
      gameEvents.emit("celebration-pigs", {
        positions: config.pigPositions ?? [],
      });
    }
  }

  private emitConfetti(): void {
    if (CelebrationController.sharedEmitter) {
      this.particles = CelebrationController.sharedEmitter;
      this.particles.setPosition(LayoutManager.CENTER_X, LayoutManager.CENTER_Y);
      this.particles.setActive(true);
      this.particles.setVisible(true);
      this.particles.start();
    } else {
      this.particles = this.scene.add.particles(
        LayoutManager.CENTER_X,
        LayoutManager.CENTER_Y,
        "vfx",
        {
          frame: "spark_01",
          speed: { min: 100, max: 200 },
          angle: { min: 0, max: 360 },
          scale: { start: 0.2, end: 0 },
          lifespan: 3000,
          blendMode: getMobileSafeBlendMode(
            PerformanceManager.getQualityMultiplier(this.scene),
            MobileManager.getInstance().isMobile()
          ),
          quantity: 8,
          frequency: 150,
          tint: [0xffd700, 0xff6b6b, 0x4ecdc4],
        }
      );
      CelebrationController.sharedEmitter = this.particles;
    }

    this.particles.setDepth(T.depth.hud);

    this.scene.time.delayedCall(3000, () => {
      if (this.particles) {
        this.particles.stop();
      }
    });
  }

  destroy(): void {
    if (this.particles) {
      this.particles.stop();
      this.particles.setActive(false);
      this.particles.setVisible(false);
    }
  }
}
