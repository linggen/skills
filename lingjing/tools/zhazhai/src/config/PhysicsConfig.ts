import { BirdType } from "../types/BirdType";
import { BlockMaterial } from "../constants/Materials";
import { PigSize } from "../constants/PigSize";

export const MIN_IMPACT_THRESHOLD_SQ = 5;

export const WORLD_CONFIG = {
  gravity: { x: 0, y: 0.9 },
  enableSleeping: true,
  sleepThreshold: 300,
  positionIterations: 6,
  velocityIterations: 6,
  constraintIterations: 3,
} as const;

export const SLINGSHOT_CONFIG = {
  maxPull: 180,
  minPull: 20,
  velocityMultiplier: 0.3,
  postWidth: 85,
  postHeight: 202,
} as const;

export interface BirdPhysicsConfig {
  density: number;
  restitution: number;
  friction: number;
  frictionAir: number;
  radius: number;
  width?: number;
  height?: number;
  hasAbility: boolean;
  abilityMultiplier?: number;
  explosionRadius?: number;
  splitCount?: number;
  splitAngle?: number;
  splitVelocityRatio?: number;
  activateOnCollision?: boolean;
}

export const BIRD_PHYSICS: Record<BirdType, BirdPhysicsConfig> = {
  [BirdType.RED]: {
    density: 0.003,
    restitution: 0.4,
    friction: 0.4,
    frictionAir: 0.0005,
    radius: 35,
    hasAbility: false,
  },
  [BirdType.YELLOW]: {
    density: 0.0017,
    restitution: 0.45,
    friction: 0.3,
    frictionAir: 0.0003,
    radius: 35,
    hasAbility: true,
    abilityMultiplier: 2.8,
  },
  [BirdType.BLACK]: {
    density: 0.0035,
    restitution: 0.35,
    friction: 0.5,
    frictionAir: 0.001,
    radius: 40,
    hasAbility: true,
    activateOnCollision: true,
    explosionRadius: 250,
  },
  [BirdType.WHITE]: {
    density: 0.0025,
    restitution: 0.4,
    friction: 0.4,
    frictionAir: 0.0005,
    radius: 35,
    width: 70,
    height: 70,
    hasAbility: true,
  },
  [BirdType.BLUE]: {
    density: 0.002,
    restitution: 0.5,
    friction: 0.3,
    frictionAir: 0.0003,
    radius: 30,
    hasAbility: true,
    splitCount: 3,
    splitAngle: 30,
    splitVelocityRatio: 0.95,
  },
} as const;

export type ExplosionTier = "blackBird" | "tntLarge" | "tntMedium" | "tntSmall";

export interface ExplosionTierConfig {
  radius: number;
  pushSpeed: number;
  damage: number;
  screenShake: number;
  slowMoDuration: number;
  slowMoScale: number;
}

export const EXPLOSION_TIERS: Record<ExplosionTier, ExplosionTierConfig> = {
  blackBird: {
    radius: 280,
    pushSpeed: 200,
    damage: 600000000,
    screenShake: 0.8,
    slowMoDuration: 0,
    slowMoScale: 0,
  },
  tntLarge: {
    radius: 350,
    pushSpeed: 150,
    damage: 600000000,
    screenShake: 0.8,
    slowMoDuration: 0,
    slowMoScale: 0,
  },
  tntMedium: {
    radius: 280,
    pushSpeed: 150,
    damage: 600000000,
    screenShake: 0.6,
    slowMoDuration: 0,
    slowMoScale: 0,
  },
  tntSmall: {
    radius: 140,
    pushSpeed: 150,
    damage: 600000000,
    screenShake: 0.4,
    slowMoDuration: 0,
    slowMoScale: 0,
  },
} as const;

export const CHAIN_REACTION_MULTIPLIER = 0.8;

export interface MaterialPhysicsConfig {
  density: number;
  restitution: number;
  friction: number;
  health: number;
}

export const MATERIAL_PHYSICS: Record<BlockMaterial, MaterialPhysicsConfig> = {
  [BlockMaterial.GLASS]: {
    density: 0.0012,
    restitution: 0.6,
    friction: 0.2,
    health: 10,
  },
  [BlockMaterial.WOOD]: {
    density: 0.0015,
    restitution: 0.5,
    friction: 0.5,
    health: 30,
  },
  [BlockMaterial.STONE]: {
    density: 0.0025,
    restitution: 0.35,
    friction: 0.7,
    health: 50,
  },
  [BlockMaterial.METAL]: {
    density: 0.004,
    restitution: 0.25,
    friction: 0.4,
    health: 75,
  },
  [BlockMaterial.EXPLOSIVE]: {
    density: 0.0012,
    restitution: 0.4,
    friction: 0.3,
    health: 5,
  },
} as const;

export const FRAGMENT_CONFIG = {
  densityMultiplier: 0.4,
  frictionAir: 0.005,
  lifetime: 10000,
  minimumArea: 1,
} as const;

export interface FragmentManagerConfig {
  maxActiveFragments: number;
  poolHidePosition: number;
  cleanupIntervalMs: number;
  maxPoolSize: number;
  fragmentsPerFrame: number;
  immediateFragments: number;
  maxQueueProcessingPerFrame: number;
  lowEndImmediateFragments: number;
  lowEndQueuePerFrame: number;
  minFragmentSpeed: number;
  collisionRadius: number;
  minImpactSpeedForSound: number;
  soundCooldownMs: number;
  wakeRadius: number;
  outOfBoundsMargin: number;
  depth: number;
  explosionMassFactor: number;
}

export const FRAGMENT_MANAGER_CONFIG: FragmentManagerConfig = {
  maxActiveFragments: 300,
  poolHidePosition: -8096,
  cleanupIntervalMs: 1000,
  maxPoolSize: 300,
  fragmentsPerFrame: 200,
  immediateFragments: 200,
  maxQueueProcessingPerFrame: 20,
  lowEndImmediateFragments: 50,
  lowEndQueuePerFrame: 10,
  minFragmentSpeed: 3,
  collisionRadius: 50,
  minImpactSpeedForSound: 3,
  soundCooldownMs: 300,
  wakeRadius: 100,
  outOfBoundsMargin: 200,
  depth: 15,
  explosionMassFactor: 0.02,
} as const;

export const FRAGMENT_BODY_CONFIG = {
  vertexLimits: {
    high: 6,
    low: 4,
  },
  qualityThreshold: 0.5,
  removeCollinear: 0.01,
  minimumArea: 1,
  minAreaCoverage: 0.95,
} as const;

// Material weight multipliers for falling damage
export const FRAGMENT_WEIGHT_MULTIPLIERS: Record<BlockMaterial, number> = {
  [BlockMaterial.GLASS]: 1,
  [BlockMaterial.WOOD]: 1.5,
  [BlockMaterial.STONE]: 3.25,
  [BlockMaterial.METAL]: 3,
  [BlockMaterial.EXPLOSIVE]: 1,
};

export function getMaterialPhysics(material: BlockMaterial): MaterialPhysicsConfig {
  return MATERIAL_PHYSICS[material];
}

export function getMaterialHealth(material: BlockMaterial): number {
  return MATERIAL_PHYSICS[material].health;
}

export interface PigPhysicsConfig {
  density: number;
  radius: number;
  health: number;
  visualSize: number;
}

export const PIG_PHYSICS: Record<PigSize, PigPhysicsConfig> = {
  [PigSize.SMALL]: {
    density: 0.0025,
    radius: 35,
    health: 10,
    visualSize: 70,
  },
  [PigSize.MEDIUM]: {
    density: 0.002,
    radius: 70,
    health: 30,
    visualSize: 140,
  },
  [PigSize.LARGE]: {
    density: 0.0018,
    radius: 105,
    health: 60,
    visualSize: 210,
  },
} as const;

export const COMBO_CONFIG = {
  windowMs: 5000,
  minCount: 2,
  bonusPerLevel: 500,
} as const;

export const BIRD_ATLAS_KEY = "level" as const;

export const BIRD_ASSET_MAP: Record<BirdType, string> = {
  [BirdType.RED]: "alienPink_round",
  [BirdType.YELLOW]: "alienYellow_round",
  [BirdType.BLACK]: "alienBeige_round",
  [BirdType.WHITE]: "alienPink_square",
  [BirdType.BLUE]: "alienBlue_round",
};

export const BOUNCE_CONFIG = {
  energyLossPerBounce: 0.25,
  maxMeaningfulBounces: 3,
} as const;

export type DestructionScale = "minimal" | "mild" | "moderate" | "dramatic";

export interface JuiceScaleConfig {
  threshold: number;
  shake: number;
  hitPause: number;
  slowMo: { duration: number; scale: number } | null;
}

export const DESTRUCTION_JUICE_CONFIG = {
  scales: {
    minimal: {
      threshold: 1,
      shake: 0,
      hitPause: 0,
      slowMo: null,
    },
    mild: {
      threshold: 3,
      shake: 0.3,
      hitPause: 0,
      slowMo: null,
    },
    moderate: {
      threshold: 5,
      shake: 0.5,
      hitPause: 166,
      slowMo: { duration: 3000, scale: 0.25 },
    },
    dramatic: {
      threshold: 8,
      shake: 0.8,
      hitPause: 330,
      slowMo: { duration: 5000, scale: 0.1 },
    },
  } as Record<DestructionScale, JuiceScaleConfig>,

  getScale(count: number): DestructionScale {
    if (count >= 8) return "dramatic";
    if (count >= 5) return "moderate";
    if (count >= 3) return "mild";
    return "minimal";
  },
} as const;

export const PHYSICS_SETTLE_CONFIG = {
  fragmentVelocityThreshold: 2.0,
  maxMovingFragmentsBeforeSettle: 5,
  checkIntervalMs: 33,
} as const;

export const WAKE_CASCADE_CONFIG = {
  debrisCategory: 0x0010,
  verticalRange: 1820,
  horizontalMargin: 1024,
  delayMs: 0,
  cascadePasses: 1,
  cascadeCoalesceDistance: 200,
} as const;

export const GROUND_CONFIG = {
  minZoom: 0.6,
  floorLeftPadding: 720,
  floorRightPadding: 960,
  friction: 0.8,
  worldBoundsPadding: 32,
} as const;

export const EXPLOSION_SYSTEM_CONFIG = {
  chainReaction: {
    closeDistanceRatio: 0.3,
    farDistanceRatio: 0.7,
    closeMultiplier: 0.95,
    midMultiplier: 0.85,
    farMultiplier: 0.8,
  },
  destructionEffectImpactSpeed: 50,
  shakeDurationMs: 200,
  flashImpactSpeed: 25,
  explosionBonusScore: 500,
  chainDelayMinMs: 50,
  chainDelayMaxMs: 200,
  pigDamageMultiplier: 1.5,
} as const;

export interface PhysicsQualityProfileConfig {
  high: {
    threshold: number;
    positionIterations: number;
    velocityIterations: number;
    constraintIterations: number;
  };
  medium: {
    threshold: number;
    positionIterations: number;
    velocityIterations: number;
    constraintIterations: number;
  };
  low: {
    positionIterations: number;
    velocityIterations: number;
    constraintIterations: number;
  };
}

export const PHYSICS_QUALITY_CONFIG: PhysicsQualityProfileConfig = {
  high: {
    threshold: 0.75,
    positionIterations: 6,
    velocityIterations: 6,
    constraintIterations: 4,
  },
  medium: {
    threshold: 0.5,
    positionIterations: 3,
    velocityIterations: 3,
    constraintIterations: 2,
  },
  low: {
    positionIterations: 1,
    velocityIterations: 1,
    constraintIterations: 1,
  },
};

export interface DeviceDetectionConfig {
  lowEndCpuCores: number;
  smallScreenDimension: number;
  lowEndMobileMultiplier: number;
  smallScreenMultiplier: number;
  highEndMobileMultiplier: number;
}

export const DEVICE_DETECTION_CONFIG: DeviceDetectionConfig = {
  lowEndCpuCores: 2,
  smallScreenDimension: 414,
  lowEndMobileMultiplier: 0.6,
  smallScreenMultiplier: 0.6,
  highEndMobileMultiplier: 1,
};

export interface BirdFlightConfig {
  penetrationDecayFactor: number;
  launchedSleepThreshold: number;
  flightRotationLerp: number;
}

export const BIRD_FLIGHT_CONFIG: BirdFlightConfig = {
  penetrationDecayFactor: 0.75,
  launchedSleepThreshold: 2000000,
  flightRotationLerp: 0.3,
} as const;

export interface BirdLaunchAnimationConfig {
  stretchFactor: number;
  duration: number;
}

export const BIRD_LAUNCH_ANIMATION_CONFIG: BirdLaunchAnimationConfig = {
  stretchFactor: 0.3,
  duration: 50,
} as const;

export interface BirdStateConfig {
  rotationSpeedThreshold: number;
  landingSpeedThreshold: number;
  landedCheckInterval: number;
}

export const BIRD_STATE_CONFIG: BirdStateConfig = {
  rotationSpeedThreshold: 1,
  landingSpeedThreshold: 0.5,
  landedCheckInterval: 100,
} as const;

export interface BlockWeakpointConfig {
  cornerAngleMin: number;
  cornerAngleMax: number;
  damageMultiplier: number;
}

export const BLOCK_WEAKPOINT_CONFIG: BlockWeakpointConfig = {
  cornerAngleMin: 0.4,
  cornerAngleMax: 1.17,
  damageMultiplier: 1.5,
} as const;

export interface BlockDamageConfig {
  birdImpactMultiplier: number;
  fallingBlockMultiplier: number;
  chainReactionDelay: number;
}

export const BLOCK_DAMAGE_CONFIG: BlockDamageConfig = {
  birdImpactMultiplier: 1.2,
  fallingBlockMultiplier: 1.5,
  chainReactionDelay: 100,
} as const;

export interface PigDamageConfig {
  impactSpeedDamageMultiplier: number;
  defaultMinImpactSpeed: number;
  defaultRestitution: number;
  defaultFriction: number;
  wakeRadius: number;
  defaultFrameSize: number;
}

export const PIG_DAMAGE_CONFIG: PigDamageConfig = {
  impactSpeedDamageMultiplier: 5,
  defaultMinImpactSpeed: 3,
  defaultRestitution: 0.3,
  defaultFriction: 0.5,
  wakeRadius: 210,
  defaultFrameSize: 70,
} as const;

export interface EggDropPhysicsConfig {
  bodyWidth: number;
  bodyHeight: number;
  density: number;
  restitution: number;
  friction: number;
  initialVelocityY: number;
  boostDelayMs: number;
  boostVelocity: number;
}

export const EGG_DROP_PHYSICS_CONFIG: EggDropPhysicsConfig = {
  bodyWidth: 70,
  bodyHeight: 70,
  density: 0.1,
  restitution: 0.5,
  friction: 0.5,
  initialVelocityY: 5,
  boostDelayMs: 500,
  boostVelocity: 60,
} as const;

export interface SplitPhysicsConfig {
  miniBirdScale: number;
  miniBirdRadius: number;
  density: number;
  restitution: number;
  friction: number;
  frictionAir: number;
}

export const SPLIT_PHYSICS_CONFIG: SplitPhysicsConfig = {
  miniBirdScale: 0.5,
  miniBirdRadius: 17.5,
  density: 0.006,
  restitution: 0.7,
  friction: 0.35,
  frictionAir: 0.0003,
} as const;

export interface BlockShapeOriginConfig {
  triangleOriginX: number;
  triangleOriginY: number;
}

export const BLOCK_SHAPE_ORIGIN_CONFIG: BlockShapeOriginConfig = {
  triangleOriginX: 0.35,
  triangleOriginY: 0.65,
} as const;

export interface BodyCacheConfig {
  normalExpiryFrames: number;
  destructionModeExpiryFrames: number;
}

export const BODY_CACHE_CONFIG: BodyCacheConfig = {
  normalExpiryFrames: 1,
  destructionModeExpiryFrames: 5,
} as const;

export interface VoronoiConfig {
  maxCacheSize: number;
  defaultRelaxationIterations: number;
  lloydBlendFactor: number;
  marginPercentage: number;
  angleBins: number;
}

export const VORONOI_CONFIG: VoronoiConfig = {
  maxCacheSize: 300,
  defaultRelaxationIterations: 3,
  lloydBlendFactor: 0.5,
  marginPercentage: 0.1,
  angleBins: 8,
} as const;

export interface FragmentVelocityConfig {
  spreadAngleMultiplier: number;
  randomSpread: number;
  horizontalMultiplier: number;
  verticalMultiplier: number;
  verticalBoost: number;
}

export const FRAGMENT_VELOCITY_CONFIG: FragmentVelocityConfig = {
  spreadAngleMultiplier: 0.3,
  randomSpread: 0.3,
  horizontalMultiplier: 0.7,
  verticalMultiplier: 0.8,
  verticalBoost: 1.0,
};

export interface VoronoiGeneratorConfig {
  templateCacheMaxSize: number;
  marginRatio: number;
  lloydRelaxationBlend: number;
}

export const VORONOI_GENERATOR_CONFIG: VoronoiGeneratorConfig = {
  templateCacheMaxSize: 300,
  marginRatio: 0.1,
  lloydRelaxationBlend: 0.5,
};

export interface FragmentDeviceDetectionConfig {
  lowEndHardwareConcurrency: number;
  defaultHardwareConcurrency: number;
  defaultDeviceMemory: number;
  lowEndConcurrencyThreshold: number;
  lowEndMemoryThreshold: number;
  defaultRestitution: number;
  defaultFriction: number;
}

export const FRAGMENT_DEVICE_DETECTION_CONFIG: FragmentDeviceDetectionConfig = {
  lowEndHardwareConcurrency: 4,
  defaultHardwareConcurrency: 4,
  defaultDeviceMemory: 2,
  lowEndConcurrencyThreshold: 4,
  lowEndMemoryThreshold: 2,
  defaultRestitution: 0.2,
  defaultFriction: 0.7,
} as const;

export interface TunnelingPreventionConfig {
  velocityThresholdSq: number;
  raycastPadding: number;
  maxRayLength: number;
  boostDetectionWindowMs: number;
}

export const TUNNELING_PREVENTION_CONFIG: TunnelingPreventionConfig = {
  velocityThresholdSq: 225,
  raycastPadding: 5,
  maxRayLength: 60,
  boostDetectionWindowMs: 500,
} as const;
