import Phaser from "phaser";
import { DesignTokens } from "../../config/DesignTokens";
import { SlingshotParticleConfig } from "../../config/SlingshotRenderConfig";

const CACHED_TINTS = [...SlingshotParticleConfig.tints];

export class SlingshotParticles {
  private scene: Phaser.Scene;
  private tensionEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.createTensionParticles();
  }

  private createTensionParticles(): void {
    const config = SlingshotParticleConfig;
    if (this.scene.textures.exists("vfx")) {
      this.tensionEmitter = this.scene.add.particles(0, 0, "vfx", {
        frame: config.frame,
        lifespan: config.lifespan,
        speed: { min: config.speedMin, max: config.speedMax },
        scale: { start: config.scaleStart, end: config.scaleEnd },
        alpha: { start: config.alphaStart, end: config.alphaEnd },
        tint: CACHED_TINTS,
        blendMode: "NORMAL",
        emitting: false,
        frequency: -1,
      });
      this.tensionEmitter.setDepth(DesignTokens.depth.slingshotParticles);
    }
  }

  emitTension(x: number, y: number, count: number = 3): void {
    if (this.tensionEmitter) {
      this.tensionEmitter.setPosition(x, y);
      this.tensionEmitter.explode(count);
    }
  }

  destroy(): void {
    if (this.tensionEmitter) {
      this.tensionEmitter.destroy();
      this.tensionEmitter = null;
    }
  }
}
