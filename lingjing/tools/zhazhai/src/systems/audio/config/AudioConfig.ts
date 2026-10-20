import type { ThemeType } from "../../../config/GameConfig";
import { BlockMaterial } from "../../../constants/Materials";

export const AUDIO_SPRITE_KEY = "sfx-master";

export const AUDIO_KEYS = {
  // UI
  CLICK: "click",
  SELECT: "select",
  BACK: "back",
  SCORE_POP: "pluck",

  // Impact sounds
  IMPACT_WOOD_LIGHT: "impactWoodLight",
  IMPACT_WOOD_MEDIUM: "impactWoodMedium",
  IMPACT_WOOD_HEAVY: "impactWoodHeavy",
  IMPACT_GLASS_LIGHT: "impactGlassLight",
  IMPACT_GLASS_MEDIUM: "impactGlassMedium",
  IMPACT_GLASS_HEAVY: "impactGlassHeavy",
  IMPACT_STONE_LIGHT: "impactStoneLight",
  IMPACT_STONE_MEDIUM: "impactStoneMedium",
  IMPACT_STONE_HEAVY: "impactStoneHeavy",
  IMPACT_METAL_LIGHT: "impactMetalLight",
  IMPACT_METAL_MEDIUM: "impactMetalMedium",
  IMPACT_METAL_HEAVY: "impactMetalHeavy",

  // Game events
  PIG_DESTROY_01: "pigDestroy01",
  PIG_DESTROY_02: "pigDestroy02",
  PIG_DESTROY_03: "pigDestroy03",
  PIG_DESTROY_04: "pigDestroy04",
  PIG_DESTROY_05: "pigDestroy05",
  PIG_DESTROY_06: "pigDestroy06",
  PIG_DESTROY_07: "pigDestroy07",
  PIG_DESTROY_08: "pigDestroy08",
  PIG_DESTROY_09: "pigDestroy09",
  PIG_DESTROY_10: "pigDestroy10",
  BIRD_LAUNCH: "birdLaunch",
  BIRD_IMPACT: "birdImpact",
  EXPLOSION: "explosion",
  BIRD_SPLIT: "birdSplit",
  EGG_DROP: "drop",

  // Music
  MUSIC_MENU: "musicMenu",
  MUSIC_FOREST: "musicForest",
  MUSIC_DESERT: "musicDesert",
  MUSIC_CASTLE: "musicCastle",
  MUSIC_ICE: "musicIce",

  // Jingles
  JINGLE_WIN: "jingleWin",
  JINGLE_LOSE: "jingleLose",
} as const;

export type AudioKey = (typeof AUDIO_KEYS)[keyof typeof AUDIO_KEYS];

export const THEME_MUSIC: Record<ThemeType, string> = {
  forest: AUDIO_KEYS.MUSIC_FOREST,
  desert: AUDIO_KEYS.MUSIC_DESERT,
  castle: AUDIO_KEYS.MUSIC_CASTLE,
  ice: AUDIO_KEYS.MUSIC_ICE,
  volcano: AUDIO_KEYS.MUSIC_DESERT,
  jungle: AUDIO_KEYS.MUSIC_FOREST,
};

export const DEFAULT_MUSIC = AUDIO_KEYS.MUSIC_FOREST;

export const MATERIAL_IMPACT_SOUNDS: Record<BlockMaterial, readonly [string, string, string]> = {
  [BlockMaterial.WOOD]: [
    AUDIO_KEYS.IMPACT_WOOD_LIGHT,
    AUDIO_KEYS.IMPACT_WOOD_MEDIUM,
    AUDIO_KEYS.IMPACT_WOOD_HEAVY,
  ],
  [BlockMaterial.GLASS]: [
    AUDIO_KEYS.IMPACT_GLASS_LIGHT,
    AUDIO_KEYS.IMPACT_GLASS_MEDIUM,
    AUDIO_KEYS.IMPACT_GLASS_HEAVY,
  ],
  [BlockMaterial.STONE]: [
    AUDIO_KEYS.IMPACT_STONE_LIGHT,
    AUDIO_KEYS.IMPACT_STONE_MEDIUM,
    AUDIO_KEYS.IMPACT_STONE_HEAVY,
  ],
  [BlockMaterial.METAL]: [
    AUDIO_KEYS.IMPACT_METAL_LIGHT,
    AUDIO_KEYS.IMPACT_METAL_MEDIUM,
    AUDIO_KEYS.IMPACT_METAL_HEAVY,
  ],
  [BlockMaterial.EXPLOSIVE]: [
    AUDIO_KEYS.IMPACT_WOOD_LIGHT,
    AUDIO_KEYS.IMPACT_WOOD_MEDIUM,
    AUDIO_KEYS.IMPACT_WOOD_HEAVY,
  ],
};

export const MATERIAL_DESTROY_SOUNDS: Record<BlockMaterial, string> = {
  [BlockMaterial.WOOD]: AUDIO_KEYS.IMPACT_WOOD_HEAVY,
  [BlockMaterial.GLASS]: AUDIO_KEYS.IMPACT_GLASS_HEAVY,
  [BlockMaterial.STONE]: AUDIO_KEYS.IMPACT_STONE_HEAVY,
  [BlockMaterial.METAL]: AUDIO_KEYS.IMPACT_METAL_HEAVY,
  [BlockMaterial.EXPLOSIVE]: AUDIO_KEYS.EXPLOSION,
};

export const REQUIRED_AUDIO_KEYS: readonly AudioKey[] = Object.values(AUDIO_KEYS);

export const MUSIC_CROSSFADE_DURATION = 1000;
export const SETTINGS_DEBOUNCE_MS = 300;
export const MUSIC_DUCK_VOLUME = 0.2;
export const MAX_CONCURRENT_SOUNDS = 3;

export const PIG_DESTROY_SOUNDS: readonly string[] = [
  AUDIO_KEYS.PIG_DESTROY_01,
  AUDIO_KEYS.PIG_DESTROY_02,
  AUDIO_KEYS.PIG_DESTROY_03,
  AUDIO_KEYS.PIG_DESTROY_04,
  AUDIO_KEYS.PIG_DESTROY_05,
  AUDIO_KEYS.PIG_DESTROY_06,
  AUDIO_KEYS.PIG_DESTROY_07,
  AUDIO_KEYS.PIG_DESTROY_08,
  AUDIO_KEYS.PIG_DESTROY_09,
  AUDIO_KEYS.PIG_DESTROY_10,
] as const;

export const PIG_DESTROY_PITCH_CONFIG = {
  basePitch: 1.0,
  pitchIncrement: 0.05,
  maxPitch: 1.5,
  resetWindowMs: 1500,
} as const;
