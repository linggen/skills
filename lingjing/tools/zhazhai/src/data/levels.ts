import { Runtime, type Lang } from "../zhazhai/runtime";
import { BirdType } from "../types/BirdType";
import { PigSize } from "../constants";
import { BlockMaterial } from "../constants/Materials";
import { BlockShape } from "../config/assetManifest";
import {
  GRID_UNIT,
  ThemeType,
  SLINGSHOT_X,
  STRUCTURE_START_X,
  GROUND_Y,
} from "../config/GameConfig";
import type { Position } from "../types/Vector2";
import { THROW_LEVELS, THROW_WORDS } from "./throws";

export type { ThemeType };

export interface StarThresholds {
  oneStar: number;
  twoStars: number;
  threeStars: number;
}

export interface LevelBirdConfig {
  type: BirdType;
}

export interface LevelBlockConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  material: BlockMaterial;
  rotation: number;
  elementIndex?: string;
  /** 砸寨: drawn as this painting (`zz:<name>`, zhazhai/props.ts) instead of a plain block: a log, a rock, a pine. */
  skin?: string;
  /** 砸寨: rooted where it stands, never breaks (a live pine): it takes the arrow and holds. */
  fixed?: boolean;
  /** 砸寨: a body with no picture of its own — the painting is set-dressing over it (`decor`: the hoop's backboard). */
  hidden?: boolean;
}

/** 砸寨: what the throws are aimed at, when it is not the weasel gang (zhazhai/targets.ts). */
export type TargetSpec =
  | {
      kind: "deer";
      /** A throw passing or landing this near (units) flushes it: it bolts. */
      spook: number;
      /** Head up after a scare, before it runs (ms). */
      alert: number;
      /** Gone this long before it comes back (ms). */
      away: number;
      /** Where it comes back to, in turn (x). */
      spots: number[];
    }
  | {
      kind: "lu";
      /** One breath every `every` ms; the wing root shows for `open` ms of it. */
      every: number;
      open: number;
      /** Struck on the hide, it fights the brambles: it breathes this fast after. */
      struggle: { every: number; open: number };
      /** The wing root, from its middle (units). */
      root: { dx: number; dy: number; r: number };
    }
  | {
      /** A thing that stands and takes the blow (讲堂试法's straw dummies, 马小宝's 摇杯): its painting (`art`, game-assets/art),
          its body (units, `w` × `h`), drawn `draw` units wide, struck down at `health`. */
      kind: "still";
      art: string;
      w: number;
      h: number;
      draw: number;
      health: number;
    }
  | {
      /** The hoop (今二 j04-line, 「吸四拍，吐六拍。头一个进了」): a net under the rim of the painted hoop (decor prop-hoop) —
          a ball that comes down onto it from above, through the rim, goes in; one that strikes it from the side or below
          is turned. Body (units, `w` × `h`), pinned, unpainted (the hoop's painting is the decor's). */
      kind: "hoop";
      w: number;
      h: number;
    }
  | {
      kind: "gourd";
      /** A stone landing in the dark: after `delay` ms the gourd is unstoppered, its light showing until an arrow strikes, or `open` ms. */
      delay: number;
      open: number;
      /** The gourd's mouth and the two fingers on its stopper, from his middle (units): the one place an arrow counts. */
      root: { dx: number; dy: number; r: number };
    };

/** 砸寨: a painted thing with no body — the stream, the brush, the torch (zhazhai/props.ts). */
export interface DecorConfig {
  art: string;
  x: number;
  /** Its foot (world y). */
  y: number;
  /** Its drawn height (units). */
  h: number;
  /** In front of the targets and the blocks (else behind them). */
  front?: boolean;
  flip?: boolean;
}

/** 砸寨: the answer a sensible hand finds (tools/zhazhai/bot.mjs; tests/game-zhazhai.test.mjs). */
export interface BotHint {
  /** Aim at this point of the target (units from its middle), not its middle. */
  aim?: { dx: number; dy: number };
  /** Let go so the throw arrives while the target is open (the 鯥's breath). */
  timed?: boolean;
  /** Tap in flight when the throw's line points at the aim (the sword's dash). */
  dash?: boolean;
  /** Where a stone goes to draw the light (暗河: 「往左边黑里一丢」). */
  decoy?: { x: number; y: number };
}

export interface LevelPigConfig {
  x: number;
  y: number;
  size: PigSize;
}

export interface LevelSlingshotConfig {
  x: number;
  y: number;
}

export interface LevelData {
  levelId: number;
  name: string;
  description: string;
  theme: ThemeType;
  birds: LevelBirdConfig[];
  structures: LevelBlockConfig[];
  pigs: LevelPigConfig[];
  slingshot: LevelSlingshotConfig;
  starThresholds: StarThresholds;
  teachingFocus: string;
  /** 砸寨: a story throw's name for the level (`lv=deer-wind`); the forts go by number. */
  key?: string;
  /** 砸寨: the painted place it is set in (game-assets/art/place-<id>.webp); none: upstream's parallax. */
  place?: string;
  target?: TargetSpec;
  decor?: DecorConfig[];
  bot?: BotHint;
}

export interface GridBlockConfig {
  col: number;
  row: number;
  gridW: number;
  gridH: number;
  material: BlockMaterial;
  shape: BlockShape;
  rotation?: 0 | 45 | 90 | 180 | 270;
}

export interface GridPigConfig {
  col: number;
  row: number;
  size: PigSize;
}

export interface GridLevelData {
  levelId: number;
  name: string;
  description: string;
  theme: ThemeType;
  birds: LevelBirdConfig[];
  blocks: GridBlockConfig[];
  pigs: GridPigConfig[];
  slingshot: LevelSlingshotConfig;
  starThresholds: StarThresholds;
  teachingFocus: string;
}

const SLINGSHOT_Y = GROUND_Y - GRID_UNIT;

interface GridLevelBlueprint extends Omit<GridLevelData, "starThresholds"> {
  minBirdsToClear: number;
}

const SLINGSHOT: LevelSlingshotConfig = { x: SLINGSHOT_X, y: SLINGSHOT_Y };

const BLOCK_SCORE_MULTIPLIER: Record<BlockMaterial, number> = {
  [BlockMaterial.GLASS]: 1,
  [BlockMaterial.WOOD]: 2,
  [BlockMaterial.STONE]: 3,
  [BlockMaterial.METAL]: 4,
  [BlockMaterial.EXPLOSIVE]: 5,
};

function estimateStarThresholds(level: GridLevelBlueprint): StarThresholds {
  const pigScore = level.pigs.length * 5000;
  const blockScore = level.blocks.reduce(
    (total, block) => total + 500 * BLOCK_SCORE_MULTIPLIER[block.material],
    0
  );
  const explosiveBonus =
    level.blocks.filter((block) => block.material === BlockMaterial.EXPLOSIVE).length * 500;
  const spareBirdBonus = Math.max(0, level.birds.length - level.minBirdsToClear) * 10000;
  const impactBonus = Math.max(1500, level.blocks.length * 140);
  const perfectScore = pigScore + blockScore + explosiveBonus + spareBirdBonus + impactBonus;

  return {
    oneStar: pigScore,
    twoStars: Math.floor(perfectScore * 0.6),
    threeStars: Math.floor(perfectScore * 0.86),
  };
}

function createGridLevel(level: GridLevelBlueprint): GridLevelData {
  const { minBirdsToClear: _minBirdsToClear, ...gridLevel } = level;
  return {
    ...gridLevel,
    starThresholds: estimateStarThresholds(level),
  };
}

/*
 * GRID COORDINATE SYSTEM:
 * - Block at (col, row) with size (gridW x gridH) spans from col to col+gridW and row to row+gridH
 * - Block anchor is CENTER: x = STRUCTURE_START_X + (col + gridW/2) * 70
 * - greeneling anchor is BOTTOM-CENTER: y = GROUND_Y - row * 70 - pigSize * 35
 * - greeneling at row 0 sits ON GROUND
 *
 * Example: Lean-to with greeneling in middle gap
 * - Left wall: col:0, gridW:1 (spans cols 0-1)
 * - Right wall: col:2, gridW:1 (spans cols 2-3)
 * - Roof: col:0, gridW:3, gridH:1 (spans cols 0-3)
 * - greeneling at col:1, row:0 (centered in gap between walls)
 */

const GRID_LEVELS: GridLevelData[] = [
  // 砸寨 level 1 — upstream level 1's fort (its name and words: LEVEL_WORDS below)
  createGridLevel({
    levelId: 1,
    name: "First Blood",
    description: "A single greeneling in a glass house. Easy pickings!",
    theme: "forest",
    teachingFocus: "Aim and release! Glass shatters easily.",
    birds: [{ type: BirdType.RED }],
    blocks: [
      // Simple glass box - left wall
      { col: 3, row: 0, gridW: 1, gridH: 2, material: BlockMaterial.GLASS, shape: "rectangle" },
      // Right wall
      { col: 5, row: 0, gridW: 1, gridH: 2, material: BlockMaterial.GLASS, shape: "rectangle" },
      // Roof
      { col: 3, row: 2, gridW: 3, gridH: 1, material: BlockMaterial.GLASS, shape: "rectangle" },
      // Triangle roof peak
      {
        col: 4,
        row: 3,
        gridW: 1,
        gridH: 1,
        material: BlockMaterial.GLASS,
        shape: "triangle",
        rotation: 0,
      },
    ],
    pigs: [
      // One greeneling centered in the box
      { col: 4, row: 0, size: PigSize.SMALL },
    ],
    slingshot: SLINGSHOT,
    minBirdsToClear: 1,
  }),
  // 砸寨 level 2 — upstream level 3's fort (its name and words: LEVEL_WORDS below)
  createGridLevel({
    levelId: 2,
    name: "Timber!",
    description: "Wood structures need speed. Yellow alien accelerates!",
    theme: "forest",
    teachingFocus: "Tap Yellow alien for a speed boost! It pierces wood easily.",
    birds: [{ type: BirdType.YELLOW }, { type: BirdType.RED }, { type: BirdType.RED }],
    blocks: [
      // Desert log cabin - left wall (only 2 rows tall to not overlap with porch roof)
      { col: 1, row: 0, gridW: 1, gridH: 2, material: BlockMaterial.WOOD, shape: "rectangle" },
      // Right wall (only 2 rows tall)
      { col: 5, row: 0, gridW: 1, gridH: 2, material: BlockMaterial.WOOD, shape: "rectangle" },
      // Porch roof (supports the cabin walls)
      { col: 0, row: 2, gridW: 7, gridH: 1, material: BlockMaterial.WOOD, shape: "rectangle" },
      // Cabin roof on top of porch roof
      { col: 1, row: 3, gridW: 5, gridH: 1, material: BlockMaterial.WOOD, shape: "rectangle" },
      // Front porch left pillar
      { col: 0, row: 0, gridW: 1, gridH: 2, material: BlockMaterial.WOOD, shape: "rectangle" },
      // Front porch right pillar
      { col: 6, row: 0, gridW: 1, gridH: 2, material: BlockMaterial.WOOD, shape: "rectangle" },
      // Triangle roof accents
      {
        col: 0,
        row: 3,
        gridW: 1,
        gridH: 1,
        material: BlockMaterial.WOOD,
        shape: "triangle",
        rotation: 0,
      },
      {
        col: 6,
        row: 3,
        gridW: 1,
        gridH: 1,
        material: BlockMaterial.WOOD,
        shape: "triangle",
        rotation: 0,
      },
      // Decorative circle on cabin roof corner (cabin roof ends at row 4)
      { col: 1, row: 4, gridW: 1, gridH: 1, material: BlockMaterial.STONE, shape: "circle" },
    ],
    pigs: [
      // Inside cabin left
      { col: 2, row: 0, size: PigSize.SMALL },
      // Inside cabin right
      { col: 4, row: 0, size: PigSize.SMALL },
      // On cabin roof (porch roof ends at row 3)
      { col: 3, row: 4, size: PigSize.SMALL },
    ],
    slingshot: SLINGSHOT,
    minBirdsToClear: 1,
  }),
  // 砸寨 level 3 — upstream level 2's fort (its name and words: LEVEL_WORDS below)
  createGridLevel({
    levelId: 3,
    name: "Glass Snap",
    description: "Glass blocks hide hidden greenelings. Blue alien reveals the secret!",
    theme: "forest",
    teachingFocus: "Tap to split Blue alien into three! Glass shatters instantly.",
    birds: [{ type: BirdType.BLUE }, { type: BirdType.RED }],
    blocks: [
      // Glass formation - left glass pillar
      { col: 2, row: 0, gridW: 1, gridH: 4, material: BlockMaterial.GLASS, shape: "rectangle" },
      // Right glass pillar
      { col: 4, row: 0, gridW: 1, gridH: 4, material: BlockMaterial.GLASS, shape: "rectangle" },
      // Bridge between glass pillars (extends to support upper pillars)
      { col: 2, row: 4, gridW: 3, gridH: 1, material: BlockMaterial.GLASS, shape: "rectangle" },
      // Upper glass  cage - left pillar (on the bridge)
      { col: 2, row: 5, gridW: 1, gridH: 2, material: BlockMaterial.GLASS, shape: "rectangle" },
      // Upper glass  cage - right pillar (on the bridge)
      { col: 4, row: 5, gridW: 1, gridH: 2, material: BlockMaterial.GLASS, shape: "rectangle" },
      // Top cap
      { col: 2, row: 7, gridW: 3, gridH: 1, material: BlockMaterial.GLASS, shape: "rectangle" },
      // Triangle roof peak
      {
        col: 3,
        row: 8,
        gridW: 1,
        gridH: 1,
        material: BlockMaterial.GLASS,
        shape: "triangle",
        rotation: 0,
      },
      // Circle decorations on top cap corners (top cap ends at row 8)
      { col: 2, row: 8, gridW: 1, gridH: 1, material: BlockMaterial.GLASS, shape: "circle" },
      { col: 4, row: 8, gridW: 1, gridH: 1, material: BlockMaterial.GLASS, shape: "circle" },
    ],
    pigs: [
      // Ground greeneling in center gap
      { col: 3, row: 0, size: PigSize.SMALL },
      // Upper greeneling in glass cage (on top of bridge at row 5)
      { col: 3, row: 5, size: PigSize.SMALL },
    ],
    slingshot: SLINGSHOT,
    minBirdsToClear: 1,
  }),
  // 砸寨 level 4 — upstream level 7's fort (its name and words: LEVEL_WORDS below)
  createGridLevel({
    levelId: 4,
    name: "TNT Chain",
    description:
      "Three towers connected by explosive bridges! One well-placed shot triggers total destruction.",
    theme: "forest",
    teachingFocus: "TNT chains devastate everything! Find the weak link in the chain.",
    birds: [{ type: BirdType.YELLOW }, { type: BirdType.BLACK }, { type: BirdType.RED }],
    blocks: [
      // === LEFT TOWER (Stone base with 2x3 platform) ===
      { col: -2, row: 0, gridW: 2, gridH: 3, material: BlockMaterial.STONE, shape: "rectangle" },
      { col: 0, row: 0, gridW: 1, gridH: 3, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: -2, row: 3, gridW: 1, gridH: 2, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: 0, row: 3, gridW: 1, gridH: 2, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: -2, row: 5, gridW: 3, gridH: 1, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: -1, row: 6, gridW: 1, gridH: 1, material: BlockMaterial.STONE, shape: "circle" },
      {
        col: -2,
        row: 7,
        gridW: 3,
        gridH: 1,
        material: BlockMaterial.WOOD,
        shape: "triangle",
        rotation: 0,
      },
      // === TNT BRIDGE #1 (Left to Center) - Support + TNT on top ===
      { col: 1, row: 0, gridW: 1, gridH: 3, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: 1, row: 3, gridW: 1, gridH: 1, material: BlockMaterial.WOOD, shape: "square" },
      { col: 2, row: 0, gridW: 1, gridH: 3, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: 2, row: 3, gridW: 1, gridH: 1, material: BlockMaterial.EXPLOSIVE, shape: "square" },
      // === CENTER TOWER (Wood with TNT Core) ===
      { col: 3, row: 0, gridW: 1, gridH: 3, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: 5, row: 0, gridW: 1, gridH: 3, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: 4, row: 0, gridW: 1, gridH: 1, material: BlockMaterial.EXPLOSIVE, shape: "square" },
      { col: 3, row: 3, gridW: 3, gridH: 1, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: 3.5, row: 4, gridW: 1, gridH: 1, material: BlockMaterial.STONE, shape: "circle" },
      { col: 4.5, row: 4, gridW: 1, gridH: 1, material: BlockMaterial.STONE, shape: "circle" },
      {
        col: 3,
        row: 5,
        gridW: 3,
        gridH: 1,
        material: BlockMaterial.WOOD,
        shape: "triangle",
        rotation: 0,
      },
      // === TNT BRIDGE #2 (Center to Right) - Support + TNT on top ===
      { col: 6, row: 0, gridW: 1, gridH: 3, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: 6, row: 3, gridW: 1, gridH: 1, material: BlockMaterial.WOOD, shape: "square" },
      { col: 7, row: 0, gridW: 1, gridH: 3, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: 7, row: 3, gridW: 1, gridH: 1, material: BlockMaterial.EXPLOSIVE, shape: "square" },
      // === RIGHT TOWER (Stone/Wood with 2x3 base) ===
      { col: 8, row: 0, gridW: 2, gridH: 3, material: BlockMaterial.STONE, shape: "rectangle" },
      { col: 10, row: 0, gridW: 1, gridH: 3, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: 8, row: 3, gridW: 1, gridH: 2, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: 10, row: 3, gridW: 1, gridH: 2, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: 8, row: 5, gridW: 3, gridH: 1, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: 9, row: 6, gridW: 1, gridH: 1, material: BlockMaterial.STONE, shape: "circle" },
      {
        col: 8,
        row: 7,
        gridW: 3,
        gridH: 1,
        material: BlockMaterial.WOOD,
        shape: "triangle",
        rotation: 0,
      },
    ],
    pigs: [
      { col: -1, row: 3, size: PigSize.SMALL },
      { col: 0, row: 6, size: PigSize.SMALL },
      { col: 2, row: 4, size: PigSize.SMALL },
      { col: 9, row: 3, size: PigSize.SMALL },
      { col: 10, row: 6, size: PigSize.SMALL },
    ],
    slingshot: SLINGSHOT,
    minBirdsToClear: 1,
  }),
  // 砸寨 level 5 — upstream level 13's fort (its name and words: LEVEL_WORDS below)
  createGridLevel({
    levelId: 5,
    name: "Dungeon Depths",
    description: "Multi-level dungeon with trapped greenelings!",
    theme: "forest",
    birds: [
      { type: BirdType.RED },
      { type: BirdType.BLUE },
      { type: BirdType.BLACK },
      { type: BirdType.BLACK },
      { type: BirdType.RED },
    ],
    blocks: [
      { col: 0, row: 0, gridW: 1, gridH: 2, material: BlockMaterial.STONE, shape: "rectangle" },
      { col: 8, row: 0, gridW: 1, gridH: 2, material: BlockMaterial.STONE, shape: "rectangle" },
      { col: 0, row: 2, gridW: 9, gridH: 1, material: BlockMaterial.STONE, shape: "rectangle" },
      { col: 1, row: 3, gridW: 1, gridH: 2, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: 3, row: 3, gridW: 1, gridH: 2, material: BlockMaterial.METAL, shape: "rectangle" },
      { col: 5, row: 3, gridW: 1, gridH: 2, material: BlockMaterial.METAL, shape: "rectangle" },
      { col: 7, row: 3, gridW: 1, gridH: 2, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: 1, row: 5, gridW: 7, gridH: 1, material: BlockMaterial.WOOD, shape: "rectangle" },
      { col: 2, row: 6, gridW: 1, gridH: 2, material: BlockMaterial.GLASS, shape: "rectangle" },
      { col: 4, row: 6, gridW: 1, gridH: 2, material: BlockMaterial.GLASS, shape: "rectangle" },
      { col: 6, row: 6, gridW: 1, gridH: 2, material: BlockMaterial.GLASS, shape: "rectangle" },
      { col: 2, row: 8, gridW: 5, gridH: 1, material: BlockMaterial.GLASS, shape: "rectangle" },
      { col: 3, row: 9, gridW: 1, gridH: 2, material: BlockMaterial.STONE, shape: "rectangle" },
      { col: 5, row: 9, gridW: 1, gridH: 2, material: BlockMaterial.STONE, shape: "rectangle" },
      { col: 3, row: 11, gridW: 3, gridH: 1, material: BlockMaterial.STONE, shape: "rectangle" },
      { col: 4, row: 12, gridW: 1, gridH: 2, material: BlockMaterial.METAL, shape: "rectangle" },
      { col: 4, row: 0, gridW: 1, gridH: 1, material: BlockMaterial.EXPLOSIVE, shape: "square" },
      { col: 4, row: 9, gridW: 1, gridH: 1, material: BlockMaterial.EXPLOSIVE, shape: "square" },
      // Triangle roof accents (on platform at row 2)
      {
        col: 0,
        row: 3,
        gridW: 1,
        gridH: 1,
        material: BlockMaterial.STONE,
        shape: "triangle",
        rotation: 0,
      },
      {
        col: 8,
        row: 3,
        gridW: 1,
        gridH: 1,
        material: BlockMaterial.STONE,
        shape: "triangle",
        rotation: 0,
      },
      // Decorative circles on platform (moved to avoid wood column overlap)
      { col: 2, row: 3, gridW: 1, gridH: 1, material: BlockMaterial.STONE, shape: "circle" },
      { col: 6, row: 3, gridW: 1, gridH: 1, material: BlockMaterial.STONE, shape: "circle" },
    ],
    pigs: [
      { col: 2, row: 0, size: PigSize.SMALL },
      { col: 1, row: 6, size: PigSize.SMALL },
      { col: 6, row: 0, size: PigSize.SMALL },
      { col: 5, row: 6, size: PigSize.SMALL },
      { col: 6, row: 9, size: PigSize.SMALL },
      { col: 4, row: 14, size: PigSize.LARGE },
    ],
    slingshot: SLINGSHOT,
    teachingFocus: "Descend through the dungeon layers!",
    minBirdsToClear: 3,
  }),
];

function gridToPixelBlock(block: GridBlockConfig): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const pixelW = block.gridW * GRID_UNIT;
  const pixelH = block.gridH * GRID_UNIT;

  let xOffset = block.gridW / 2;
  let yOffset = block.gridH / 2;

  if (block.shape === "triangle") {
    yOffset = block.gridH * 0.35;
    if (block.gridW === 1) {
      xOffset = block.gridW * 0.35;
    }
  }

  return {
    x: STRUCTURE_START_X + (block.col + xOffset) * GRID_UNIT,
    y: GROUND_Y - (block.row + yOffset) * GRID_UNIT,
    width: pixelW,
    height: pixelH,
  };
}

function gridToPixelPig(greeneling: GridPigConfig): Position {
  const pigGridSizes: Record<PigSize, number> = {
    [PigSize.SMALL]: 1,
    [PigSize.MEDIUM]: 2,
    [PigSize.LARGE]: 3,
  };

  const pigSize = pigGridSizes[greeneling.size];
  const pigPixelSize = pigSize * GRID_UNIT;

  return {
    x: STRUCTURE_START_X + (greeneling.col + pigSize / 2) * GRID_UNIT,
    y: GROUND_Y - greeneling.row * GRID_UNIT - pigPixelSize / 2,
  };
}

function convertGridLevelToLevelData(gridLevel: GridLevelData): LevelData {
  const structures: LevelBlockConfig[] = gridLevel.blocks.map((block) => {
    const pixelPos = gridToPixelBlock(block);

    const isVerticalRectangle = block.shape === "rectangle" && block.gridW < block.gridH;
    const canonicalW = isVerticalRectangle ? block.gridH : block.gridW;
    const canonicalH = isVerticalRectangle ? block.gridW : block.gridH;
    const rotation = isVerticalRectangle ? (block.rotation ?? 0) + 90 : (block.rotation ?? 0);

    const elementIndex = `${block.material}_${block.shape}_pristine_${canonicalW}x${canonicalH}`;

    return {
      x: pixelPos.x,
      y: pixelPos.y,
      width: pixelPos.width,
      height: pixelPos.height,
      material: block.material,
      rotation,
      elementIndex,
    };
  });

  const pigs: LevelPigConfig[] = gridLevel.pigs.map((greeneling) => {
    const pixelPos = gridToPixelPig(greeneling);
    return {
      x: pixelPos.x,
      y: pixelPos.y,
      size: greeneling.size,
    };
  });

  return {
    levelId: gridLevel.levelId,
    name: gridLevel.name,
    description: gridLevel.description,
    theme: gridLevel.theme,
    birds: gridLevel.birds,
    structures,
    pigs,
    slingshot: gridLevel.slingshot,
    starThresholds: gridLevel.starThresholds,
    teachingFocus: gridLevel.teachingFocus,
  };
}

/** 砸寨: the forts (1…5, the title screen's select), then the story's throws (data/throws.ts: by `key`). */
export const LEVELS: LevelData[] = [...GRID_LEVELS.map(convertGridLevelToLevelData), ...THROW_LEVELS];

/** 砸寨's words for each fort, in both languages (upstream's English names stay in GRID_LEVELS, unused). */
export const LEVEL_WORDS: Record<number, Record<Lang, { name: string; description: string; teachingFocus: string }>> = {
  1: {
    zh: { name: "偷鸡的瓦棚", description: "一只小黄鼠狼精，躲在瓦搭的棚子里啃鸡腿。", teachingFocus: "往后拉，松手。瓦一碰就碎。" },
    en: { name: "Chicken Thief's Shed", description: "One little weasel in a shed of roof tiles, gnawing a drumstick.", teachingFocus: "Pull back and let go. Tiles shatter at a touch." },
  },
  2: {
    zh: { name: "柴门木屋", description: "三只躲在木屋里。木头结实，要快。", teachingFocus: "短飞剑：飞行中点一下，直冲出去，木头一穿就透。" },
    en: { name: "The Log Cabin", description: "Three hide in a cabin of logs. Wood is tough: be quick.", teachingFocus: "Flying sword: tap in flight and it shoots straight on, through wood." },
  },
  3: {
    zh: { name: "瓦楼", description: "两层瓦楼，上下各藏一只。", teachingFocus: "陶罐：飞行中点一下，碎成三块，各砸各的。" },
    en: { name: "The Tile Tower", description: "A two-storey tile tower, one weasel up, one down.", teachingFocus: "Clay pot: tap in flight and it breaks into three." },
  },
  4: {
    zh: { name: "火药房", description: "三座木楼，中间垫着火药桶。", teachingFocus: "五雷符：一碰就炸；点燃一个火药桶，连着一串都炸。" },
    en: { name: "The Powder Store", description: "Three wooden towers with powder kegs between them.", teachingFocus: "Thunder talisman: it bursts on a strike. Light one keg and the chain goes up." },
  },
  5: {
    zh: { name: "大王寨", description: "黄鼠狼大王坐在寨顶，石头、铁、瓦，一层一层。", teachingFocus: "从上往下拆：先砸塌顶上的大王。" },
    en: { name: "The Chief's Keep", description: "The weasel chief sits on top: stone, iron and tile, layer on layer.", teachingFocus: "Work from the top: bring the chief down first." },
  },
  ...THROW_WORDS,
};

const localize = (level: LevelData): LevelData => ({ ...level, ...(LEVEL_WORDS[level.levelId]?.[Runtime.lang] ?? {}) });

export function getLevelById(id: number): LevelData | undefined {
  const level = LEVELS.find((l) => l.levelId === id);
  return level && localize(level);
}

export function getTotalLevels(): number {
  return LEVELS.length;
}

/** 砸寨: the forts the title screen's select shows (the story's throws open by `lv=<key>` only). */
export function getFortCount(): number {
  return LEVELS.filter((l) => !l.key).length;
}

/** 砸寨: a level asked for by number or by a throw's key (`deer-wind`): its number, else 0. */
export function levelIdOf(asked: number | string | undefined | null): number {
  if (asked == null || asked === "") return 0;
  const n = Number(asked);
  if (Number.isInteger(n)) return LEVELS.some((l) => l.levelId === n) ? n : 0;
  return LEVELS.find((l) => l.key === asked)?.levelId ?? 0;
}
