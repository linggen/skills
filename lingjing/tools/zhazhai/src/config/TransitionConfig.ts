import type { ThemeType } from "./GameConfig";

export const TRANSITION_ATLAS_KEY = "vfx" as const;
export interface TransitionColors {
  primary: [number, number, number];
  secondary: [number, number, number];
}

// Theme → gradient colors mapping
export const TRANSITION_THEME_COLORS: Record<ThemeType, TransitionColors> = {
  forest: {
    primary: [0.3, 0.78, 0.31], // atmosphereNear green (#4caf50)
    secondary: [0.26, 0.65, 0.96], // skyMid1 blue (#42a5f5)
  },
  desert: {
    primary: [0.9, 0.72, 0.3], // atmosphereNear orange (#ffb74d)
    secondary: [1.0, 0.56, 0.0], // skyTop orange (#e65100)
  },
  castle: {
    primary: [0.48, 0.31, 0.67], // atmosphereNear purple (#ab47bc)
    secondary: [0.19, 0.11, 0.57], // skyMid1 purple (#311b92)
  },
  ice: {
    primary: [0.47, 0.51, 0.8], // atmosphereNear blue (#7986cb)
    secondary: [0.05, 0.28, 0.63], // skyTop blue (#0d47a1)
  },
  volcano: {
    primary: [0.8, 0.25, 0.1], // atmosphereNear red-orange (#cc441a)
    secondary: [0.15, 0.08, 0.05], // skyTop dark red (#26140d)
  },
  jungle: {
    primary: [0.15, 0.45, 0.25], // atmosphereNear green (#277340)
    secondary: [0.05, 0.2, 0.15], // skyTop dark green (#0d3326)
  },
};

export const DEFAULT_TRANSITION_COLORS: TransitionColors = {
  primary: [0.1, 0.1, 0.18],
  secondary: [0.16, 0.16, 0.3],
};

export const PATTERN_KEYS = [
  "pattern_01",
  "pattern_10",
  "pattern_21",
  "pattern_23",
  "pattern_24",
  "pattern_32",
  "pattern_33",
  "pattern_41",
  "pattern_59",
  "pattern_68",
  "pattern_72",
  "pattern_74",
  "pattern_75",
  "pattern_76",
  "pattern_77",
  "pattern_78",
  "pattern_81",
  "pattern_84",
] as const;

export const TRANSITION_DURATION = {
  COVER: 800,
  REVEAL: 800,
} as const;
