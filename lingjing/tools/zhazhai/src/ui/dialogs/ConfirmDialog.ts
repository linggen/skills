import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { CONFIRM_DIALOG_CONFIG } from "../../config/UIDialogsConfig";
import { LayoutManager } from "../LayoutManager";
import { Modal } from "../components/Modal";
import { Button } from "../components/Button";

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  width: number;
  height: number;
  panelVariant?: "brown" | "grey" | undefined;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  danger?: boolean;
}

export class ConfirmDialog extends Phaser.GameObjects.Container {
  private modal: Modal;

  constructor(scene: Phaser.Scene, config: ConfirmDialogConfig) {
    super(scene, LayoutManager.CENTER_X, LayoutManager.CENTER_Y);

    this.modal = new Modal(scene, {
      width: config.width,
      height: config.height,
      panelVariant: config.panelVariant ?? "brown",
      showCloseButton: false,
      closeOnOverlay: false,
      onClose: () => {
        this.destroy();
      },
    });

    this.add(this.modal);

    const titleText = scene.add.text(0, CONFIRM_DIALOG_CONFIG.titleY, config.title, {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.subtitle}px`,
      color: config.danger ? T.colors.accent.red : T.colors.neutral.white,
      stroke: T.colors.neutral.black,
      strokeThickness: CONFIRM_DIALOG_CONFIG.titleStrokeThickness,
    });
    titleText.setOrigin(0.5);
    this.add(titleText);

    const messageText = scene.add.text(0, CONFIRM_DIALOG_CONFIG.messageY, config.message, {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.label}px`,
      color: T.colors.neutral.white,
      stroke: T.colors.neutral.black,
      strokeThickness: CONFIRM_DIALOG_CONFIG.messageStrokeThickness,
      align: "center",
      wordWrap: { width: CONFIRM_DIALOG_CONFIG.wordWrapWidth },
    });
    messageText.setOrigin(0.5);
    this.add(messageText);

    const buttonGap = CONFIRM_DIALOG_CONFIG.buttonGap;
    const secondaryButtonWidth = T.button.sizes.secondary.width;
    const buttonOffsetX = secondaryButtonWidth / 2 + buttonGap / 2;

    const cancelButton = new Button(scene, -buttonOffsetX, CONFIRM_DIALOG_CONFIG.buttonY, {
      label: config.cancelLabel ?? "CANCEL",
      variant: "secondary",
      size: "secondary",
      onClick: () => {
        if (config.onCancel) config.onCancel();
        this.destroy();
      },
    });
    this.add(cancelButton);

    const confirmButton = new Button(scene, buttonOffsetX, CONFIRM_DIALOG_CONFIG.buttonY, {
      label: config.confirmLabel ?? "CONFIRM",
      variant: config.danger ? "danger" : "primary",
      size: "secondary",
      onClick: () => {
        config.onConfirm();
        this.destroy();
      },
    });
    this.add(confirmButton);

    this.setDepth(T.depth.dialogs);
    scene.add.existing(this);
  }

  close(): void {
    this.modal.close();
    this.destroy();
  }
}
