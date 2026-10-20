import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { UI_COMPONENTS_CONFIG } from "../../config/UIComponentsConfig";
import { MobileManager } from "../../systems/mobile/MobileManager";

export type SliderColor = "green" | "blue" | "red";

export interface VolumeSliderConfig {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  color?: SliderColor;
  label?: string;
  disabled?: boolean;
}

const VARIANT_ASSETS: Record<SliderColor, { fill: string; border: string }> = {
  green: { fill: "progress_green", border: "progress_green_border" },
  blue: { fill: "progress_blue", border: "progress_blue_border" },
  red: { fill: "progress_red", border: "progress_red_border" },
};

export class VolumeSlider extends Phaser.GameObjects.Container {
  private track!: Phaser.GameObjects.NineSlice;
  private fill!: Phaser.GameObjects.NineSlice;
  private handle!: Phaser.GameObjects.Image;
  private label?: Phaser.GameObjects.Text;
  private valueText!: Phaser.GameObjects.Text;
  private config: Required<Omit<VolumeSliderConfig, "label" | "disabled">> & {
    label?: string;
    disabled?: boolean;
  };
  private currentValue: number;
  private isDragging: boolean = false;

  private readonly SLIDER_WIDTH = UI_COMPONENTS_CONFIG.slider.width;
  private readonly SLIDER_HEIGHT = UI_COMPONENTS_CONFIG.slider.height;
  private readonly HANDLE_SIZE = UI_COMPONENTS_CONFIG.slider.handleSize;
  private readonly TRACK_PADDING = UI_COMPONENTS_CONFIG.slider.trackPadding;

  constructor(scene: Phaser.Scene, x: number, y: number, config: VolumeSliderConfig) {
    super(scene, x, y);

    this.config = {
      ...config,
      min: config.min ?? 0,
      max: config.max ?? 100,
      color: config.color ?? "green",
    };
    this.currentValue = config.value;

    this.createLabel();
    this.createTrack();
    this.createFill();
    this.createHandle();
    this.createValueText();
    this.setupInteraction();

    if (config.disabled) {
      this.setDisabled(true);
    }

    this.updateVisuals();

    scene.add.existing(this);
  }

  private createLabel(): void {
    if (this.config.label) {
      this.label = this.scene.add.text(0, -T.spacing.lg, this.config.label, {
        fontFamily: T.fonts.family,
        fontSize: `${T.fonts.sizes.label}px`,
        color: T.colors.text.onCream,
      });
      this.label.setOrigin(0, 0.5);
      this.add(this.label);
    }
  }

  private createTrack(): void {
    const assets = VARIANT_ASSETS[this.config.color];

    this.track = this.scene.add.nineslice(
      0,
      0,
      "UI",
      assets.border,
      this.SLIDER_WIDTH,
      this.SLIDER_HEIGHT,
      UI_COMPONENTS_CONFIG.slider.insets,
      UI_COMPONENTS_CONFIG.slider.insets,
      UI_COMPONENTS_CONFIG.slider.insets,
      UI_COMPONENTS_CONFIG.slider.insets
    );
    this.track.setOrigin(0.5);
    this.track.setTint(UI_COMPONENTS_CONFIG.slider.trackTint);
    this.add(this.track);
  }

  private createFill(): void {
    const assets = VARIANT_ASSETS[this.config.color];
    const fillWidth = this.calculateFillWidth();

    this.fill = this.scene.add.nineslice(
      -this.SLIDER_WIDTH / 2 + fillWidth / 2,
      0,
      "UI",
      assets.fill,
      fillWidth,
      this.SLIDER_HEIGHT - 8,
      8,
      8,
      8,
      8
    );
    this.fill.setOrigin(0.5);
    this.add(this.fill);
  }

  private createHandle(): void {
    const handleX = this.calculateHandleX();

    this.handle = this.scene.add.image(handleX, 0, "UI", "round_brown");
    this.handle.setScale(this.HANDLE_SIZE / 64);
    this.handle.setOrigin(0.5);
    this.add(this.handle);
  }

  private createValueText(): void {
    this.valueText = this.scene.add.text(
      this.SLIDER_WIDTH / 2 + T.spacing.md,
      0,
      `${Math.round(this.currentValue)}%`,
      {
        fontFamily: T.fonts.family,
        fontSize: `${T.fonts.sizes.label}px`,
        color: T.colors.text.onCream,
      }
    );
    this.valueText.setOrigin(0, 0.5);
    this.add(this.valueText);
  }

  private setupInteraction(): void {
    this.handle.setInteractive({ draggable: true, useHandCursor: true });

    const handleHitSize = this.HANDLE_SIZE * 2;
    this.handle.input!.hitArea = new Phaser.Geom.Rectangle(0, 0, handleHitSize, handleHitSize);
    this.handle.input!.hitAreaCallback = Phaser.Geom.Rectangle.Contains;

    const trackHitArea = new Phaser.Geom.Rectangle(0, 0, this.SLIDER_WIDTH, this.SLIDER_HEIGHT * 2);
    this.track.setInteractive(trackHitArea, Phaser.Geom.Rectangle.Contains);

    this.handle.on("drag", (_pointer: Phaser.Input.Pointer, dragX: number, _dragY: number) => {
      this.isDragging = true;
      this.updateValueFromPosition(dragX);
    });

    this.handle.on("dragend", () => {
      this.isDragging = false;
    });

    this.track.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const worldPoint = this.getWorldTransformMatrix();
      const localX = pointer.x - worldPoint.tx;
      MobileManager.getInstance().vibrate("light");
      this.updateValueFromPosition(localX);
    });

    this.handle.on("pointerover", () => {
      if (!this.isDisabled()) {
        this.scene.tweens.add({
          targets: this.handle,
          scale: (this.HANDLE_SIZE / 64) * 1.2,
          duration: T.duration.normal,
          ease: T.easing.smooth,
        });
      }
    });

    this.handle.on("pointerout", () => {
      if (!this.isDragging) {
        this.scene.tweens.add({
          targets: this.handle,
          scale: this.HANDLE_SIZE / 64,
          duration: T.duration.normal,
          ease: T.easing.smooth,
        });
      }
    });
  }

  private updateValueFromPosition(x: number): void {
    const trackLeft = -this.SLIDER_WIDTH / 2 + this.TRACK_PADDING;
    const trackRight = this.SLIDER_WIDTH / 2 - this.TRACK_PADDING;
    const trackWidth = trackRight - trackLeft;

    const clampedX = Phaser.Math.Clamp(x, trackLeft, trackRight);

    const percentage = (clampedX - trackLeft) / trackWidth;
    const value = this.config.min + percentage * (this.config.max - this.config.min);

    this.setValue(value);
  }

  private calculateHandleX(): number {
    const trackLeft = -this.SLIDER_WIDTH / 2 + this.TRACK_PADDING;
    const trackRight = this.SLIDER_WIDTH / 2 - this.TRACK_PADDING;
    const trackWidth = trackRight - trackLeft;

    const percentage = (this.currentValue - this.config.min) / (this.config.max - this.config.min);
    return trackLeft + percentage * trackWidth;
  }

  private calculateFillWidth(): number {
    const maxFillWidth = this.SLIDER_WIDTH - this.TRACK_PADDING * 2;
    const percentage = (this.currentValue - this.config.min) / (this.config.max - this.config.min);
    return Math.max(percentage * maxFillWidth, UI_COMPONENTS_CONFIG.slider.insets);
  }

  private updateVisuals(): void {
    const handleX = this.calculateHandleX();
    const fillWidth = this.calculateFillWidth();

    this.handle.x = handleX;

    this.fill.width = fillWidth;
    this.fill.x = -this.SLIDER_WIDTH / 2 + fillWidth / 2;

    this.valueText.setText(`${Math.round(this.currentValue)}%`);
  }

  setValue(value: number): void {
    const clampedValue = Phaser.Math.Clamp(value, this.config.min, this.config.max);

    if (this.currentValue !== clampedValue) {
      this.currentValue = clampedValue;
      this.updateVisuals();
      this.config.onChange(this.currentValue);
    }
  }

  getValue(): number {
    return this.currentValue;
  }

  private isDisabled(): boolean {
    return this.config.disabled ?? false;
  }

  setDisabled(disabled: boolean): void {
    this.config.disabled = disabled;
    this.setAlpha(disabled ? UI_COMPONENTS_CONFIG.slider.disabledAlpha : 1);
    if (disabled) {
      this.handle.disableInteractive();
      this.track.disableInteractive();
    } else {
      this.setupInteraction();
    }
  }
}
