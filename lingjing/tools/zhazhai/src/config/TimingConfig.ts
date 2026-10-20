export const MISC_TIMING_CONFIG = {
  jingleDelayMs: 1500,
  settingsDebounceMs: 50,
  juiceShakeDurationMs: 150,
} as const;

export const TimingConfig = {
  frame: {
    frameMs: 1000 / 60,
  },

  slingshot: {
    resetDelay: 30,
    pouchSnapDuration: 150,
    bandRelaxDuration: 200,
    waveImpulseDelay: 60,
    tensionParticleDelay: 50,
  },

  physicsSettle: {
    velocityThreshold: 0.05,
    angularThreshold: 0.03,
    requiredFrames: 120,
    maxWaitTime: 10000,
    earlySettleFrames: 30,
    minWaitAfterLaunch: 250,
    destructionQuietPeriodMs: 250,
    adaptive: {
      enabled: true,
      requiredFramesSimple: 45,
      requiredFramesNormal: 90,
      requiredFramesComplex: 120,
      complexityThreshold: 5,
    },
  },

  transition: {
    revealDelay: 50,
    shaderDuration: 400,
    holdDuration: 100,
    sceneNavigatorDelay: 10,
    fadeToBlackDuration: 300,
  },

  scene: {
    physicsProfileUpdateInterval: 60,
    entityCleanupInterval: 500,
  },

  entityManager: {
    outOfBoundsThreshold: 50,
  },

  celebration: {
    pouchFallbackX: 180,
    pouchSpacing: 100,
    birdSpacing: 70,
    fallbackGroundY: 500,
  },
} as const;

export function msToFrames(ms: number): number {
  return Math.ceil(ms / TimingConfig.frame.frameMs);
}

export function framesToMs(frames: number): number {
  return frames * TimingConfig.frame.frameMs;
}
