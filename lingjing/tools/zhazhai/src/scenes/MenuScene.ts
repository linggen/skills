import { BaseScene } from "./BaseScene";
import { DesignTokens as T } from "../config/DesignTokens";
import { Button } from "../ui/components/Button";
import { SettingsDialog } from "../ui/dialogs/SettingsDialog";
import { ConfirmDialog } from "../ui/dialogs/ConfirmDialog";
import { MenuDirector } from "../ui/menu/MenuDirector";
import type { IAudioSystem } from "../interfaces/audio";
import type { ITimeEffectsSettingsProvider } from "../interfaces/ITimeEffectsSettings";
import type { IMobileSettingsProvider } from "../interfaces/IMobileSettings";
import { ServiceTokens } from "../config/registries/ServiceContainer";
import { getServiceContainer } from "../config/bootstrap";
import { SCENE_KEYS } from "../config/UIConstants";
import type { TransitionScene } from "./TransitionScene";
import { PerformanceManager } from "../systems/PerformanceManager";
import { logger } from "../utils/Logger";
import { BUTTON_ENTRY_ANIMATION_CONFIG } from "../config/VFXConfig";

export class MenuScene extends BaseScene {
  private audioSystem!: IAudioSystem;
  private timeEffectsSettings!: ITimeEffectsSettingsProvider;
  private mobileSettings!: IMobileSettingsProvider;
  private menuDirector!: MenuDirector;
  private buttons: Button[] = [];
  private buttonContainer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: "MenuScene" });
  }

  create(): void {
    const container = getServiceContainer();
    this.audioSystem = container.resolve(ServiceTokens.AUDIO_SYSTEM);
    this.timeEffectsSettings = container.resolve(ServiceTokens.TIME_EFFECTS_SETTINGS);
    this.mobileSettings = container.resolve(ServiceTokens.MOBILE_SETTINGS);

    this.setupOrientationOverlay();
    this.createMenuDirector();
    this.createButtonContainer();

    this.input.once("pointerdown", () => {
      this.audioSystem.context.unlock();
    });

    this.menuDirector.start();
    this.playEntryAnimation();

    // Trigger transition reveal if arriving via shader transition
    const ts = this.scene.get(SCENE_KEYS.TRANSITION) as TransitionScene | null;
    if (ts?.scene?.isActive?.()) {
      ts.requestReveal();
    }
  }

  private createMenuDirector(): void {
    this.menuDirector = new MenuDirector({
      scene: this,
      audioSystem: this.audioSystem,
      onButtonsReady: () => {
        this.showButtons();
      },
    });
  }

  private createButtonContainer(): void {
    this.buttonContainer = this.add.container(0, 0);
    this.buttonContainer.setDepth(T.depth.hud);

    const buttonY = this.viewportHeight * 0.5;
    const spacing = 80;

    const playButton = new Button(this, this.centerX, buttonY, {
      label: "PLAY",
      variant: "primary",
      size: "primary",
      onClick: () => {
        this.audioSystem.ui.playClick();
        this.handleSceneTransition("LevelSelectScene");
      },
    });
    this.buttons.push(playButton);
    this.buttonContainer.add(playButton);

    const secondaryY = buttonY + spacing;
    const settingsButton = new Button(this, this.centerX, secondaryY, {
      label: "SETTINGS",
      variant: "secondary",
      size: "primary",
      onClick: () => {
        this.audioSystem.ui.playClick();
        this.openSettings();
      },
    });
    this.buttons.push(settingsButton);
    this.buttonContainer.add(settingsButton);

    const tertiaryY = buttonY + spacing * 2;
    const quitButton = new Button(this, this.centerX, tertiaryY, {
      label: "QUIT",
      variant: "danger",
      size: "primary",
      onClick: () => {
        this.audioSystem.ui.playClick();
        this.openQuitDialog();
      },
    });
    this.buttons.push(quitButton);
    this.buttonContainer.add(quitButton);

    this.buttons.forEach((button) => {
      button.setAlpha(0);
      button.setScale(0);
    });
  }

  private showButtons(): void {
    const baseDelay = 0;
    const config = BUTTON_ENTRY_ANIMATION_CONFIG;

    this.buttons.forEach((button, index) => {
      const delay = baseDelay + index * config.staggerDelayMs;
      const startY = button.y + config.startOffsetY;
      const finalY = button.y;
      const rotations = [...config.rotations] as [number, number, number];
      const startRotation = rotations[index] ?? 0.05;

      button.setY(startY);
      button.setRotation(startRotation);
      button.setScale(config.startScale);
      button.setAlpha(0);

      this.tweens.add({
        targets: button,
        y: finalY - config.phase1.overshootY!,
        scale: config.phase1.peakScale,
        alpha: 1,
        rotation: -startRotation * 0.5,
        duration: config.phase1.duration,
        delay: delay,
        ease: `Back.out(${config.phase1.easeOvershoot})`,
        onComplete: () => {
          this.tweens.add({
            targets: button,
            y: finalY + config.phase2.undershootY!,
            scale: config.phase2.undershootScale,
            rotation: startRotation * 0.3,
            duration: config.phase2.duration,
            ease: "Quad.out",
            onComplete: () => {
              this.tweens.add({
                targets: button,
                y: finalY - config.phase3.settleY!,
                scale: config.phase3.settleScale,
                rotation: -startRotation * 0.15,
                duration: config.phase3.duration,
                ease: "Back.out",
                onComplete: () => {
                  this.tweens.add({
                    targets: button,
                    y: finalY,
                    scale: 1,
                    rotation: 0,
                    duration: config.phase4.duration,
                    ease: `Elastic.out(${config.phase4.elasticAmplitude}, ${config.phase4.elasticPeriod})`,
                  });
                },
              });
            },
          });

          this.addButtonGlowPulse(button);
        },
      });
    });
  }

  private addButtonGlowPulse(button: Button): void {
    const glowConfig = BUTTON_ENTRY_ANIMATION_CONFIG.glowPulse;
    this.tweens.add({
      targets: button,
      scaleX: glowConfig.scaleX,
      scaleY: glowConfig.scaleY,
      duration: glowConfig.duration,
      delay: glowConfig.delay,
      yoyo: true,
      repeat: glowConfig.repeatCount,
      ease: "Sine.inOut",
    });
  }

  private playEntryAnimation(): void {
    this.cameras.main.fadeIn(T.duration.medium);
  }

  update(time: number, delta: number): void {
    if (this.menuDirector) {
      this.menuDirector.update(time, delta);
    }
  }

  private handleSceneTransition(sceneKey: string): void {
    this.menuDirector.transitionToScene(sceneKey);
  }

  private openSettings(): void {
    const currentSettings = this.audioSystem.settings.getSettings();
    const timeEffectsSettings = this.timeEffectsSettings.getSettings();
    const mobileSettings = this.mobileSettings.getSettings();

    const dialog = new SettingsDialog(this, {
      musicEnabled: currentSettings.musicEnabled,
      sfxEnabled: currentSettings.sfxEnabled,
      musicVolume: currentSettings.musicVolume * 100,
      sfxVolume: currentSettings.sfxVolume * 100,
      performanceMode: PerformanceManager.getPerformanceMode(),
      hitPauseEnabled: timeEffectsSettings.hitPauseEnabled,
      slowMotionEnabled: timeEffectsSettings.slowMotionEnabled,
      hapticEnabled: mobileSettings.hapticEnabled,
      screenFlashEnabled: timeEffectsSettings.screenFlashEnabled,
      onMusicToggle: (enabled: boolean) => {
        this.audioSystem.settings.setMusicEnabled(enabled);
      },
      onSfxToggle: (enabled: boolean) => {
        this.audioSystem.settings.setSfxEnabled(enabled);
      },
      onMusicVolumeChange: (value: number) => {
        this.audioSystem.settings.setMusicVolume(value / 100);
      },
      onSfxVolumeChange: (value: number) => {
        this.audioSystem.settings.setSfxVolume(value / 100);
      },
      onPerformanceModeChange: (mode) => {
        PerformanceManager.setPerformanceMode(mode);
      },
      onHitPauseToggle: (enabled: boolean) => {
        this.timeEffectsSettings.setHitPauseEnabled(enabled);
      },
      onSlowMotionToggle: (enabled: boolean) => {
        this.timeEffectsSettings.setSlowMotionEnabled(enabled);
      },
      onHapticToggle: (enabled: boolean) => {
        this.mobileSettings.setHapticEnabled(enabled);
      },
      onScreenFlashToggle: (enabled: boolean) => {
        this.timeEffectsSettings.setScreenFlashEnabled(enabled);
      },
    });

    this.add.existing(dialog);
  }

  private openQuitDialog(): void {
    const dialog = new ConfirmDialog(this, {
      title: "QUIT GAME",
      message: "Are you sure you want to quit?",
      confirmLabel: "QUIT",
      cancelLabel: "CANCEL",
      width: 575,
      height: 280,
      danger: true,
      onConfirm: () => {
        const win = window as { close?: () => void };
        if (win.close) {
          win.close();
        } else {
          logger.debug("Quit requested - window.close() not available");
        }
      },
    });

    this.add.existing(dialog);
  }

  shutdown(): void {
    if (this.menuDirector) {
      this.menuDirector.destroy();
    }

    this.buttons = [];
    super.shutdown();
  }
}

export default MenuScene;
