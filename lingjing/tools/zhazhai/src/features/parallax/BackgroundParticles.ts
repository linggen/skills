import Phaser from "phaser";
import { ThemeType, LEVEL_WIDTH, LEVEL_HEIGHT } from "../../config/GameConfig";
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from "../../config";
import {
  createParticleTextures,
  THEME_PARTICLE_LAYERS,
  THEME_BURST_COLORS,
} from "../../systems/particles";
import {
  BACKGROUND_PARTICLES_CONFIG,
  BACKGROUND_PARTICLES_SETUP_CONFIG,
} from "../../config/VFXConfig";
import { GraphicsPool } from "../../utils/ObjectPool";

export class BackgroundParticles {
  private scene: Phaser.Scene;
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private theme: ThemeType = "forest";
  private destroyed: boolean = false;
  private burstPool: GraphicsPool;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.burstPool = new GraphicsPool(scene, {
      initialSize: BACKGROUND_PARTICLES_SETUP_CONFIG.burstPoolInitialSize,
      maxSize: BACKGROUND_PARTICLES_SETUP_CONFIG.burstPoolMaxSize,
    });
  }

  setTheme(theme: ThemeType): void {
    if (this.destroyed) return;
    this.theme = theme;
    this.create();
  }

  create(): void {
    createParticleTextures(this.scene);
    this.scene.time.delayedCall(BACKGROUND_PARTICLES_SETUP_CONFIG.textureDelayMs, () => {
      if (!this.destroyed) {
        this.recreate();
      }
    });
  }

  private recreate(): void {
    if (this.destroyed) return;

    const camera = this.scene.cameras?.main;
    if (!camera) return;

    const layers = THEME_PARTICLE_LAYERS[this.theme];
    const zoom = camera.zoom;

    const spawnWidth = Math.max(
      LEVEL_WIDTH + BACKGROUND_PARTICLES_SETUP_CONFIG.spawnWidthPadding,
      (VIEWPORT_WIDTH / zoom) * 3
    );
    const spawnHeight = Math.max(
      LEVEL_HEIGHT,
      VIEWPORT_HEIGHT * BACKGROUND_PARTICLES_SETUP_CONFIG.viewportHeightMultiplier
    );

    for (const layer of layers) {
      const texture = this.scene.textures.exists(layer.texture) ? layer.texture : "softGlow";

      const emitZoneWidth = layer.emitZoneWidth ?? spawnWidth;
      const emitZoneHeight = layer.emitZoneHeight ?? spawnHeight;

      const emitter = this.scene.add.particles(LEVEL_WIDTH / 2, LEVEL_HEIGHT / 2, texture, {
        x: { min: -emitZoneWidth / 2, max: emitZoneWidth / 2 },
        y: { min: -emitZoneHeight / 2, max: emitZoneHeight / 2 },
        lifespan: layer.lifespan,
        speedX: layer.speedX,
        speedY: layer.speedY,
        scale: layer.scale,
        alpha: layer.alpha,
        tint: layer.tint,
        rotate: layer.rotate,
        quantity: 1,
        frequency: layer.lifespan / layer.count,
        blendMode: layer.blendMode,
        gravityY: layer.gravityY ?? 0,
      });

      emitter.setDepth(layer.depth);
      emitter.setScrollFactor(layer.scrollFactor);

      this.emitters.push(emitter);
    }
  }

  spawnBurst(x: number, y: number, radius: number): void {
    const colors = THEME_BURST_COLORS[this.theme];
    const burstCount = Math.floor(radius * BACKGROUND_PARTICLES_CONFIG.burstCountRadiusMultiplier);

    for (let i = 0; i < burstCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius * BACKGROUND_PARTICLES_CONFIG.burstDistanceMultiplier;
      const bx = x + Math.cos(angle) * distance;
      const by = y + Math.sin(angle) * distance;

      const particle = this.burstPool.acquire();
      particle.setDepth(-8);
      particle.setScrollFactor(0);

      const color = colors[Math.floor(Math.random() * colors.length)];
      const size =
        BACKGROUND_PARTICLES_CONFIG.burstSizeMin +
        Math.random() * BACKGROUND_PARTICLES_CONFIG.burstSizeMax;

      particle.clear();
      particle.fillStyle(color, BACKGROUND_PARTICLES_CONFIG.burstAlpha);
      particle.fillCircle(0, 0, size);
      particle.setPosition(bx, by);
      particle.setAlpha(0);

      this.scene.tweens.add({
        targets: particle,
        alpha: { from: BACKGROUND_PARTICLES_CONFIG.burstAlpha, to: 0 },
        scale: { from: 1, to: 2 },
        duration:
          BACKGROUND_PARTICLES_CONFIG.burstDurationBase +
          Math.random() * BACKGROUND_PARTICLES_CONFIG.burstDurationRange,
        ease: "Sine.easeOut",
        onComplete: () => this.burstPool.release(particle),
      });
    }
  }

  private destroyEmitters(): void {
    for (const emitter of this.emitters) {
      emitter.stop();
      emitter.destroy();
    }
    this.emitters = [];
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.destroyEmitters();
    this.burstPool.destroy();
  }
}
