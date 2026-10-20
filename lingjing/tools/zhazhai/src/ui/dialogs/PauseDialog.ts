import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { LayoutManager } from "../LayoutManager";
import { Modal } from "../components/Modal";
import { Button } from "../components/Button";

export interface PauseDialogConfig {
  onResume: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onMenu: () => void;
}

export class PauseDialog extends Phaser.GameObjects.Container {
  private modal: Modal;
  private config: PauseDialogConfig;

  private readonly DIALOG_WIDTH = 350;
  private readonly DIALOG_HEIGHT = 444;

  constructor(scene: Phaser.Scene, config: PauseDialogConfig) {
    super(scene, LayoutManager.CENTER_X, LayoutManager.CENTER_Y);
    this.config = config;

    this.modal = new Modal(scene, {
      width: this.DIALOG_WIDTH,
      height: this.DIALOG_HEIGHT,
      panelVariant: "brown",
      showCloseButton: false,
      closeOnOverlay: false,
      onClose: () => this.destroy(),
    });
    this.add(this.modal);

    this.createTitle();
    this.createButtons();

    this.setDepth(T.depth.pauseMenu);
  }

  private createTitle(): void {
    const title = this.scene.add.text(0, -this.DIALOG_HEIGHT / 2 + T.spacing.md, "PAUSED", {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.subtitle}px`,
      color: T.colors.accent.gold,
      stroke: T.colors.neutral.black,
      strokeThickness: 4,
    });
    title.setOrigin(0.5, 0);
    this.add(title);
  }

  private createButtons(): void {
    const buttonStartY = -80;
    const buttonGap = 80;

    const resumeButton = new Button(this.scene, 0, buttonStartY, {
      label: "RESUME",
      variant: "tertiary",
      onClick: () => this.config.onResume(),
    });
    this.add(resumeButton);

    const restartButton = new Button(this.scene, 0, buttonStartY + buttonGap, {
      label: "RESTART",
      variant: "secondary",
      onClick: () => this.config.onRestart(),
    });
    this.add(restartButton);

    const settingsButton = new Button(this.scene, 0, buttonStartY + buttonGap * 2, {
      label: "SETTINGS",
      variant: "secondary",
      onClick: () => this.config.onSettings(),
    });
    this.add(settingsButton);

    const menuButton = new Button(this.scene, 0, buttonStartY + buttonGap * 3, {
      label: "MENU",
      variant: "danger",
      onClick: () => this.config.onMenu(),
    });
    this.add(menuButton);
  }

  close(): void {
    this.modal.close();
  }
}
