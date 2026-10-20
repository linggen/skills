// runtime.ts — what the host (scripts/games/zhazhai.js) sets before the game starts: the language, a level to open
// straight into (the 游戏厅's `lv`, or a story's), and where a finished level is reported. Upstream reads it at the few
// seams where an embedded game must differ from a whole-page one (no fullscreen, no rotate overlay, no quit).
export type Lang = "zh" | "en";

export interface LevelResult {
  level: number;
  won: boolean;
  stars: number;
  score: number;
}

export const Runtime = {
  lang: "zh" as Lang,
  /** Open straight into this level (skip the title and the level select). */
  directLevel: 0,
  onResult: (_r: LevelResult): void => {},
  onLeave: (): void => {},
  /** Inside a page (always, for 砸寨): no fullscreen, no rotate overlay. */
  embedded: true,
  /** Reduced motion (the mount's, else the system's): a thing from the basket is simply in the pouch. */
  reducedMotion: false,
};

/** localStorage, namespaced: the lingjing page shares this origin. */
export const storageKey = (k: string): string => `lingjing.zhazhai.${k}`;
