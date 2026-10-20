export const SlingshotBandConfig = {
  depth: {
    rightBand: 23,
    pouchShadow: 22,
    frontPouch: 41,
    leftBand: 45,
  },
  colors: {
    relaxed: { r: 93, g: 64, b: 55 },
    stretched: { r: 161, g: 136, b: 127 },
    maxPower: { r: 200, g: 80, b: 50 },
  },
  thickness: {
    base: 8,
    tensionBonus: 4,
  },
  strands: {
    count: 3,
    highlightOffset: 25,
    shadowOffset: 20,
    alphaMultiplier: 0.75,
  },
  highlight: {
    lineWidth: 2,
    color: 0xffe4c4,
    alphaFactor: 0.5,
    offsetX: -1,
    offsetY: -1,
  },
  powerTransition: {
    threshold: 0.9,
  },
} as const;

export const SlingshotPouchConfig = {
  ringRadiusMultiplier: 1.2,
  leather: {
    color: { r: 139, g: 90, b: 43 },
    alpha: 0.85,
    outerRadiusMultiplier: 1.8,
  },
  inner: {
    color: 0x3d2817,
    alpha: 0.9,
    radiusMultiplier: 1.2,
  },
  grommet: {
    radiusMultiplier: 0.7,
    positionMultiplier: 0.5,
    stroke: {
      lineWidth: 2.5,
      color: 0x2a2a2a,
      alpha: 1,
    },
    fill: {
      color: 0x1a1a1a,
      alpha: 1,
      innerRadiusMultiplier: 0.6,
    },
    highlight: {
      color: 0x555555,
      alpha: 0.6,
      offsetXMultiplier: 0.2,
      offsetYMultiplier: 0.2,
      radiusMultiplier: 0.25,
    },
  },
} as const;

export const SlingshotAnchorConfig = {
  radius: 8,
  fill: {
    color: 0x333333,
    alpha: 1,
  },
  highlight: {
    color: 0x555555,
    alpha: 0.8,
    offsetX: -2,
    offsetY: -2,
    radius: 3,
  },
} as const;

export const SlingshotPositionConfig = {
  bottomOffset: 140,
  forkTipOffset: 25,
  minDistance: 70,
  hangAngleMultiplier: 0.1,
} as const;

export const SlingshotBounceConfig = {
  duration: 500,
  impulse: 12,
} as const;

export const SlingshotParticleConfig = {
  lifespan: 250,
  speedMin: 20,
  speedMax: 50,
  scaleStart: 0.25,
  scaleEnd: 0.25,
  alphaStart: 0.1,
  alphaEnd: 0,
  tints: [0xffffff, 0xffffff, 0xffffff] as const,
  frame: "light_03",
};

export const SlingshotPhysicsConfig = {
  powerCurveExponent: 1.2,
  whip: {
    impulseMultiplier: 0.15,
    intensityBase: 0.3,
    intensityRange: 0.3,
  },
  wave: {
    intensityBase: 0.1,
    intensityRange: 0.25,
  },
  resetImpulse: {
    left: 2,
    right: -2,
  },
  particleEmission: {
    baseCount: 5,
    intensityMultiplier: 10,
  },
  birdShape: {
    radius: 35,
    mass: 6.0,
  },
  verletVariationSeeds: {
    left: 0.15,
    right: 0.85,
  },
} as const;
