export interface SplitAbilityConfig {
  miniBirdScale: number;
  miniBirdRadius: number;
  physics: {
    density: number;
    restitution: number;
    friction: number;
    frictionAir: number;
  };
}

export interface EggDropAbilityConfig {
  eggSize: { width: number; height: number };
  physics: {
    density: number;
    restitution: number;
    friction: number;
  };
  initialVelocityY: number;
  boostDelayMs: number;
  boostVelocityY: number;
}

export interface AbilityConfigType {
  split: SplitAbilityConfig;
  eggDrop: EggDropAbilityConfig;
}

export const ABILITY_CONFIG: AbilityConfigType = {
  split: {
    miniBirdScale: 0.5,
    miniBirdRadius: 17.5,
    physics: {
      density: 0.006,
      restitution: 0.7,
      friction: 0.35,
      frictionAir: 0.0003,
    },
  },
  eggDrop: {
    eggSize: { width: 70, height: 70 },
    physics: {
      density: 0.1,
      restitution: 0.5,
      friction: 0.5,
    },
    initialVelocityY: 5,
    boostDelayMs: 500,
    boostVelocityY: 60,
  },
} as const;
