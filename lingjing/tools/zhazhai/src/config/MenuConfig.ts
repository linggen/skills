export const MenuTitleConfig = {
  text: "ANGRY ALIENS",
  fontFamily: "Kenney Bold",
  depth: 100,
  particleDepth: 101,
  sparkleDepth: 102,
  titleYPercent: 0.18,
  startY: -180,
  rotation: {
    start: -0.1,
    bounce: 0.06,
    settle: [-0.025, 0.015, 0],
  },
  scale: {
    start: 0.4,
    overshoot: 1.08,
  },
  outerGlow: {
    fontSize: 78,
    color: "#FFD700",
  },
  innerGlow: {
    fontSize: 74,
    color: "#FFFFFF",
  },
  shadow: {
    offsetX: 5,
    offsetY: 6,
    fontSize: 72,
    color: "#3d2817",
    alpha: 0.85,
  },
  mainText: {
    fontSize: 72,
    color: "#F5EFD6",
    stroke: "#6B5A35",
    strokeThickness: 10,
  },
  entrance: {
    duration: 380,
    overshootY: 50,
    ease: "Quad.out",
  },
} as const;

export const MenuBounceConfig = {
  phases: [
    { y: -20, rot: -0.03, squashX: 0.82, squashY: 1.25, dur: 140 },
    { y: 15, rot: 0.02, squashX: 1.18, squashY: 0.82, dur: 120 },
    { y: -6, rot: -0.012, squashX: 0.94, squashY: 1.08, dur: 100 },
    { y: 0, rot: 0, squashX: 1, squashY: 1, dur: 80 },
  ],
  innerGlow: {
    alpha: 0.6,
    scale: 1.1,
    duration: 120,
  },
  outerGlow: {
    alpha: 0.4,
    scale: 1.15,
    duration: 150,
  },
  settle: {
    duration: 280,
    ease: "Elastic.out(1, 0.45)",
  },
} as const;

export const MenuIdleConfig = {
  container: {
    yOffset: 4,
    scaleX: 1.012,
    scaleY: 0.988,
    duration: 2200,
    ease: "Sine.inOut",
  },
  innerGlow: {
    alpha: 0.28,
    scale: 1.05,
    duration: 1600,
    ease: "Sine.inOut",
  },
  outerGlow: {
    alpha: 0.18,
    scale: 1.08,
    duration: 2000,
    delay: 400,
    ease: "Sine.inOut",
  },
} as const;

export const MenuStarsConfig = {
  colors: [0xffd700, 0xf5efd6, 0xffffff, 0xffe4b5, 0xffaa00],
  count: 18,
  titleWidth: 380,
  spreadRange: 40,
  distanceMin: 60,
  distanceMax: 100,
  circleThreshold: 0.6,
  targetScaleMin: 0.7,
  targetScaleMax: 0.5,
  starTargetScaleMin: 0.9,
  starTargetScaleMax: 0.6,
  durationMin: 700,
  durationMax: 300,
  delayPerStar: 12,
  sparkleCount: 10,
  sparkleDistanceMin: 30,
  sparkleDistanceMax: 50,
  sparkleDuration: 400,
  sparkleDelayBase: 50,
  sparkleDelayPerStar: 20,
  sparkleScaleFrom: 0.3,
  sparkleScaleTo: 1.4,
  sparkleAlphaFrom: 0.9,
} as const;

export const MenuStarParticleConfig = {
  size: 20,
  textureSize: 40,
  circleRadius: 12,
  circleTextureSize: 24,
} as const;

export const MenuTimingConfig = {
  buttonsReadyDelay: 800,
  onCompleteDelay: 1200,
} as const;

export const MenuButtonsConfig = {
  delays: [0, 80, 160],
  defaultDelay: 80,
  duration: 400,
  ease: "Back.out(2)",
} as const;
