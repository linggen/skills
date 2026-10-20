import Phaser from "phaser";
import { LayoutManager } from "../ui/LayoutManager";
import { DesignTokens as T } from "../config/DesignTokens";
import { MobileManager } from "../systems/mobile";
import { OrientationOverlay } from "../ui/overlays";

export abstract class BaseScene extends Phaser.Scene {
  private orientationOverlay: OrientationOverlay | null = null;
  private orientationUnsubscribe: (() => void) | null = null;

  /**
   * Setup orientation overlay for mobile devices
   * Call this in create() for scenes that need orientation enforcement
   */
  protected setupOrientationOverlay(): void {
    const mobileManager = MobileManager.getInstance();

    if (!mobileManager.isMobile()) {
      return;
    }

    // Create overlay
    this.orientationOverlay = new OrientationOverlay(this);

    // Check initial orientation
    this.orientationOverlay.updateVisibility(!mobileManager.isLandscape());

    // Subscribe to orientation changes
    this.orientationUnsubscribe = mobileManager.onOrientationChange((orientation) => {
      this.orientationOverlay?.updateVisibility(orientation === "portrait");
    });
  }

  shutdown(): void {
    // Clean up orientation overlay
    if (this.orientationUnsubscribe) {
      this.orientationUnsubscribe();
      this.orientationUnsubscribe = null;
    }

    if (this.orientationOverlay) {
      this.orientationOverlay.destroy();
      this.orientationOverlay = null;
    }
  }

  protected playClick(): void {
    if (this.sound) {
      this.sound.playAudioSprite("sfx-master", "click");
    }
  }

  protected get centerX(): number {
    return LayoutManager.CENTER_X;
  }

  protected get centerY(): number {
    return LayoutManager.CENTER_Y;
  }

  protected get viewportWidth(): number {
    return LayoutManager.VIEWPORT_WIDTH;
  }

  protected get viewportHeight(): number {
    return LayoutManager.VIEWPORT_HEIGHT;
  }

  protected createTitleText(text: string, y?: number): Phaser.GameObjects.Text {
    const title = this.add.text(this.centerX, y ?? 100, text, {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.display}px`,
      color: T.colors.neutral.white,
      stroke: T.colors.neutral.black,
      strokeThickness: 6,
    });
    title.setOrigin(0.5);
    return title;
  }

  protected createSubtitleText(text: string, y: number): Phaser.GameObjects.Text {
    const subtitle = this.add.text(this.centerX, y, text, {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.subtitle}px`,
      color: T.colors.neutral.white,
      stroke: T.colors.neutral.black,
      strokeThickness: 4,
    });
    subtitle.setOrigin(0.5);
    return subtitle;
  }

  protected fadeIn(duration: number = T.duration.normal, callback?: () => void): void {
    this.cameras.main.fadeIn(duration, 0, 0, 0);
    if (callback) {
      this.time.delayedCall(duration, callback);
    }
  }

  protected fadeOut(duration: number = T.duration.normal, callback?: () => void): void {
    this.cameras.main.fadeOut(duration, 0, 0, 0);
    if (callback) {
      this.time.delayedCall(duration, callback);
    }
  }

  protected transitionToScene(
    sceneKey: string,
    data?: object,
    fadeDuration: number = T.duration.normal
  ): void {
    this.fadeOut(fadeDuration, () => {
      this.scene.start(sceneKey, data);
    });
  }

  protected animateElementAppear(
    element: Phaser.GameObjects.Container | Phaser.GameObjects.GameObject,
    delay: number = 0
  ): void {
    if ("setAlpha" in element && "setScale" in element) {
      (element as Phaser.GameObjects.Container).setAlpha(0);
      (element as Phaser.GameObjects.Container).setScale(0.8);

      this.tweens.add({
        targets: element,
        alpha: 1,
        scale: 1,
        duration: T.duration.normal,
        delay,
        ease: "Back.Out",
      });
    }
  }
}
