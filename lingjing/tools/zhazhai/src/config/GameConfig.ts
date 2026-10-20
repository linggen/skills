import { BlockMaterial } from "../constants/Materials";
import { BirdType } from "../types/BirdType";
import { MATERIAL_PHYSICS, type MaterialPhysicsConfig } from "./materials";

export type ThemeType = "forest" | "desert" | "castle" | "ice" | "volcano" | "jungle";

export type MaterialHealthConfig = Record<BlockMaterial, number>;

export interface GridConfig {
  unit: number;
  groundOffset: number;
}

export interface LevelDimensions {
  width: number;
  height: number;
}

export interface ViewportDimensions {
  width: number;
  height: number;
}

export type MaterialConfig = MaterialPhysicsConfig;

export interface StarThresholdFormula {
  twoStars: (level: number) => number;
  threeStars: (level: number) => number;
}

export const GameConfig = {
  viewport: {
    width: 1920,
    height: 1080,
  } as const,

  level: {
    width: 3210,
    height: 2010,
  } as const,

  grid: {
    unit: 70,
    groundOffset: 70,
  } as const,

  materials: MATERIAL_PHYSICS,

  healthThresholds: {
    dented: 0.66,
    cracked: 0.33,
  } as const,

  slingshot: {
    yOffsetFromGround: 76,
  } as const,

  layout: {
    slingshotX: 350,
    slingshotYOffset: 70,
    structureStartX: 1680,
    birdHorizontalMargin: 150,
  } as const,

  fpsThrottle: {
    high: { fps: 55, rate: 1.0 },
    medium: { fps: 40, rate: 0.6 },
    low: { fps: 30, rate: 0.4 },
    critical: { fps: 0, rate: 0.25 },
  } as const,

  damage: {
    minImpactSpeed: 4,
    minOneShotSpeed: 9,
    multipliers: {
      [BirdType.RED]: {
        [BlockMaterial.GLASS]: 1,
        [BlockMaterial.WOOD]: 1,
        [BlockMaterial.STONE]: 0.75,
        [BlockMaterial.METAL]: 0.75,
        [BlockMaterial.EXPLOSIVE]: 1,
      },
      [BirdType.YELLOW]: {
        [BlockMaterial.GLASS]: 0.5,
        [BlockMaterial.WOOD]: 2,
        [BlockMaterial.STONE]: 0.5,
        [BlockMaterial.METAL]: 0.3,
        [BlockMaterial.EXPLOSIVE]: 1,
      },
      [BirdType.BLACK]: {
        [BlockMaterial.GLASS]: 1,
        [BlockMaterial.WOOD]: 1,
        [BlockMaterial.STONE]: 2,
        [BlockMaterial.METAL]: 2,
        [BlockMaterial.EXPLOSIVE]: 2,
      },
      [BirdType.WHITE]: {
        [BlockMaterial.GLASS]: 1.5,
        [BlockMaterial.WOOD]: 1.5,
        [BlockMaterial.STONE]: 1.5,
        [BlockMaterial.METAL]: 1.5,
        [BlockMaterial.EXPLOSIVE]: 1.0,
      },
      [BirdType.BLUE]: {
        [BlockMaterial.GLASS]: 2,
        [BlockMaterial.WOOD]: 0.5,
        [BlockMaterial.STONE]: 0.25,
        [BlockMaterial.METAL]: 0.15,
        [BlockMaterial.EXPLOSIVE]: 1.0,
      },
    } as const,
  } as const,
} as const;

export const LEVEL_WIDTH = GameConfig.level.width;
export const LEVEL_HEIGHT = GameConfig.level.height;
export const GRID_UNIT = GameConfig.grid.unit;
export const VIEWPORT_WIDTH = GameConfig.viewport.width;
export const VIEWPORT_HEIGHT = GameConfig.viewport.height;
export const GROUND_Y = LEVEL_HEIGHT - GameConfig.grid.groundOffset;
export const SLINGSHOT_X = GameConfig.layout.slingshotX;
export const STRUCTURE_START_X = GameConfig.layout.structureStartX;
export const BIRD_HORIZONTAL_MARGIN = GameConfig.layout.birdHorizontalMargin;
export const DAMAGE_MULTIPLIERS = GameConfig.damage.multipliers;

export const ENTITY_CLEANUP_CONFIG = {
  yOffset: 50,
} as const;

export const CELEBRATION_CONFIG = {
  defaultPouchRestX: 180,
  birdStartXOffset: 100,
  birdSpacing: 70,
  defaultGroundY: 500,
} as const;

export const INPUT_CONFIG = {
  minFirePowerRatio: 0.1,
} as const;

export function getMaterialConfig(material: BlockMaterial): MaterialConfig {
  return MATERIAL_PHYSICS[material];
}
