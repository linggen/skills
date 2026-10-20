import Phaser from "phaser";
import { ThemeType } from "../../../config/GameConfig";

export interface AtmosphereGlowConfig {
  color: number;
  radius: number;
  intensity: number;
}

function getTextureSize(radius: number): number {
  const maxRadius = radius * 1.5;
  const size = Math.ceil(maxRadius * 2);
  return Math.pow(2, Math.ceil(Math.log2(size)));
}

export function generateAtmosphereGlowTexture(
  scene: Phaser.Scene,
  key: string,
  config: AtmosphereGlowConfig
): void {
  const size = getTextureSize(config.radius);
  const graphics = scene.add.graphics();
  const centerX = size / 2;
  const centerY = size / 2;

  const layers = 4;
  const baseSteps = 80;

  for (let layer = 0; layer < layers; layer++) {
    const layerT = layer / layers;
    const layerRadius = config.radius * (1.5 - layerT * 0.8);
    const layerIntensity = config.intensity * (1 - layerT * 0.5);
    const steps = Math.floor(baseSteps * (1 - layerT * 0.3));

    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const radius = layerRadius * t;
      const falloff = Math.pow(1 - t, 1.5 + layerT);
      const alpha = layerIntensity * falloff;

      graphics.fillStyle(config.color, alpha);
      graphics.fillCircle(centerX, centerY, radius);
    }
  }

  const coreSteps = 40;
  const coreRadius = config.radius * 0.98;
  for (let i = coreSteps; i >= 0; i--) {
    const t = i / coreSteps;
    const radius = coreRadius * t;
    const alpha = config.intensity * 0.4 * (1 - t * t);
    graphics.fillStyle(0xffffff, alpha);
    graphics.fillCircle(centerX, centerY, radius);
  }

  graphics.generateTexture(key, size, size);
  graphics.destroy();
}

export function getAtmosphereGlowKey(theme: ThemeType): string {
  return `atmosphereGlow_${theme}`;
}
