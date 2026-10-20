export interface PouchDefaultConfig {
  stiffness: number;
  damping: number;
  overshoot: number;
  whipStrength: number;
  snapAcceleration: number;
  snapDeceleration: number;
  overshootPercent: number;
  settleDamping: number;
}

export interface PouchSnapConfig {
  velocityBase: number;
  velocityIntensityFactor: number;
  forceBase: number;
  forceIntensityFactor: number;
  distanceThreshold: number;
}

export interface PouchAttractConfig {
  force: number;
  baseMultiplier: number;
  intensityFactor: number;
}

export interface PouchOvershootExitConfig {
  speedThreshold: number;
  minTime: number;
}

export interface PouchSettleConfig {
  distanceThreshold: number;
  speedThreshold: number;
}

export interface PouchDurationConfig {
  snapBase: number;
  snapIntensityFactor: number;
  settleBase: number;
  settleIntensityFactor: number;
  defaultSnap: number;
  defaultSettle: number;
}

export interface PouchPhysicsConfigType {
  default: PouchDefaultConfig;
  snap: PouchSnapConfig;
  attract: PouchAttractConfig;
  overshootExit: PouchOvershootExitConfig;
  settle: PouchSettleConfig;
  duration: PouchDurationConfig;
}

export const POUCH_PHYSICS_CONFIG: PouchPhysicsConfigType = {
  default: {
    stiffness: 0.1,
    damping: 0.75,
    overshoot: 1.1,
    whipStrength: 0.35,
    snapAcceleration: 0.12,
    snapDeceleration: 0.9,
    overshootPercent: 0.08,
    settleDamping: 0.8,
  },
  snap: {
    velocityBase: 0.12,
    velocityIntensityFactor: 0.08,
    forceBase: 0.8,
    forceIntensityFactor: 0.4,
    distanceThreshold: 25,
  },
  attract: {
    force: 0.06,
    baseMultiplier: 0.8,
    intensityFactor: 0.3,
  },
  overshootExit: {
    speedThreshold: 2.5,
    minTime: 4,
  },
  settle: {
    distanceThreshold: 2,
    speedThreshold: 0.5,
  },
  duration: {
    snapBase: 5,
    snapIntensityFactor: 3,
    settleBase: 10,
    settleIntensityFactor: 6,
    defaultSnap: 12,
    defaultSettle: 25,
  },
} as const;
