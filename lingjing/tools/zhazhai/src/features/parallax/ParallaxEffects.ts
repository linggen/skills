import Phaser from "phaser";
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from "../../config";
import { ThemeType } from "../../config/GameConfig";
import { getThemeColors } from "./config/ThemeColors";
import { PARALLAX_EFFECTS_CONFIG } from "./config/ParallaxConfig";

interface AmbientPulse {
  graphics: Phaser.GameObjects.Graphics;
  intensity: number;
  duration: number;
  elapsed: number;
  color: number;
}

export class ParallaxEffects {
  private scene: Phaser.Scene;
  private theme: ThemeType = "forest";

  private ambientPulses: AmbientPulse[] = [];

  private fadeOverlay: Phaser.GameObjects.Graphics | null = null;
  private isFading: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(): void {
    this.createFadeOverlay();
  }

  setTheme(theme: ThemeType): void {
    this.theme = theme;
  }

  private createFadeOverlay(): void {
    this.fadeOverlay = this.scene.add.graphics();
    this.fadeOverlay.setPosition(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2);
    this.fadeOverlay.setDepth(PARALLAX_EFFECTS_CONFIG.fadeOverlayDepth);
    this.fadeOverlay.setAlpha(0);
    this.fadeOverlay.setScrollFactor(0);

    this.fadeOverlay.fillStyle(0x000000, 1);
    this.fadeOverlay.fillRect(
      -VIEWPORT_WIDTH,
      -VIEWPORT_HEIGHT,
      VIEWPORT_WIDTH * 2,
      VIEWPORT_HEIGHT * 2
    );
  }

  ambientPulse(intensity: number, duration: number): void {
    const colors = getThemeColors(this.theme);

    const graphics = this.scene.add.graphics();
    graphics.setPosition(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2);
    graphics.setDepth(PARALLAX_EFFECTS_CONFIG.graphicsDepth);
    graphics.setScrollFactor(0);
    graphics.setAlpha(0);

    graphics.fillStyle(colors.ambientGlow, 1);
    graphics.fillCircle(0, 0, VIEWPORT_WIDTH);

    const pulse: AmbientPulse = {
      graphics,
      intensity,
      duration,
      elapsed: 0,
      color: colors.ambientGlow,
    };

    this.ambientPulses.push(pulse);
  }

  fadeToBlack(duration: number, callback?: () => void): void {
    if (!this.fadeOverlay || this.isFading) return;
    this.isFading = true;

    this.scene.tweens.add({
      targets: this.fadeOverlay,
      alpha: 1,
      duration,
      ease: "Sine.easeIn",
      onComplete: () => {
        if (callback) callback();
      },
    });
  }

  fadeFromBlack(duration: number, callback?: () => void): void {
    if (!this.fadeOverlay) return;

    this.scene.tweens.add({
      targets: this.fadeOverlay,
      alpha: 0,
      duration,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.isFading = false;
        if (callback) callback();
      },
    });
  }

  crossFadeTransition(duration: number, onMidpoint: () => void, onComplete: () => void): void {
    if (!this.fadeOverlay) {
      onMidpoint();
      onComplete();
      return;
    }

    this.isFading = true;

    this.fadeOverlay.clear();
    this.fadeOverlay.fillStyle(PARALLAX_EFFECTS_CONFIG.crossFadeColor, 1);
    this.fadeOverlay.fillRect(
      -VIEWPORT_WIDTH,
      -VIEWPORT_HEIGHT,
      VIEWPORT_WIDTH * 2,
      VIEWPORT_HEIGHT * 2
    );
    this.fadeOverlay.setAlpha(0);

    const halfDuration = duration / 2;

    this.scene.tweens.add({
      targets: this.fadeOverlay,
      alpha: PARALLAX_EFFECTS_CONFIG.crossFadeAlpha,
      duration: halfDuration,
      ease: "Sine.easeIn",
      onComplete: () => {
        onMidpoint();

        this.scene.tweens.add({
          targets: this.fadeOverlay,
          alpha: 0,
          duration: halfDuration,
          ease: "Sine.easeOut",
          onComplete: () => {
            this.isFading = false;
            onComplete();
          },
        });
      },
    });
  }

  reset(): void {
    for (const pulse of this.ambientPulses) {
      pulse.graphics.destroy();
    }
    this.ambientPulses = [];

    if (this.fadeOverlay) {
      this.fadeOverlay.setAlpha(0);
    }
    this.isFading = false;
  }

  update(_time: number, delta: number): void {
    this.updateAmbientPulses(delta);
  }

  private updateAmbientPulses(delta: number): void {
    const toRemove: number[] = [];

    for (let i = 0; i < this.ambientPulses.length; i++) {
      const pulse = this.ambientPulses[i];
      pulse.elapsed += delta;

      if (pulse.elapsed >= pulse.duration) {
        toRemove.push(i);
        pulse.graphics.destroy();
        continue;
      }

      const progress = pulse.elapsed / pulse.duration;
      const alpha = pulse.intensity * Math.sin(progress * Math.PI);
      pulse.graphics.setAlpha(alpha);
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.ambientPulses.splice(toRemove[i], 1);
    }
  }

  destroy(): void {
    this.reset();

    if (this.fadeOverlay) {
      this.fadeOverlay.destroy();
      this.fadeOverlay = null;
    }
  }
}
