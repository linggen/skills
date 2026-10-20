import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { LayoutManager } from "../LayoutManager";

/**
 * Overlay that displays when device is in portrait mode
 * Prompts user to rotate to landscape
 */
export class OrientationOverlay extends Phaser.GameObjects.Container {
  private isVisible: boolean = false;

  constructor(scene: Phaser.Scene) {
    super(scene, LayoutManager.CENTER_X, LayoutManager.CENTER_Y);

    this.createOverlay();
    this.setDepth(T.depth.overlay);
    this.setVisible(false);

    scene.add.existing(this);
  }

  private createOverlay(): void {
    const { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } = LayoutManager;

    // Dark background
    const background = this.scene.add.graphics();
    background.fillStyle(0x000000, 0.9);
    background.fillRect(-VIEWPORT_WIDTH / 2, -VIEWPORT_HEIGHT / 2, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    this.add(background);

    // Rotation icon (using text as fallback - could be replaced with actual icon)
    const rotateIcon = this.scene.add.text(0, -60, "\u21BB", {
      fontFamily: "Arial",
      fontSize: "80px",
      color: T.colors.neutral.white,
    });
    rotateIcon.setOrigin(0.5);
    this.add(rotateIcon);

    // Animate rotation icon
    this.scene.tweens.add({
      targets: rotateIcon,
      angle: 90,
      duration: 1000,
      ease: "Quad.InOut",
      yoyo: true,
      repeat: -1,
    });

    // Main message
    const messageText = this.scene.add.text(0, 40, "Please rotate your device", {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.title}px`,
      color: T.colors.neutral.white,
      stroke: T.colors.neutral.black,
      strokeThickness: 4,
    });
    messageText.setOrigin(0.5);
    this.add(messageText);

    // Sub message
    const subMessageText = this.scene.add.text(
      0,
      90,
      "This game is best played in landscape mode",
      {
        fontFamily: T.fonts.family,
        fontSize: `${T.fonts.sizes.label}px`,
        color: T.colors.neutral.grey,
        stroke: T.colors.neutral.black,
        strokeThickness: 2,
      }
    );
    subMessageText.setOrigin(0.5);
    this.add(subMessageText);
  }

  show(): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.setVisible(true);
    this.setAlpha(0);

    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      duration: T.duration.normal,
      ease: "Quad.Out",
    });
  }

  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: T.duration.fast,
      ease: "Quad.In",
      onComplete: () => {
        this.setVisible(false);
      },
    });
  }

  updateVisibility(isPortrait: boolean): void {
    if (isPortrait) {
      this.show();
    } else {
      this.hide();
    }
  }

  getIsVisible(): boolean {
    return this.isVisible;
  }

  destroy(): void {
    // Check if scene and tweens still exist (scene may be destroyed)
    if (this.scene?.tweens) {
      this.scene.tweens.killTweensOf(this);
    }
    super.destroy();
  }
}
