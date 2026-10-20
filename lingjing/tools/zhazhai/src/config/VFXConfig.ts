import { PigSize } from "../constants/PigSize";

export const VFX_ATLAS_KEY = "vfx" as const;

export interface PigDeathConfig {
  pushForce: {
    baseRadius: number;
    pushSpeed: number;
    wakeRadiusMultiplier: number;
  };

  puff: {
    atlasKey: string;
    count: number;
    textures: string[];
    scaleMin: number;
    scaleMax: number;
    offsetDistance: number;
    alpha: number;
    color: number;
    duration: number;
    fadeOutDuration: number;
  };

  splat: {
    atlasKey: string;
    textures: string[];
    scale: number;
    color: number;
    bounceScale: number;
    duration: number;
    lingerDuration: number;
    fadeOutDuration: number;
  };

  screenPulse: {
    intensity: number;
    duration: number;
  };
}

export const PIG_DEATH_CONFIG: PigDeathConfig = {
  pushForce: {
    baseRadius: 140,
    pushSpeed: 50,
    wakeRadiusMultiplier: 2,
  },
  puff: {
    atlasKey: VFX_ATLAS_KEY,
    count: 2,
    textures: ["circle_01", "circle_02", "circle_03"],
    scaleMin: 0.8,
    scaleMax: 1.2,
    offsetDistance: 10,
    alpha: 0.8,
    color: 0xffffff,
    duration: 150,
    fadeOutDuration: 100,
  },
  splat: {
    atlasKey: VFX_ATLAS_KEY,
    textures: ["splat02", "splat10", "splat11", "splat12", "splat32", "splat33"],
    scale: 0.7,
    color: 0x44aa44,
    bounceScale: 1.15,
    duration: 200,
    lingerDuration: 500,
    fadeOutDuration: 200,
  },
  screenPulse: {
    intensity: 0.1,
    duration: 100,
  },
};

export const PIG_SIZE_RADIUS_MULTIPLIER: Record<PigSize, number> = {
  [PigSize.SMALL]: 1.0,
  [PigSize.MEDIUM]: 1.25,
  [PigSize.LARGE]: 1.5,
};

export interface ComboIndicatorConfig {
  text: {
    fontFamily: string;
    fontSize: string;
    color: string;
    strokeColor: string;
    strokeThickness: number;
  };

  animation: {
    bounceScale: number;
    bounceDuration: number;
    wobbleAmplitude: number;
    wobbleFrequency: number;
    riseDistance: number;
    fadeDuration: number;
    totalDuration: number;
  };

  stars: {
    atlasKey: string;
    count: number;
    textures: string[];
    scale: number;
    burstRadius: number;
    duration: number;
    colors: number[];
  };

  screenFlash: {
    threshold: number;
    color: number;
    alpha: number;
    duration: number;
  };
}

export const COMBO_INDICATOR_CONFIG: ComboIndicatorConfig = {
  text: {
    fontFamily: "Kenney Bold",
    fontSize: "36px",
    color: "#ffdd00",
    strokeColor: "#000000",
    strokeThickness: 4,
  },

  animation: {
    bounceScale: 1.3,
    bounceDuration: 150,
    wobbleAmplitude: 5,
    wobbleFrequency: 3,
    riseDistance: 60,
    fadeDuration: 400,
    totalDuration: 1200,
  },

  stars: {
    atlasKey: VFX_ATLAS_KEY,
    count: 6,
    textures: ["star_01", "star_02", "star_03"],
    scale: 0.5,
    burstRadius: 40,
    duration: 300,
    colors: [0xffdd00, 0xffffff, 0xff8800],
  },

  screenFlash: {
    threshold: 4,
    color: 0xffffff,
    alpha: 0.3,
    duration: 100,
  },
};

export interface ScorePopupRandomizationConfig {
  offsetX: number;
  offsetY: number;
  rotationDegrees: number;
}

export const SCORE_POPUP_RANDOMIZATION: ScorePopupRandomizationConfig = {
  offsetX: 40,
  offsetY: 40,
  rotationDegrees: 20,
};

export interface SpeedBoostTrailConfig {
  traceParticles: number;
  traceSpreadAngle: number;
  traceSpeedMin: number;
  traceSpeedMax: number;
  traceScale: number;
  traceTint: number;
  traceDuration: number;
  glowCount: number;
  glowBaseScale: number;
  glowScaleStep: number;
  glowTint: number;
  glowAlpha: number;
  glowScaleIncrease: number;
  glowDuration: number;
}

export const SPEED_BOOST_TRAIL: SpeedBoostTrailConfig = {
  traceParticles: 12,
  traceSpreadAngle: 0.4,
  traceSpeedMin: 50,
  traceSpeedMax: 120,
  traceScale: 0.7,
  traceTint: 0xffcc44,
  traceDuration: 400,
  glowCount: 4,
  glowBaseScale: 1.0,
  glowScaleStep: 0.2,
  glowTint: 0xffdd66,
  glowAlpha: 0.6,
  glowScaleIncrease: 0.8,
  glowDuration: 300,
};

export interface CameraEffectsConfig {
  maxShakeIntensity: number;
  flashOverlayDepth: number;
  pulseOverlayDepth: number;
  shake: {
    defaultDuration: number;
    frequency: number;
    lerpSmoothing: number;
    defaultMultiplier: number;
    explosiveFrequency: number;
  };
  impact: {
    normalThreshold: number;
    explosiveThreshold: number;
    speedNormalization: number;
    baseDurationMin: number;
    baseDurationMax: number;
    baseIntensity: number;
  };
  flash: {
    defaultColor: number;
    defaultIntensity: number;
    duration: number;
    explosiveThreshold: number;
    normalThreshold: number;
    explosiveIntensity: number;
    normalIntensity: number;
  };
  pulse: {
    defaultColor: number;
    defaultIntensity: number;
    defaultDuration: number;
    scaleFrom: number;
    scaleTo: number;
  };
  slowMotion: {
    defaultDuration: number;
    defaultScale: number;
    hitPauseDivisor: number;
  };
  hitPause: {
    defaultDuration: number;
  };
  rumble: {
    defaultIntensity: number;
    defaultDuration: number;
  };
}

export const CAMERA_EFFECTS_CONFIG: CameraEffectsConfig = {
  maxShakeIntensity: 0.06,
  flashOverlayDepth: 999,
  pulseOverlayDepth: 998,
  shake: {
    defaultDuration: 150,
    frequency: 35,
    lerpSmoothing: 0.3,
    defaultMultiplier: 0.15,
    explosiveFrequency: 40,
  },
  impact: {
    normalThreshold: 8,
    explosiveThreshold: 2,
    speedNormalization: 30,
    baseDurationMin: 80,
    baseDurationMax: 120,
    baseIntensity: 0.015,
  },
  flash: {
    defaultColor: 0xffffff,
    defaultIntensity: 0.5,
    duration: 300,
    explosiveThreshold: 20,
    normalThreshold: 5,
    explosiveIntensity: 0.4,
    normalIntensity: 0.15,
  },
  pulse: {
    defaultColor: 0xffffff,
    defaultIntensity: 0.3,
    defaultDuration: 300,
    scaleFrom: 0.1,
    scaleTo: 3,
  },
  slowMotion: {
    defaultDuration: 150,
    defaultScale: 0.3,
    hitPauseDivisor: 10,
  },
  hitPause: {
    defaultDuration: 30,
  },
  rumble: {
    defaultIntensity: 0.01,
    defaultDuration: 200,
  },
};

export interface ExplosionVFXConfig {
  sparkDepth: number;
  smokeDepth: number;
  debrisDepth: number;
  sparkDelay: number;
  debrisDelay: number;
  debris: {
    lowEndMaxCount: number;
    normalMaxCount: number;
    scaleMin: number;
    scaleMax: number;
    tint: number;
    durationMin: number;
    durationMax: number;
    rotationMin: number;
    rotationMax: number;
  };
  tierConfigs: {
    low: Record<string, { sparkCount: number; smokeCount: number; debrisCount: number }>;
    normal: Record<string, { sparkCount: number; smokeCount: number; debrisCount: number }>;
  };
}

export const EXPLOSION_VFX_CONFIG: ExplosionVFXConfig = {
  sparkDepth: 52,
  smokeDepth: 65,
  debrisDepth: 60,
  sparkDelay: 50,
  debrisDelay: 100,
  debris: {
    lowEndMaxCount: 5,
    normalMaxCount: 9,
    scaleMin: 0.3,
    scaleMax: 0.6,
    tint: 0x886644,
    durationMin: 600,
    durationMax: 1000,
    rotationMin: 2,
    rotationMax: 6,
  },
  tierConfigs: {
    low: {
      blackBird: { sparkCount: 12, smokeCount: 7, debrisCount: 4 },
      tntLarge: { sparkCount: 12, smokeCount: 7, debrisCount: 4 },
      tntMedium: { sparkCount: 12, smokeCount: 7, debrisCount: 4 },
      tntSmall: { sparkCount: 12, smokeCount: 7, debrisCount: 4 },
    },
    normal: {
      blackBird: { sparkCount: 15, smokeCount: 9, debrisCount: 5 },
      tntLarge: { sparkCount: 15, smokeCount: 9, debrisCount: 5 },
      tntMedium: { sparkCount: 15, smokeCount: 9, debrisCount: 5 },
      tntSmall: { sparkCount: 15, smokeCount: 9, debrisCount: 5 },
    },
  },
};

export interface ParticleEmitterConfig {
  prewarmTextures: string[];
  lowEndPoolSize: number;
  normalPoolSize: number;
  cleanupIntervalMs: number;
  maxIdleTimeMs: number;
  spark: {
    texture: string;
    lifespan: number;
    speedMin: number;
    speedMax: number;
    scaleStart: number;
    scaleEnd: number;
    alphaStart: number;
    alphaEnd: number;
    tints: number[];
    blendMode: string;
  };
  smoke: {
    texture: string;
    lifespan: number;
    speedMin: number;
    speedMax: number;
    scaleStart: number;
    scaleEnd: number;
    alphaStart: number;
    alphaEnd: number;
    tints: number[];
    blendMode: string;
  };
  settlingDust: {
    offsetY: number;
    lifespan: number;
    speedMin: number;
    speedMax: number;
    scaleStart: number;
    scaleEnd: number;
    alphaStart: number;
    alphaEnd: number;
    gravityY: number;
    angleMin: number;
    angleMax: number;
    countMultiplier: number;
    depth: number;
    releaseDelay: number;
  };
}

export const PARTICLE_EMITTER_CONFIG: ParticleEmitterConfig = {
  prewarmTextures: ["fire_01", "fire_02", "smoke_01"],
  lowEndPoolSize: 25,
  normalPoolSize: 50,
  cleanupIntervalMs: 5000,
  maxIdleTimeMs: 10000,
  spark: {
    texture: "fire_02",
    lifespan: 900,
    speedMin: 250,
    speedMax: 600,
    scaleStart: 0.9,
    scaleEnd: 0,
    alphaStart: 1,
    alphaEnd: 0,
    tints: [0xdd7733, 0xee9955, 0xcc6633, 0xddaa66],
    blendMode: "ADD",
  },
  smoke: {
    texture: "smoke_01",
    lifespan: 1400,
    speedMin: 50,
    speedMax: 100,
    scaleStart: 1.2,
    scaleEnd: 2.8,
    alphaStart: 0.45,
    alphaEnd: 0,
    tints: [0x887766],
    blendMode: "NORMAL",
  },
  settlingDust: {
    offsetY: 20,
    lifespan: 800,
    speedMin: 10,
    speedMax: 25,
    scaleStart: 0.3,
    scaleEnd: 0.6,
    alphaStart: 0.4,
    alphaEnd: 0,
    gravityY: -20,
    angleMin: 260,
    angleMax: 280,
    countMultiplier: 1,
    depth: 14,
    releaseDelay: 1000,
  },
};

export interface ShockwaveConfig {
  poolInitialSize: number;
  poolMaxSize: number;
  impactSpeedNormalization: number;
  radiusBase: number;
  radiusRange: number;
  initialRadius: number;
  initialAlpha: number;
  depth: number;
  duration: number;
}

export const SHOCKWAVE_CONFIG: ShockwaveConfig = {
  poolInitialSize: 10,
  poolMaxSize: 30,
  impactSpeedNormalization: 20,
  radiusBase: 60,
  radiusRange: 100,
  initialRadius: 10,
  initialAlpha: 0.5,
  depth: 60,
  duration: 250,
};

export interface ImpactVFXConfig {
  impactSpeedNormalization: number;
  particleCountBase: number;
  particleCountMultiplier: number;
  spreadConeMultiplier: number;
}

export const IMPACT_VFX_CONFIG: ImpactVFXConfig = {
  impactSpeedNormalization: 20,
  particleCountBase: 1,
  particleCountMultiplier: 1,
  spreadConeMultiplier: 0.6,
};

export interface PigDeathVFXConfig {
  completionDelayMs: number;
  initialPuffScale: number;
  depth: number;
  staggerDelayMs: number;
}

export const PIG_DEATH_VFX_CONFIG: PigDeathVFXConfig = {
  completionDelayMs: 350,
  initialPuffScale: 0.1,
  depth: 31,
  staggerDelayMs: 16,
};

export interface AbilityVFXConfig {
  boostTrailOffsetDistance: number;
  ringRadiusMin: number;
  ringRadiusMax: number;
  trailFadeDuration: number;
  staggerDelayMs: number;
}

export const ABILITY_VFX_CONFIG: AbilityVFXConfig = {
  boostTrailOffsetDistance: 50,
  ringRadiusMin: 3,
  ringRadiusMax: 8,
  trailFadeDuration: 300,
  staggerDelayMs: 20,
};

export interface AbilityVFXDepthConfig {
  burstDefault: number;
  light: number;
  glow: number;
  ring: number;
}

export const ABILITY_VFX_DEPTHS: AbilityVFXDepthConfig = {
  burstDefault: 100,
  light: 100,
  glow: 100,
  ring: 200,
};

export interface AbilityVFXPoolConfig {
  sparkPoolInitialSize: number;
  lightPoolInitialSize: number;
  ringPoolInitialSize: number;
  ringPoolMaxSize: number;
}

export const ABILITY_VFX_POOLS: AbilityVFXPoolConfig = {
  sparkPoolInitialSize: 8,
  lightPoolInitialSize: 8,
  ringPoolInitialSize: 15,
  ringPoolMaxSize: 50,
};

export interface SplitEffectConfig {
  particleCount: number;
  minSpeed: number;
  maxSpeed: number;
  duration: number;
  startScale: number;
  endScale: number;
  tint: number;
  lightCount: number;
  lightOffsetRange: number;
  lightInitialScale: number;
  lightEndScale: number;
  lightDuration: number;
}

export const SPLIT_EFFECT_CONFIG: SplitEffectConfig = {
  particleCount: 8,
  minSpeed: 80,
  maxSpeed: 120,
  duration: 200,
  startScale: 0.5,
  endScale: 0,
  tint: 0x88ccff,
  lightCount: 4,
  lightOffsetRange: 20,
  lightInitialScale: 0.8,
  lightEndScale: 1.5,
  lightDuration: 150,
};

export interface EggDropEffectConfig {
  particleCount: number;
  minSpeed: number;
  maxSpeed: number;
  duration: number;
  startScale: number;
  endScale: number;
  tint: number;
  glowInitialScale: number;
  glowInitialAlpha: number;
  glowEndScale: number;
  glowDuration: number;
}

export const EGG_DROP_EFFECT_CONFIG: EggDropEffectConfig = {
  particleCount: 8,
  minSpeed: 50,
  maxSpeed: 100,
  duration: 280,
  startScale: 0.7,
  endScale: 0,
  tint: 0xffffcc,
  glowInitialScale: 1.2,
  glowInitialAlpha: 0.8,
  glowEndScale: 2.0,
  glowDuration: 200,
};

export interface ExplosionActivationEffectConfig {
  ringInitialRadius: number;
  ringColor: number;
  ringInitialAlpha: number;
  ringEndScale: number;
  ringDuration: number;
  particleCount: number;
  textureCount: number;
  minSpeed: number;
  maxSpeed: number;
  duration: number;
}

export const EXPLOSION_ACTIVATION_EFFECT_CONFIG: ExplosionActivationEffectConfig = {
  ringInitialRadius: 20,
  ringColor: 0xff6600,
  ringInitialAlpha: 0.5,
  ringEndScale: 8,
  ringDuration: 300,
  particleCount: 16,
  textureCount: 3,
  minSpeed: 200,
  maxSpeed: 400,
  duration: 500,
};

export interface BackgroundParticlesConfig {
  burstCountRadiusMultiplier: number;
  burstDistanceMultiplier: number;
  burstSizeMin: number;
  burstSizeMax: number;
  burstAlpha: number;
  burstDurationBase: number;
  burstDurationRange: number;
}

export const BACKGROUND_PARTICLES_CONFIG: BackgroundParticlesConfig = {
  burstCountRadiusMultiplier: 0.5,
  burstDistanceMultiplier: 0.8,
  burstSizeMin: 4,
  burstSizeMax: 8,
  burstAlpha: 0.8,
  burstDurationBase: 600,
  burstDurationRange: 400,
};

export interface ParticleServiceConfig {
  sparkDeactivationDelayMs: number;
  smokeDeactivationDelayMs: number;
  rotationMin: number;
  rotationMax: number;
  defaultDepth: number;
  releaseDelayBufferMs: number;
}

export const PARTICLE_SERVICE_CONFIG: ParticleServiceConfig = {
  sparkDeactivationDelayMs: 740,
  smokeDeactivationDelayMs: 1000,
  rotationMin: -180,
  rotationMax: 180,
  defaultDepth: 15,
  releaseDelayBufferMs: 300,
};

export interface VFXManagerUpdateConfig {
  collisionCheckIntervalHigh: number;
  collisionCheckIntervalMedium: number;
  collisionCheckIntervalLow: number;
  cleanupIntervalMultiplier: number;
  destructionImpactSpeedNormalization: number;
}

export const VFX_MANAGER_UPDATE_CONFIG: VFXManagerUpdateConfig = {
  collisionCheckIntervalHigh: 8,
  collisionCheckIntervalMedium: 16,
  collisionCheckIntervalLow: 32,
  cleanupIntervalMultiplier: 10,
  destructionImpactSpeedNormalization: 20,
};

export interface ScorePopupManagerConfig {
  cameraPadding: number;
  damageNumberPadding: number;
  riseDistance: number;
  scaleMultiplier: number;
  bounceScale: number;
  bounceDuration: number;
  damageRiseDistance: number;
  damageDuration: number;
}

export const SCORE_POPUP_MANAGER_CONFIG: ScorePopupManagerConfig = {
  cameraPadding: 80,
  damageNumberPadding: 40,
  riseDistance: 60,
  scaleMultiplier: 1.2,
  bounceScale: 1.3,
  bounceDuration: 100,
  damageRiseDistance: 25,
  damageDuration: 500,
};

export interface ScorePopupSizeConfig {
  fontSize: string;
  color: string;
  offsetY: number;
  duration: number;
}

export interface ScorePopupThresholdsConfig {
  critical: number;
  large: number;
  medium: number;
}

export interface ScorePopupPoolConfig {
  textPool: { initialSize: number; maxSize: number };
  comboTextPool: { initialSize: number; maxSize: number };
  starPool: { initialSize: number; maxSize: number };
  flashPool: { initialSize: number; maxSize: number };
}

export interface ScorePopupProcessingConfig {
  popupsPerFrame: number;
  immediatePopups: number;
  maxQueueProcessingPerFrame: number;
}

export interface ScorePopupDepthConfig {
  scoreText: number;
  comboText: number;
  stars: number;
  flash: number;
  damageText: number;
}

export interface ScorePopupStyleConfig {
  defaultFont: string;
  strokeColor: string;
  defaultStrokeThickness: number;
  highlightStrokeThickness: number;
  highlightColors: string[];
}

export interface DamageNumberConfig {
  fontSize: string;
  color: string;
  strokeThickness: number;
}

export interface ScorePopupCategoryConfigs {
  small: ScorePopupSizeConfig;
  medium: ScorePopupSizeConfig;
  large: ScorePopupSizeConfig;
  critical: ScorePopupSizeConfig;
}

export const SCORE_POPUP_THRESHOLDS: ScorePopupThresholdsConfig = {
  critical: 500,
  large: 200,
  medium: 50,
};

export const SCORE_POPUP_POOLS: ScorePopupPoolConfig = {
  textPool: { initialSize: 10, maxSize: 50 },
  comboTextPool: { initialSize: 5, maxSize: 20 },
  starPool: { initialSize: 5, maxSize: 30 },
  flashPool: { initialSize: 2, maxSize: 10 },
};

export const SCORE_POPUP_PROCESSING: ScorePopupProcessingConfig = {
  popupsPerFrame: 4,
  immediatePopups: 1,
  maxQueueProcessingPerFrame: 3,
};

export const SCORE_POPUP_DEPTHS: ScorePopupDepthConfig = {
  scoreText: 100,
  comboText: 101,
  stars: 100,
  flash: 200,
  damageText: 50,
};

export const SCORE_POPUP_STYLE: ScorePopupStyleConfig = {
  defaultFont: "Kenney Bold, Arial",
  strokeColor: "#000000",
  defaultStrokeThickness: 3,
  highlightStrokeThickness: 4,
  highlightColors: ["#ffdd00", "#ff6600", "#ff0044"],
};

export const DAMAGE_NUMBER_CONFIG: DamageNumberConfig = {
  fontSize: "18px",
  color: "#ff4444",
  strokeThickness: 2,
};

export const SCORE_POPUP_CATEGORY_CONFIGS: ScorePopupCategoryConfigs = {
  small: {
    fontSize: "20px",
    color: "#ffffff",
    offsetY: -30,
    duration: 1000,
  },
  medium: {
    fontSize: "32px",
    color: "#ffcc44",
    offsetY: -40,
    duration: 1200,
  },
  large: {
    fontSize: "48px",
    color: "#ff8844",
    offsetY: -50,
    duration: 1500,
  },
  critical: {
    fontSize: "64px",
    color: "#ff4444",
    offsetY: -60,
    duration: 1800,
  },
};

export interface CelebrationVFXConfig {
  speedMin: number;
  speedMax: number;
  scaleStart: number;
  lifespan: number;
  quantity: number;
  frequency: number;
  confettiTints: number[];
  stopDelay: number;
}

export const CELEBRATION_VFX_CONFIG: CelebrationVFXConfig = {
  speedMin: 100,
  speedMax: 200,
  scaleStart: 0.2,
  lifespan: 3000,
  quantity: 8,
  frequency: 150,
  confettiTints: [0xffd700, 0xff6b6b, 0x4ecdc4],
  stopDelay: 3000,
} as const;

export interface StarRevealVFXConfig {
  baseSize: number;
  unearnedAlpha: number;
  earnedGoldTint: number;
  unearnedTint: number;
  sparkleSpeedMin: number;
  sparkleSpeedMax: number;
  sparkleLifespan: number;
  sparkleQuantity: number;
  explodeCount: number;
  cleanupDelay: number;
}

export const STAR_REVEAL_VFX_CONFIG: StarRevealVFXConfig = {
  baseSize: 70,
  unearnedAlpha: 0.5,
  earnedGoldTint: 0xffd700,
  unearnedTint: 0x555555,
  sparkleSpeedMin: 50,
  sparkleSpeedMax: 100,
  sparkleLifespan: 500,
  sparkleQuantity: 10,
  explodeCount: 10,
  cleanupDelay: 600,
} as const;

export interface ExplosionShaderVFXConfig {
  defaultDuration: number;
  defaultQuadSize: number;
  defaultRadius: number;
  defaultColor: [number, number, number];
  lowEndQuadSize: number;
  normalQuadSize: number;
  maxTextureSizeThreshold: number;
  shaderOrigin: number;
  quadSizeRadiusMultiplier: number;
  quadSizeMin: number;
  quadSizeMax: number;
}

export const EXPLOSION_SHADER_VFX_CONFIG: ExplosionShaderVFXConfig = {
  defaultDuration: 500,
  defaultQuadSize: 400,
  defaultRadius: 0.4,
  defaultColor: [1.0, 0.4, 0.0],
  lowEndQuadSize: 200,
  normalQuadSize: 400,
  maxTextureSizeThreshold: 2048,
  shaderOrigin: 0.5,
  quadSizeRadiusMultiplier: 2.2,
  quadSizeMin: 200,
  quadSizeMax: 400,
} as const;

export interface PigDeathVFXPoolConfig {
  puffPoolInitial: number;
  puffPoolMax: number;
  splatPoolInitial: number;
  splatPoolMax: number;
  minOffsetDistance: number;
}

export const PIG_DEATH_VFX_POOL_CONFIG: PigDeathVFXPoolConfig = {
  puffPoolInitial: 4,
  puffPoolMax: 16,
  splatPoolInitial: 2,
  splatPoolMax: 12,
  minOffsetDistance: 5,
} as const;

export interface BackgroundParticlesVFXConfig {
  burstPoolInitial: number;
  burstPoolMax: number;
  createDelayMs: number;
  spawnWidthMultiplier: number;
  spawnWidthDivisor: number;
  spawnHeightDivisor: number;
  particleDepth: number;
}

export const BACKGROUND_PARTICLES_VFX_CONFIG: BackgroundParticlesVFXConfig = {
  burstPoolInitial: 10,
  burstPoolMax: 30,
  createDelayMs: 100,
  spawnWidthMultiplier: 800,
  spawnWidthDivisor: 3,
  spawnHeightDivisor: 2,
  particleDepth: -8,
} as const;

export interface TouchFeedbackVFXConfig {
  rippleFillAlpha: number;
  initialScale: number;
  initialAlpha: number;
}

export const TOUCH_FEEDBACK_VFX_CONFIG: TouchFeedbackVFXConfig = {
  rippleFillAlpha: 0.4,
  initialScale: 0.5,
  initialAlpha: 0.6,
} as const;

export interface AbilityVFXDefaultConfig {
  burstSpeedMin: number;
  burstSpeedMax: number;
  burstDuration: number;
  boostTrailRingColor: number;
  boostTrailRingAlpha: number;
}

export const ABILITY_VFX_DEFAULT_CONFIG: AbilityVFXDefaultConfig = {
  burstSpeedMin: 150,
  burstSpeedMax: 300,
  burstDuration: 400,
  boostTrailRingColor: 0xffff00,
  boostTrailRingAlpha: 0.8,
} as const;

export interface CameraLaunchEffectsConfig {
  rumbleIntensitySpeedFactor: number;
  rumbleIntensityBase: number;
  rumbleDurationBase: number;
  launchSpeedThresholdLow: number;
  launchSpeedThresholdHigh: number;
  hitPauseMs: number;
  destructionLingerMin: number;
  destructionLingerMax: number;
  destructionLingerThreshold: number;
}

export const CAMERA_LAUNCH_EFFECTS_CONFIG: CameraLaunchEffectsConfig = {
  rumbleIntensitySpeedFactor: 0.0055,
  rumbleIntensityBase: 0.00028,
  rumbleDurationBase: 110,
  launchSpeedThresholdLow: 6,
  launchSpeedThresholdHigh: 8,
  hitPauseMs: 18,
  destructionLingerMin: 1200,
  destructionLingerMax: 2500,
  destructionLingerThreshold: 300,
} as const;

export interface TouchFeedbackConfig {
  colors: {
    tap: number;
    aim: number;
    fire: number;
    drag: number;
  };
  fillAlpha: number;
  initialScale: number;
  initialAlpha: number;
}

export const TOUCH_FEEDBACK_CONFIG: TouchFeedbackConfig = {
  colors: {
    tap: 0xffffff,
    aim: 0xffd700,
    fire: 0xff6b35,
    drag: 0x4a90e2,
  },
  fillAlpha: 0.4,
  initialScale: 0.5,
  initialAlpha: 0.6,
};

export interface BackgroundParticlesSetupConfig {
  burstPoolInitialSize: number;
  burstPoolMaxSize: number;
  textureDelayMs: number;
  spawnWidthPadding: number;
  viewportHeightMultiplier: number;
}

export const BACKGROUND_PARTICLES_SETUP_CONFIG: BackgroundParticlesSetupConfig = {
  burstPoolInitialSize: 10,
  burstPoolMaxSize: 30,
  textureDelayMs: 100,
  spawnWidthPadding: 800,
  viewportHeightMultiplier: 2,
};

export interface ButtonEntryPhaseConfig {
  duration: number;
  overshootY?: number;
  peakScale?: number;
  easeOvershoot?: number;
  undershootY?: number;
  undershootScale?: number;
  settleY?: number;
  settleScale?: number;
  elasticAmplitude?: number;
  elasticPeriod?: number;
}

export interface ButtonGlowPulseConfig {
  scaleX: number;
  scaleY: number;
  duration: number;
  delay: number;
  repeatCount: number;
}

export interface ButtonEntryAnimationConfig {
  staggerDelayMs: number;
  startOffsetY: number;
  rotations: readonly [number, number, number];
  startScale: number;
  phase1: ButtonEntryPhaseConfig;
  phase2: ButtonEntryPhaseConfig;
  phase3: ButtonEntryPhaseConfig;
  phase4: ButtonEntryPhaseConfig;
  glowPulse: ButtonGlowPulseConfig;
}

export const BUTTON_ENTRY_ANIMATION_CONFIG: ButtonEntryAnimationConfig = {
  staggerDelayMs: 100,
  startOffsetY: 100,
  rotations: [0.08, -0.06, 0.05] as const,
  startScale: 0.3,
  phase1: {
    duration: 280,
    overshootY: 20,
    peakScale: 1.15,
    easeOvershoot: 1.5,
  },
  phase2: {
    duration: 100,
    undershootY: 8,
    undershootScale: 0.92,
  },
  phase3: {
    duration: 120,
    settleY: 3,
    settleScale: 1.04,
  },
  phase4: {
    duration: 180,
    elasticAmplitude: 1,
    elasticPeriod: 0.6,
  },
  glowPulse: {
    scaleX: 1.03,
    scaleY: 0.97,
    duration: 800,
    delay: 200,
    repeatCount: 2,
  },
} as const;
