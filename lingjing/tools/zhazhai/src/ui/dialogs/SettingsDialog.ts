import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { SETTINGS_DIALOG_CONFIG } from "../../config/UIDialogsConfig";
import { LayoutManager } from "../LayoutManager";
import { Modal } from "../components/Modal";
import { VolumeSlider } from "../components/VolumeSlider";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { PerformanceManager, type PerformanceMode } from "../../systems/PerformanceManager";

export interface SettingsDialogConfig {
  musicVolume?: number;
  sfxVolume?: number;
  musicEnabled?: boolean;
  sfxEnabled?: boolean;
  performanceMode?: PerformanceMode;
  hitPauseEnabled?: boolean;
  slowMotionEnabled?: boolean;
  hapticEnabled?: boolean;
  screenFlashEnabled?: boolean;
  showOverlay?: boolean;
  onMusicVolumeChange?: (value: number) => void;
  onSfxVolumeChange?: (value: number) => void;
  onMusicToggle?: (enabled: boolean) => void;
  onSfxToggle?: (enabled: boolean) => void;
  onPerformanceModeChange?: (mode: PerformanceMode) => void;
  onHitPauseToggle?: (enabled: boolean) => void;
  onSlowMotionToggle?: (enabled: boolean) => void;
  onHapticToggle?: (enabled: boolean) => void;
  onScreenFlashToggle?: (enabled: boolean) => void;
  onClose?: () => void;
}

export class SettingsDialog extends Phaser.GameObjects.Container {
  private static readonly ARROW_SCALE = SETTINGS_DIALOG_CONFIG.arrowScale;
  private static readonly PERFORMANCE_CONTROL_GAP = SETTINGS_DIALOG_CONFIG.controlGap;

  private modal!: Modal;
  private musicSlider!: VolumeSlider;
  private sfxSlider!: VolumeSlider;
  private musicToggle!: ToggleSwitch;
  private sfxToggle!: ToggleSwitch;
  private hitPauseToggle!: ToggleSwitch;
  private slowMotionToggle!: ToggleSwitch;
  private hapticToggle!: ToggleSwitch;
  private screenFlashToggle!: ToggleSwitch;
  private performanceMode: PerformanceMode;
  private performanceValueText!: Phaser.GameObjects.Text;
  private performancePrevArrow!: Phaser.GameObjects.Image;
  private performanceNextArrow!: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, config: SettingsDialogConfig) {
    super(scene, LayoutManager.CENTER_X, LayoutManager.CENTER_Y);

    this.performanceMode = config.performanceMode ?? "auto";

    this.modal = new Modal(scene, {
      width: SETTINGS_DIALOG_CONFIG.width,
      height: SETTINGS_DIALOG_CONFIG.height,
      panelVariant: "brown",
      showCloseButton: true,
      showOverlay: config.showOverlay ?? true,
      closeOnOverlay: false,
      onClose: () => {
        if (config.onClose) config.onClose();
        this.destroy();
      },
    });
    this.add(this.modal);

    const title = scene.add.text(0, SETTINGS_DIALOG_CONFIG.titleY, "SETTINGS", {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.subtitle}px`,
      color: T.colors.accent.gold,
      stroke: T.colors.neutral.black,
      strokeThickness: 4,
    });
    title.setOrigin(0.5);
    this.add(title);

    this.createPerformanceSection(scene, config);
    this.createEffectsSection(scene, config);
    this.createMusicSection(scene, config);
    this.createSfxSection(scene, config);

    this.setDepth(T.depth.dialogs);
  }

  private createPerformanceSection(scene: Phaser.Scene, config: SettingsDialogConfig): void {
    const startY = SETTINGS_DIALOG_CONFIG.performanceStartY;
    const labelX = SETTINGS_DIALOG_CONFIG.performanceLabelX;
    const controlCenterX = SETTINGS_DIALOG_CONFIG.performanceControlCenterX;

    const performanceLabel = scene.add.text(labelX, startY, "Performance", {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.label}px`,
      color: T.colors.text.onCream,
    });
    performanceLabel.setOrigin(0, 0.5);
    this.add(performanceLabel);

    this.performanceValueText = scene.add.text(
      controlCenterX,
      startY,
      this.getPerformanceModeText(),
      {
        fontFamily: T.fonts.family,
        fontSize: `${T.fonts.sizes.button}px`,
        color: T.colors.text.onCream,
        stroke: T.colors.neutral.black,
        strokeThickness: 3,
      }
    );
    this.performanceValueText.setOrigin(0.5);
    this.add(this.performanceValueText);

    this.performancePrevArrow = this.createArrowControl(
      scene,
      controlCenterX - SettingsDialog.PERFORMANCE_CONTROL_GAP,
      startY,
      "previous",
      () => {
        this.setPerformanceMode(
          PerformanceManager.getPreviousPerformanceMode(this.performanceMode),
          config
        );
      }
    );
    this.add(this.performancePrevArrow);

    this.performanceNextArrow = this.createArrowControl(
      scene,
      controlCenterX + SettingsDialog.PERFORMANCE_CONTROL_GAP,
      startY,
      "next",
      () => {
        this.setPerformanceMode(
          PerformanceManager.getNextPerformanceMode(this.performanceMode),
          config
        );
      }
    );
    this.add(this.performanceNextArrow);

    const hintText = scene.add.text(
      0,
      startY + SETTINGS_DIALOG_CONFIG.performanceHintY,
      "Auto adapts quality from device and frame rate.",
      {
        fontFamily: T.fonts.family,
        fontSize: `${T.fonts.sizes.caption}px`,
        color: T.colors.text.onCream,
        align: "center",
        wordWrap: { width: SETTINGS_DIALOG_CONFIG.performanceHintWordWrap },
      }
    );
    hintText.setOrigin(0.5);
    this.add(hintText);
  }

  private createEffectsSection(scene: Phaser.Scene, config: SettingsDialogConfig): void {
    const startY = SETTINGS_DIALOG_CONFIG.effectsStartY;
    const labelX = SETTINGS_DIALOG_CONFIG.performanceLabelX;
    const toggleX = SETTINGS_DIALOG_CONFIG.performanceControlCenterX;
    const rowGap = SETTINGS_DIALOG_CONFIG.effectsRowGap;

    const hapticLabel = scene.add.text(labelX, startY, "Haptics", {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.label}px`,
      color: T.colors.text.onCream,
    });
    hapticLabel.setOrigin(0, 0.5);
    this.add(hapticLabel);

    this.hapticToggle = new ToggleSwitch(scene, toggleX, startY, {
      value: config.hapticEnabled ?? true,
      onChange: (enabled) => {
        if (config.onHapticToggle) {
          config.onHapticToggle(enabled);
        }
      },
    });
    this.add(this.hapticToggle);

    const hitPauseLabel = scene.add.text(labelX, startY + rowGap, "Hit Pause", {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.label}px`,
      color: T.colors.text.onCream,
    });
    hitPauseLabel.setOrigin(0, 0.5);
    this.add(hitPauseLabel);

    this.hitPauseToggle = new ToggleSwitch(scene, toggleX, startY + rowGap, {
      value: config.hitPauseEnabled ?? true,
      onChange: (enabled) => {
        if (config.onHitPauseToggle) {
          config.onHitPauseToggle(enabled);
        }
      },
    });
    this.add(this.hitPauseToggle);

    const slowMotionLabel = scene.add.text(labelX, startY + rowGap * 2, "Slow Motion", {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.label}px`,
      color: T.colors.text.onCream,
    });
    slowMotionLabel.setOrigin(0, 0.5);
    this.add(slowMotionLabel);

    this.slowMotionToggle = new ToggleSwitch(scene, toggleX, startY + rowGap * 2, {
      value: config.slowMotionEnabled ?? true,
      onChange: (enabled) => {
        if (config.onSlowMotionToggle) {
          config.onSlowMotionToggle(enabled);
        }
      },
    });
    this.add(this.slowMotionToggle);

    const screenFlashLabel = scene.add.text(labelX, startY + rowGap * 3, "Screen Flash", {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.label}px`,
      color: T.colors.text.onCream,
    });
    screenFlashLabel.setOrigin(0, 0.5);
    this.add(screenFlashLabel);

    this.screenFlashToggle = new ToggleSwitch(scene, toggleX, startY + rowGap * 3, {
      value: config.screenFlashEnabled ?? true,
      onChange: (enabled) => {
        if (config.onScreenFlashToggle) {
          config.onScreenFlashToggle(enabled);
        }
      },
    });
    this.add(this.screenFlashToggle);
  }

  private createMusicSection(scene: Phaser.Scene, config: SettingsDialogConfig): void {
    const startY = SETTINGS_DIALOG_CONFIG.musicStartY;
    const labelX = SETTINGS_DIALOG_CONFIG.performanceLabelX;
    const toggleX = SETTINGS_DIALOG_CONFIG.performanceControlCenterX;

    const musicLabel = scene.add.text(labelX, startY, "Music", {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.label}px`,
      color: T.colors.text.onCream,
    });
    musicLabel.setOrigin(0, 0.5);
    this.add(musicLabel);

    this.musicToggle = new ToggleSwitch(scene, toggleX, startY, {
      value: config.musicEnabled ?? true,
      onChange: (enabled) => {
        this.musicSlider.setVisible(enabled);
        if (config.onMusicToggle) {
          config.onMusicToggle(enabled);
        }
      },
    });
    this.add(this.musicToggle);

    this.musicSlider = new VolumeSlider(
      scene,
      SETTINGS_DIALOG_CONFIG.sliderX,
      startY + SETTINGS_DIALOG_CONFIG.sliderYOffset,
      {
        value: config.musicVolume ?? 100,
        color: "green",
        onChange: (value) => {
          if (config.onMusicVolumeChange) {
            config.onMusicVolumeChange(value);
          }
        },
      }
    );
    this.add(this.musicSlider);

    if (!config.musicEnabled) {
      this.musicSlider.setVisible(false);
    }
  }

  private createSfxSection(scene: Phaser.Scene, config: SettingsDialogConfig): void {
    const startY = SETTINGS_DIALOG_CONFIG.sfxStartY;
    const labelX = SETTINGS_DIALOG_CONFIG.performanceLabelX;
    const toggleX = SETTINGS_DIALOG_CONFIG.performanceControlCenterX;

    const sfxLabel = scene.add.text(labelX, startY, "Sound Effects", {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.label}px`,
      color: T.colors.text.onCream,
    });
    sfxLabel.setOrigin(0, 0.5);
    this.add(sfxLabel);

    this.sfxToggle = new ToggleSwitch(scene, toggleX, startY, {
      value: config.sfxEnabled ?? true,
      onChange: (enabled) => {
        this.sfxSlider.setVisible(enabled);
        if (config.onSfxToggle) {
          config.onSfxToggle(enabled);
        }
      },
    });
    this.add(this.sfxToggle);

    this.sfxSlider = new VolumeSlider(
      scene,
      SETTINGS_DIALOG_CONFIG.sliderX,
      startY + SETTINGS_DIALOG_CONFIG.sliderYOffset,
      {
        value: config.sfxVolume ?? 100,
        color: "green",
        onChange: (value) => {
          if (config.onSfxVolumeChange) {
            config.onSfxVolumeChange(value);
          }
        },
      }
    );
    this.add(this.sfxSlider);

    if (!config.sfxEnabled) {
      this.sfxSlider.setVisible(false);
    }
  }

  private getPerformanceModeText(): string {
    return PerformanceManager.getModeLabel(this.performanceMode).toUpperCase();
  }

  private createArrowControl(
    scene: Phaser.Scene,
    x: number,
    y: number,
    direction: "previous" | "next",
    onClick: () => void
  ): Phaser.GameObjects.Image {
    const arrow = scene.add.image(x, y, "UI", "icon_arrow");
    arrow.setScale(SettingsDialog.ARROW_SCALE);
    arrow.setOrigin(0.5);
    arrow.setFlipX(direction === "next");
    arrow.setTint(Phaser.Display.Color.HexStringToColor(T.colors.text.onCream).color);

    const hitAreaSize = 96;
    arrow.setInteractive(
      new Phaser.Geom.Rectangle(-hitAreaSize / 2, -hitAreaSize / 2, hitAreaSize, hitAreaSize),
      Phaser.Geom.Rectangle.Contains
    );

    arrow.on("pointerover", () => {
      scene.tweens.add({
        targets: arrow,
        scale: SettingsDialog.ARROW_SCALE * 1.1,
        duration: T.duration.normal,
        ease: T.easing.smooth,
      });
    });

    arrow.on("pointerout", () => {
      scene.tweens.add({
        targets: arrow,
        scale: SettingsDialog.ARROW_SCALE,
        duration: T.duration.normal,
        ease: T.easing.smooth,
      });
    });

    arrow.on("pointerdown", () => {
      scene.tweens.add({
        targets: arrow,
        scale: SettingsDialog.ARROW_SCALE * 0.92,
        duration: T.duration.fast,
        ease: T.easing.press,
      });
    });

    arrow.on("pointerup", () => {
      scene.tweens.add({
        targets: arrow,
        scale: SettingsDialog.ARROW_SCALE * 1.05,
        duration: T.duration.normal,
        ease: T.easing.bounce,
        onComplete: () => {
          onClick();
        },
      });
    });

    return arrow;
  }

  private setPerformanceMode(mode: PerformanceMode, config: SettingsDialogConfig): void {
    this.performanceMode = mode;
    this.performanceValueText.setText(this.getPerformanceModeText());
    config.onPerformanceModeChange?.(this.performanceMode);
  }

  close(): void {
    this.modal.close();
    this.destroy();
  }

  getMusicVolume(): number {
    return this.musicSlider.getValue();
  }

  getSfxVolume(): number {
    return this.sfxSlider.getValue();
  }

  getMusicState(): boolean {
    return this.musicToggle.getValue();
  }

  getSfxState(): boolean {
    return this.sfxToggle.getValue();
  }
}
