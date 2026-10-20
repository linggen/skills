export const SCORING_CONFIG = {
  PIG_DESTROYED: 5000,
  UNUSED_BIRD_BONUS: 10000,
  BLOCK_DESTROYED_BASE: 500,
  BLOCK_MATERIAL_MULTIPLIER: {
    glass: 1,
    wood: 2,
    stone: 3,
    metal: 4,
    explosive: 5,
  },
  EXPLOSION_BONUS: 500,
  IMPACT_MULTIPLIER: {
    PIG: 10,
    BLOCK: 5,
  },
} as const;

export interface ScoreCategories {
  pigs: number;
  blocks: number;
  combos: number;
  impacts: number;
  explosions: number;
  unusedBirds: number;
}

export interface ScoreBreakdown {
  total: number;
  categories: ScoreCategories;
}

export interface IScoringSystem {
  getScore(): number;
  getBreakdown(): ScoreBreakdown;
  addPigPoints(): void;
  addBlockPoints(material: string): void;
  addComboBonus(bonus: number): void;
  addImpactPoints(speed: number, isPig: boolean): void;
  addExplosionBonus(): void;
  addUnusedBirdBonus(count: number): number;
  calculateBlockPoints(material: string): number;
  calculatePigPoints(): number;
  calculateImpactPoints(impactSpeed: number, isPig: boolean): number;
  calculateUnusedBirdBonus(unusedBirds: number): number;
  reset(): void;
}
