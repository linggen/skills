import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { PANEL_INSETS } from "../../config/DesignTokens";
import { UI_COMPONENTS_CONFIG } from "../../config/UIComponentsConfig";

export type PanelVariant = "brown" | "grey";

export interface PanelConfig {
  width: number;
  height: number;
  variant?: PanelVariant;
  title?: string;
  titleX?: number;
  titleY?: number;
  animated?: boolean;
}

const VARIANT_ASSETS: Record<PanelVariant, string> = {
  brown: "panel_brown",
  grey: "panel_grey",
};

export class Panel extends Phaser.GameObjects.Container {
  private shadow: Phaser.GameObjects.NineSlice;
  private background: Phaser.GameObjects.NineSlice;
  private titleText?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, config: PanelConfig) {
    super(scene, x, y);

    const variant = config.variant ?? "brown";

    this.shadow = scene.add.nineslice(
      T.panel.shadowOffset,
      T.panel.shadowOffset,
      "UI",
      VARIANT_ASSETS[variant],
      config.width,
      config.height,
      PANEL_INSETS.left,
      PANEL_INSETS.right,
      PANEL_INSETS.top,
      PANEL_INSETS.bottom
    );
    this.shadow.setOrigin(0.5);
    this.shadow.setAlpha(T.panel.shadowAlpha);
    this.shadow.setTint(UI_COMPONENTS_CONFIG.panel.shadowTint);
    this.add(this.shadow);

    this.background = scene.add.nineslice(
      0,
      0,
      "UI",
      VARIANT_ASSETS[variant],
      config.width,
      config.height,
      PANEL_INSETS.left,
      PANEL_INSETS.right,
      PANEL_INSETS.top,
      PANEL_INSETS.bottom
    );
    this.background.setOrigin(0.5);
    this.add(this.background);

    if (config.title) {
      const titleX = config.titleX ?? 0;
      const titleY = config.titleY ?? -config.height / 2 + T.panel.padding;

      this.titleText = scene.add.text(titleX, titleY, config.title, {
        fontFamily: T.fonts.family,
        fontSize: `${T.fonts.sizes.subtitle}px`,
        color: T.colors.text.onCream,
        stroke: T.colors.neutral.black,
        strokeThickness: UI_COMPONENTS_CONFIG.panel.titleStrokeThickness,
      });
      this.titleText.setOrigin(0.5, 0);
      this.add(this.titleText);
    }

    if (config.animated) {
      this.setScale(UI_COMPONENTS_CONFIG.panel.animation.initialScale);
      this.setAlpha(0);
      scene.tweens.add({
        targets: this,
        scale: UI_COMPONENTS_CONFIG.panel.animation.targetScale,
        alpha: UI_COMPONENTS_CONFIG.panel.animation.targetAlpha,
        duration: T.duration.medium,
        ease: T.easing.bounce,
      });
    }
  }
}
