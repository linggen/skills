import Phaser from "phaser";
import { SCENE_KEYS } from "../config/UIConstants";
import type { TransitionColors } from "../config/TransitionConfig";
import { TransitionScene } from "../scenes/TransitionScene";
import type { ThemeType } from "../config/GameConfig";

export class SceneNavigator {
  constructor(private scene: Phaser.Scene) {}

  toGameScene(level: number, theme: ThemeType): void {
    const colors = TransitionScene.getColorsForTheme(theme);
    const scenesToStop = [
      SCENE_KEYS.UI,
      SCENE_KEYS.PARALLAX,
      SCENE_KEYS.GAME,
      SCENE_KEYS.LEVEL_SELECT,
    ];
    this.transitionWithShader(SCENE_KEYS.GAME, { level }, colors, scenesToStop);
  }

  toMenuScene(fromTheme?: ThemeType): void {
    if (fromTheme) {
      const colors = TransitionScene.getColorsForTheme(fromTheme);
      const scenesToStop = [SCENE_KEYS.UI, SCENE_KEYS.PARALLAX, SCENE_KEYS.GAME];
      this.transitionWithShader(SCENE_KEYS.MENU, undefined, colors, scenesToStop);
    } else {
      this.scene.scene.start(SCENE_KEYS.MENU);
    }
  }

  toLevelSelectScene(): void {
    this.scene.scene.start(SCENE_KEYS.LEVEL_SELECT);
  }

  private transitionWithShader(
    targetKey: string,
    data: object | undefined,
    colors: TransitionColors,
    scenesToStop: string[]
  ): void {
    const existing = this.scene.scene.get(SCENE_KEYS.TRANSITION) as TransitionScene | null;

    if (existing?.scene?.isActive?.()) {
      if (existing.isTransitioning()) return;
      this.scene.scene.bringToTop(SCENE_KEYS.TRANSITION);
      existing.startTransition(targetKey, data, colors, scenesToStop);
    } else {
      this.scene.scene.launch(SCENE_KEYS.TRANSITION);
      this.scene.scene.bringToTop(SCENE_KEYS.TRANSITION);

      // Wait one frame for create() to complete
      this.scene.time.delayedCall(10, () => {
        const ts = this.scene.scene.get(SCENE_KEYS.TRANSITION) as TransitionScene;
        ts.startTransition(targetKey, data, colors, scenesToStop);
      });
    }
  }
}
