export interface SFXImpactConfig {
  speedNormalization: number;
  thresholds: { heavy: number; medium: number };
  volumeBase: number;
  volumeRange: number;
  rateBase: number;
  rateRange: number;
}

export interface SFXBirdLaunchConfig {
  powerNormalization: number;
  volumeBase: number;
  volumeRange: number;
  rateBase: number;
  rateRange: number;
}

export interface SFXBirdImpactConfig {
  speedNormalization: number;
  volumeBase: number;
  volumeRange: number;
  rateBase: number;
  rateRange: number;
}

export interface SFXConfig {
  impact: SFXImpactConfig;
  destroyVolume: number;
  birdLaunch: SFXBirdLaunchConfig;
  birdImpact: SFXBirdImpactConfig;
  scoreVolume: number;
  explosionVolume: number;
  split: { volume: number; rate: number };
  eggDropVolume: number;
}

export interface UIAudioConfig {
  defaultVolume: number;
}

export const SFX_CONFIG: SFXConfig = {
  impact: {
    speedNormalization: 15,
    thresholds: { heavy: 0.6, medium: 0.3 },
    volumeBase: 0.5,
    volumeRange: 0.5,
    rateBase: 0.8,
    rateRange: 0.4,
  },
  destroyVolume: 0.85,
  birdLaunch: {
    powerNormalization: 1.5,
    volumeBase: 0.4,
    volumeRange: 0.3,
    rateBase: 0.9,
    rateRange: 0.2,
  },
  birdImpact: {
    speedNormalization: 10,
    volumeBase: 0.2,
    volumeRange: 0.4,
    rateBase: 0.8,
    rateRange: 0.4,
  },
  scoreVolume: 0.85,
  explosionVolume: 0.85,
  split: { volume: 0.75, rate: 1.1 },
  eggDropVolume: 0.7,
};

export const UI_AUDIO_CONFIG: UIAudioConfig = {
  defaultVolume: 0.5,
};
