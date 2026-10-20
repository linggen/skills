export interface VerletBandDefaultConfig {
  segments: number;
  damping: number;
  gravity: number;
  constraintIterations: number;
  restLengthMultiplier: number;
  waveSpeed: number;
  waveDecay: number;
  oscillationDecay: number;
}

export const VERLET_BAND_DEFAULTS: VerletBandDefaultConfig = {
  segments: 8,
  damping: 0.5,
  gravity: 0.4,
  constraintIterations: 12,
  restLengthMultiplier: 0.9,
  waveSpeed: 0.05,
  waveDecay: 0.75,
  oscillationDecay: 0.82,
} as const;

export interface VerletBandPhysicsConfig {
  tautModeLerpFactor: number;
  oldPositionLerpFactor: number;
  velocityFactorForSnapBack: number;
  waveThreshold: number;
  oscillationThreshold: number;
  oscillationPhaseIncrement: number;
  oscillationPhaseVariation: number;
  bandLengthThreshold: number;
  distanceThresholdForConstraints: number;
  constraintCorrectionFactor: number;
}

export const VERLET_BAND_PHYSICS: VerletBandPhysicsConfig = {
  tautModeLerpFactor: 0.4,
  oldPositionLerpFactor: 0.5,
  velocityFactorForSnapBack: 0.3,
  waveThreshold: 0.01,
  oscillationThreshold: 0.01,
  oscillationPhaseIncrement: 0.15,
  oscillationPhaseVariation: 0.04,
  bandLengthThreshold: 0.01,
  distanceThresholdForConstraints: 0.0001,
  constraintCorrectionFactor: 0.5,
} as const;

export interface VerletBandWaveConfig {
  envelopeExponent: number;
  travelingWaveAmplitude: number;
  standingWaveAmplitude: number;
  tensionStretchMultiplier: number;
  middleBoostFactor: number;
  initialWavePhase: number;
  waveIntensityMultiplier: number;
  oscillationAmplitudeMultiplier: number;
}

export const VERLET_BAND_WAVE: VerletBandWaveConfig = {
  envelopeExponent: 15,
  travelingWaveAmplitude: 0.35,
  standingWaveAmplitude: 0.2,
  tensionStretchMultiplier: 2,
  middleBoostFactor: 0.4,
  initialWavePhase: 1.0,
  waveIntensityMultiplier: 0.5,
  oscillationAmplitudeMultiplier: 0.1,
} as const;

export interface VerletBandQualityTierConfig {
  threshold?: number;
  segments: number;
  iterations: number;
}

export interface VerletBandQualityConfig {
  high: VerletBandQualityTierConfig;
  medium: VerletBandQualityTierConfig;
  low: VerletBandQualityTierConfig;
}

export const VERLET_BAND_QUALITY_CONFIG: VerletBandQualityConfig = {
  high: { threshold: 0.75, segments: 12, iterations: 12 },
  medium: { threshold: 0.5, segments: 8, iterations: 8 },
  low: { segments: 6, iterations: 4 },
} as const;
