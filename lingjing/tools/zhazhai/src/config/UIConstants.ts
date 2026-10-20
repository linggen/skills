export const SCENE_KEYS = {
  BOOT: "BootScene",
  MENU: "MenuScene",
  LEVEL_SELECT: "LevelSelectScene",
  GAME: "GameScene",
  UI: "UIScene",
  PARALLAX: "ParallaxScene",
  TRANSITION: "TransitionScene",
} as const;

export type SceneKey = (typeof SCENE_KEYS)[keyof typeof SCENE_KEYS];
