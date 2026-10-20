import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { BUTTON_INSETS } from "../../config/DesignTokens";
import { TweenPresets } from "../TweenPresets";
import { UI_COMPONENTS_CONFIG } from "../../config/UIComponentsConfig";
import { MobileManager } from "../../systems/mobile/MobileManager";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
export type ButtonSize = "primary" | "secondary" | "small" | "icon";

export interface ButtonConfig {
  label: string;
  variant: ButtonVariant;
  size?: ButtonSize;
  onClick: () => void;
  icon?: string;
  iconPosition?: "left" | "right";
  disabled?: boolean;
}

const VARIANT_ASSETS: Record<ButtonVariant, string> = {
  primary: "button_brown",
  secondary: "button_grey",
  tertiary: "panel_brown_damaged_dark",
  danger: "button_red",
};

export class Button extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.NineSlice;
  private labelText: Phaser.GameObjects.Text;
  private iconImage?: Phaser.GameObjects.Image;
  private config: ButtonConfig;
  private isPressed: boolean = false;
  private isDisabled: boolean = false;

  private boundOnPointerOver: () => void;
  private boundOnPointerOut: () => void;
  private boundOnPointerDown: () => void;
  private boundOnPointerUp: () => void;
  private boundOnPointerUpOutside: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, config: ButtonConfig) {
    super(scene, x, y);

    this.config = config;
    this.isDisabled = config.disabled ?? false;

    this.boundOnPointerOver = this.handlePointerOver.bind(this);
    this.boundOnPointerOut = this.handlePointerOut.bind(this);
    this.boundOnPointerDown = this.handlePointerDown.bind(this);
    this.boundOnPointerUp = this.handlePointerUp.bind(this);
    this.boundOnPointerUpOutside = this.handlePointerUpOutside.bind(this);

    const sizeKey = config.size ?? "primary";
    const size = T.button.sizes[sizeKey];
    const width = size.width;
    const height = size.height;

    this.background = scene.add.nineslice(
      0,
      0,
      "UI",
      VARIANT_ASSETS[config.variant],
      width,
      height,
      BUTTON_INSETS.left,
      BUTTON_INSETS.right,
      BUTTON_INSETS.top,
      BUTTON_INSETS.bottom
    );
    this.background.setOrigin(0.5);
    this.add(this.background);

    if (config.icon) {
      this.iconImage = scene.add.image(0, 0, "UI", config.icon);
      this.iconImage.setScale(1);
      this.add(this.iconImage);
    }

    if (config.size !== "icon") {
      this.labelText = scene.add.text(0, 0, config.label, {
        fontFamily: T.fonts.family,
        fontSize: `${T.fonts.sizes.button}px`,
        color: T.colors.neutral.white,
        stroke: T.colors.neutral.black,
        strokeThickness: UI_COMPONENTS_CONFIG.button.textStrokeThickness,
      });
      this.labelText.setOrigin(0.5);
      this.add(this.labelText);
    } else {
      this.labelText = scene.add.text(0, 0, "", {});
    }

    this.setSize(width, height);

    if (!this.isDisabled) {
      this.setupInteraction(width, height);
    } else {
      this.setAlpha(UI_COMPONENTS_CONFIG.button.disabledAlpha);
    }
  }

  private setupInteraction(width: number, height: number): void {
    const buffer = T.button.touchBuffer;
    const hitArea = new Phaser.Geom.Rectangle(
      -buffer,
      -buffer,
      width + buffer * 2,
      height + buffer * 2
    );

    this.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

    this.on("pointerover", this.boundOnPointerOver);
    this.on("pointerout", this.boundOnPointerOut);
    this.on("pointerdown", this.boundOnPointerDown);
    this.on("pointerup", this.boundOnPointerUp);
    this.on("pointerupoutside", this.boundOnPointerUpOutside);
  }

  private handlePointerOver(): void {
    if (!this.isPressed && !this.isDisabled) {
      this.scene.tweens.add({
        targets: this,
        ...TweenPresets.buttonHover,
      });
    }
  }

  private handlePointerOut(): void {
    if (!this.isDisabled) {
      this.scene.tweens.add({
        targets: this,
        ...TweenPresets.buttonReset,
      });
    }
  }

  private handlePointerDown(): void {
    if (this.isDisabled) return;
    this.isPressed = true;
    MobileManager.getInstance().vibrate("light");
    this.scene.tweens.add({
      targets: this,
      ...TweenPresets.buttonPress,
    });
  }

  private handlePointerUp(): void {
    if (this.isPressed && !this.isDisabled) {
      this.isPressed = false;
      this.scene.tweens.add({
        targets: this,
        ...TweenPresets.buttonRelease,
        onComplete: () => {
          this.config.onClick();
        },
      });
    }
  }

  private handlePointerUpOutside(): void {
    this.isPressed = false;
    this.scene.tweens.add({
      targets: this,
      ...TweenPresets.buttonReset,
    });
  }

  preDestroy(): void {
    this.off("pointerover", this.boundOnPointerOver);
    this.off("pointerout", this.boundOnPointerOut);
    this.off("pointerdown", this.boundOnPointerDown);
    this.off("pointerup", this.boundOnPointerUp);
    this.off("pointerupoutside", this.boundOnPointerUpOutside);
  }
}
