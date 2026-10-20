import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { UI_COMPONENTS_CONFIG } from "../../config/UIComponentsConfig";
import { MobileManager } from "../../systems/mobile/MobileManager";

export interface ToggleSwitchConfig {
  value: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export class ToggleSwitch extends Phaser.GameObjects.Container {
  private track!: Phaser.GameObjects.NineSlice;
  private thumb!: Phaser.GameObjects.Image;
  private label?: Phaser.GameObjects.Text;
  private config: ToggleSwitchConfig;
  private currentValue: boolean;

  private readonly TRACK_WIDTH = UI_COMPONENTS_CONFIG.toggle.trackWidth;
  private readonly TRACK_HEIGHT = UI_COMPONENTS_CONFIG.toggle.trackHeight;
  private readonly THUMB_SIZE = UI_COMPONENTS_CONFIG.toggle.thumbSize;

  private readonly OFF_X = UI_COMPONENTS_CONFIG.toggle.offPosition;
  private readonly ON_X = UI_COMPONENTS_CONFIG.toggle.onPosition;

  constructor(scene: Phaser.Scene, x: number, y: number, config: ToggleSwitchConfig) {
    super(scene, x, y);

    this.config = config;
    this.currentValue = config.value;

    this.createTrack();
    this.createThumb();
    this.createLabel();
    this.setupInteraction();

    if (config.disabled) {
      this.setDisabled(true);
    }

    scene.add.existing(this);
  }

  private createTrack(): void {
    this.track = this.scene.add.nineslice(
      0,
      0,
      "UI",
      "progress_green",
      this.TRACK_WIDTH,
      this.TRACK_HEIGHT,
      UI_COMPONENTS_CONFIG.toggle.insets,
      UI_COMPONENTS_CONFIG.toggle.insets,
      UI_COMPONENTS_CONFIG.toggle.insets * 2,
      UI_COMPONENTS_CONFIG.toggle.insets * 2
    );
    this.track.setOrigin(0.5);

    if (!this.currentValue) {
      this.track.setTint(UI_COMPONENTS_CONFIG.toggle.disabledTint);
    }

    this.add(this.track);
  }

  private createThumb(): void {
    const thumbX = this.currentValue ? this.ON_X : this.OFF_X;

    this.thumb = this.scene.add.image(thumbX, 0, "UI", "round_brown");
    this.thumb.setScale(this.THUMB_SIZE / 64);
    this.thumb.setOrigin(0.5);
    this.add(this.thumb);
  }

  private createLabel(): void {
    if (this.config.label) {
      this.label = this.scene.add.text(-this.TRACK_WIDTH / 2 - T.spacing.md, 0, this.config.label, {
        fontFamily: T.fonts.family,
        fontSize: `${T.fonts.sizes.label}px`,
        color: T.colors.text.onCream,
      });
      this.label.setOrigin(1, 0.5);
      this.add(this.label);
    }
  }

  private setupInteraction(): void {
    const buffer = T.button.touchBuffer;
    const hitArea = new Phaser.Geom.Rectangle(
      -this.TRACK_WIDTH / 2 - buffer,
      -this.TRACK_HEIGHT / 2 - buffer,
      this.TRACK_WIDTH + buffer * 2,
      this.TRACK_HEIGHT + buffer * 2
    );

    this.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
    if (this.input) {
      this.input.cursor = "pointer";
    }

    this.on("pointerdown", () => {
      if (!this.isDisabled()) {
        this.toggle();
      }
    });

    this.on("pointerover", () => {
      if (!this.isDisabled()) {
        this.scene.tweens.add({
          targets: this.thumb,
          scale: (this.THUMB_SIZE / 64) * 1.1,
          duration: T.duration.normal,
          ease: T.easing.smooth,
        });
      }
    });

    this.on("pointerout", () => {
      this.scene.tweens.add({
        targets: this.thumb,
        scale: this.THUMB_SIZE / 64,
        duration: T.duration.normal,
        ease: T.easing.smooth,
      });
    });
  }

  private toggle(): void {
    this.currentValue = !this.currentValue;
    MobileManager.getInstance().vibrate("medium");
    this.animateToggle();
    this.config.onChange(this.currentValue);
  }

  private animateToggle(): void {
    const targetX = this.currentValue ? this.ON_X : this.OFF_X;

    this.scene.tweens.add({
      targets: this.thumb,
      x: targetX,
      duration: T.duration.normal,
      ease: T.easing.smooth,
    });

    if (this.currentValue) {
      this.scene.tweens.add({
        targets: this.track,
        tint: 0xffffff,
        duration: T.duration.normal,
      });
    } else {
      this.scene.tweens.add({
        targets: this.track,
        tint: UI_COMPONENTS_CONFIG.toggle.disabledTint,
        duration: T.duration.normal,
      });
    }
  }

  getValue(): boolean {
    return this.currentValue;
  }

  private isDisabled(): boolean {
    return this.config.disabled ?? false;
  }

  setDisabled(disabled: boolean): void {
    this.config.disabled = disabled;
    this.setAlpha(disabled ? 0.5 : 1);
    if (disabled) {
      this.disableInteractive();
    } else {
      this.setupInteraction();
    }
  }
}
