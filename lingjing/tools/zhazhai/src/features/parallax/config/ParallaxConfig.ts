import { ThemeType } from "../../../config/GameConfig";

export const PARALLAX_POSITION_CONFIG = {
  skyStartY: -600,
  skyDepth: -200,
  tileWidthPadding: 800,
  tileHeightPadding: 600,
} as const;

export const PARALLAX_SCROLL_CONFIG = {
  scrollFactorYBase: 0.4,
  scrollFactorYMultiplier: 0.2,
  scrollFactorForTarget: 0.25,
} as const;

export const PARALLAX_SMOOTHING_CONFIG = {
  smoothingFactor1: 0.08,
  smoothingFactor2: 0.05,
  smoothingFactor3: 0.34,
  deltaNormalization: 16.67,
} as const;

export const PARALLAX_CLOUD_CONFIG = {
  bobAmplitude: 0.0009,
  bobFrequency: 0.01,
  bobOffset: 1,
  driftY: 0.01,
} as const;

export const PARALLAX_MENU_DRIFT_CONFIG = {
  timeMultiplier: 0.00003,
  amplitudeX: 0.05,
  amplitudeY: 0.01,
  frequencyY: 0.7,
} as const;

export const PARALLAX_EFFECTS_CONFIG = {
  graphicsDepth: -3,
  crossFadeColor: 0xfff8e1,
  crossFadeAlpha: 0.7,
  fadeOverlayDepth: 1000,
} as const;

export const PARALLAX_ATMOSPHERE_CONFIG = {
  saturationReduction: 0.5,
} as const;

export const PARALLAX_LAYER_RESPONSE_CONFIG = {
  foregroundScrollFactor: 0.8,
} as const;

export const ATMOSPHERE_GLOW_EFFECT_CONFIG = {
  slowPulseBase: 0.92,
  slowPulseAmplitude: 0.08,
  slowPulseFrequency: 0.0003,
  mediumPulseBase: 0.95,
  mediumPulseAmplitude: 0.05,
  mediumPulseFrequency: 0.0008,
  fastGlimmerBase: 0.98,
  fastGlimmerAmplitude: 0.02,
  fastGlimmerFrequency: 0.003,
  breatheBase: 1,
  breatheAmplitude: 0.08,
  breatheFrequency: 0.0002,
} as const;

export interface AtmosphereGlowPositionConfig {
  x: number;
  y: number;
  radius: number;
  intensity: number;
  depth: number;
}

export const ATMOSPHERE_GLOW_POSITION_CONFIGS: Record<ThemeType, AtmosphereGlowPositionConfig> = {
  forest: { x: 500, y: 50, radius: 150, intensity: 0.55, depth: -195 },
  desert: { x: 400, y: 30, radius: 250, intensity: 0.65, depth: -195 },
  castle: { x: -300, y: 150, radius: 300, intensity: 0.4, depth: -195 },
  ice: { x: 300, y: 80, radius: 100, intensity: 0.5, depth: -195 },
  volcano: { x: 0, y: 100, radius: 200, intensity: 0.7, depth: -195 },
  jungle: { x: 400, y: 60, radius: 120, intensity: 0.45, depth: -195 },
} as const;

export function getAtmosphereGlowPositionConfig(
  theme: ThemeType,
  tileCenterX: number
): AtmosphereGlowPositionConfig {
  const config = ATMOSPHERE_GLOW_POSITION_CONFIGS[theme];
  return {
    ...config,
    x: tileCenterX + config.x,
  };
}
