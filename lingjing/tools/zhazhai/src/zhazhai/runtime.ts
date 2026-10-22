// runtime.ts — what the host (scripts/games/zhazhai.js) sets before the game starts: the language, a level to open
// straight into (the 游戏厅's `lv`, or a story's), and where a finished level is reported. Upstream reads it at the few
// seams where an embedded game must differ from a whole-page one (no fullscreen, no rotate overlay, no quit).
export type Lang = "zh" | "en";

export interface LevelResult {
  level: number;
  /** 砸寨: a story throw's key (`deer-wind`), else null. */
  key?: string | null;
  won: boolean;
  stars: number;
  score: number;
}

/** The one outer shell the page's small games wear (scripts/games/shell.js `shellFor`): its pause, its lead card. */
export interface ShellHands {
  paused(): boolean;
  onPause(fn: (on: boolean) => void): () => void;
  lead(text: string, o?: { count?: boolean; auto?: number; reducedMotion?: boolean }): Promise<void>;
  /** A sound, by name: the shell's one sound layer plays it (systems/audio/adapters/ShellSoundAdapter.ts). */
  sound?(event: string): void;
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
  /** In the shell: its bar pauses the play and the page shows the result, so the canvas keeps no pause button,
      pause menu, result screen or title screen of its own (Hanli 10-20: 「确保所有小游戏一套外壳」). Null: as ever. */
  shell: null as ShellHands | null,
  /** In the shell: the line the next level opens with on the shell's lead card — the field drawn behind it, standing
      still till it is read (Hanli 10-20: 「开场卡后面先画出画面」). Taken by the GameScene that shows it. */
  leadLine: "",
};

/** localStorage, namespaced: the lingjing page shares this origin. */
export const storageKey = (k: string): string => `lingjing.zhazhai.${k}`;
