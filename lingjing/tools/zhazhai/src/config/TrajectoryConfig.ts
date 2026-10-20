export interface TrajectorySimulationConfig {
  totalSteps: number;
  framesPerDot: number;
  defaultBird: {
    radius: number;
    mass: number;
    frictionAir: number;
  };
  frameMs: number;
}

export const TRAJECTORY_SIMULATION_CONFIG: TrajectorySimulationConfig = {
  totalSteps: 10,
  framesPerDot: 2,
  defaultBird: {
    radius: 35,
    mass: 6.0,
    frictionAir: 0.0005,
  },
  frameMs: 1000 / 60,
} as const;

export interface TrajectoryRenderConfig {
  alphaMin: number;
  alphaMax: number;
  alphaFadeMultiplier: number;
  dotMinSize: number;
  dotMaxSize: number;
  dotShrinkRate: number;
  shadowOffset: number;
  shadowColor: number;
  dotColor: number;
}

export const TRAJECTORY_RENDER_CONFIG: TrajectoryRenderConfig = {
  alphaMin: 0.35,
  alphaMax: 0.9,
  alphaFadeMultiplier: 0.7,
  dotMinSize: 4,
  dotMaxSize: 8,
  dotShrinkRate: 0.2,
  shadowOffset: 1.5,
  shadowColor: 0x000000,
  dotColor: 0xffffff,
} as const;
