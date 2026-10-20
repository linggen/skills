import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { LayoutManager } from "../LayoutManager";
import { Modal } from "../components/Modal";
import { MobileManager } from "../../systems/mobile";

export interface HelpDialogConfig {
  levelName: string;
  levelNumber: number;
  description: string;
  teachingFocus: string;
}

export class HelpDialog extends Phaser.GameObjects.Container {
  private modal: Modal;
  private config: HelpDialogConfig;

  private readonly DIALOG_WIDTH = 700;
  private readonly DIALOG_HEIGHT = 750;
  private readonly CONTENT_WIDTH = this.DIALOG_WIDTH - T.spacing.xl * 2;

  constructor(scene: Phaser.Scene, config: HelpDialogConfig) {
    super(scene, LayoutManager.CENTER_X, LayoutManager.CENTER_Y);
    this.config = config;

    this.modal = new Modal(scene, {
      width: this.DIALOG_WIDTH,
      height: this.DIALOG_HEIGHT,
      panelVariant: "brown",
      showCloseButton: true,
      closeOnOverlay: true,
      onClose: () => this.destroy(),
    });
    this.add(this.modal);

    this.createContent();

    this.setDepth(T.depth.dialogs);
  }

  private createContent(): void {
    let y = -this.DIALOG_HEIGHT / 2 + T.spacing.md;

    y = this.addSectionHeader("INFO", y, T.colors.accent.gold);
    y = this.addLevelInfo(y + T.spacing.xxl);
    y = this.addSectionHeader("HOW TO PLAY", y + T.spacing.xxl, T.colors.accent.gold);
    y = this.addMechanics(y + T.spacing.md);
    y = this.addSectionHeader("CONTROLS", y + T.spacing.xxl, T.colors.accent.gold);
    this.addControls(y + T.spacing.md);
  }

  private addSectionHeader(text: string, y: number, color: string = T.colors.text.onCream): number {
    const header = this.scene.add.text(0, y, text, {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.subtitle}px`,
      color: color,
      stroke: T.colors.neutral.black,
      strokeThickness: 4,
    });

    header.setOrigin(0.5, 0);
    this.add(header);

    return y + header.height + T.spacing.sm;
  }

  private addLevelInfo(y: number): number {
    const levelLabel = this.scene.add.text(0, y, this.config.levelName, {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.label}px`,
      color: T.colors.neutral.grey,
    });
    levelLabel.setOrigin(0.5, 0);
    this.add(levelLabel);
    y += levelLabel.height + T.spacing.sm;

    const descStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.caption + 2}px`,
      color: T.colors.text.onCream,
      wordWrap: { width: this.CONTENT_WIDTH },
      align: "center",
    };

    if (this.config.description) {
      const description = this.scene.add.text(0, y, this.config.description, descStyle);
      description.setOrigin(0.5, 0);
      this.add(description);
      y += description.height + T.spacing.xl;
    }

    if (this.config.teachingFocus) {
      const focusLabel = this.scene.add.text(0, y, "Focus:", {
        fontFamily: T.fonts.family,
        fontSize: `${T.fonts.sizes.caption + 2}px`,
        color: T.colors.accent.blue,
      });
      focusLabel.setOrigin(0.5, 0);
      this.add(focusLabel);
      y += focusLabel.height + T.spacing.xs;

      const teachingFocus = this.scene.add.text(0, y, this.config.teachingFocus, {
        ...descStyle,
        color: T.colors.accent.green,
      });
      teachingFocus.setOrigin(0.5, 0);
      this.add(teachingFocus);
      y += teachingFocus.height + T.spacing.sm;
    }

    return y;
  }

  private addMechanics(y: number): number {
    const lines = [
      "Drag slingshot to aim, release to launch",
      "Destroy all Greenelings to win",
      "Fewer Aliens = higher score",
    ];

    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.caption + 2}px`,
      color: T.colors.text.onCream,
      wordWrap: { width: this.CONTENT_WIDTH },
      align: "center",
    };

    lines.forEach((line) => {
      const text = this.scene.add.text(0, y, line, style);
      text.setOrigin(0.5, 0);
      this.add(text);
      y += text.height + 2;
    });

    return y + T.spacing.xs;
  }

  private addControls(y: number): void {
    const mobileManager = MobileManager.getInstance();
    const isMobile = mobileManager.isMobile() || mobileManager.isTouchDevice();

    const lines = isMobile
      ? [
          "Touch & drag slingshot to aim",
          "Tap mid-air for ability",
          "Pinch to zoom, one-finger drag to pan",
        ]
      : [
          "Click & drag slingshot to aim",
          "Click mid-air for ability",
          "Scroll to zoom, drag anywhere to pan",
        ];

    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.caption + 2}px`,
      color: T.colors.text.onCream,
      wordWrap: { width: this.CONTENT_WIDTH },
      align: "center",
    };

    lines.forEach((line) => {
      const text = this.scene.add.text(0, y, line, style);
      text.setOrigin(0.5, 0);
      this.add(text);
      y += text.height + 2;
    });
  }

  close(): void {
    this.modal.close();
  }
}
