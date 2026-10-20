import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { LayoutManager } from "../LayoutManager";
import { Panel } from "./Panel";
import { Button } from "./Button";
import { UI_COMPONENTS_CONFIG } from "../../config/UIComponentsConfig";

export interface ModalConfig {
  width: number;
  height: number;
  panelVariant?: "brown" | "grey";
  showCloseButton?: boolean;
  showOverlay?: boolean;
  closeOnOverlay?: boolean;
  onClose?: () => void;
}

export class Modal extends Phaser.GameObjects.Container {
  private overlay?: Phaser.GameObjects.Rectangle;
  private panel: Panel;
  private closeButton?: Button;
  private onCloseCallback?: () => void;
  private isClosing: boolean = false;

  constructor(scene: Phaser.Scene, config: ModalConfig) {
    super(scene, 0, 0);

    this.onCloseCallback = config.onClose;

    const showOverlay = config.showOverlay !== false;

    if (showOverlay) {
      const overlayX = -LayoutManager.CENTER_X;
      const overlayY = -LayoutManager.CENTER_Y;

      this.overlay = new Phaser.GameObjects.Rectangle(
        scene,
        overlayX,
        overlayY,
        LayoutManager.VIEWPORT_WIDTH,
        LayoutManager.VIEWPORT_HEIGHT,
        UI_COMPONENTS_CONFIG.modal.overlayColor
      );
      this.overlay.setAlpha(UI_COMPONENTS_CONFIG.modal.overlayInitialAlpha);
      this.overlay.setOrigin(0, 0);
      this.overlay.setScrollFactor(0);

      const hitArea = new Phaser.Geom.Rectangle(
        0,
        0,
        LayoutManager.VIEWPORT_WIDTH,
        LayoutManager.VIEWPORT_HEIGHT
      );
      this.overlay.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

      if (config.closeOnOverlay) {
        this.overlay.on("pointerup", () => this.close());
      }

      scene.tweens.add({
        targets: this.overlay,
        alpha: UI_COMPONENTS_CONFIG.modal.overlayTargetAlpha,
        duration: T.duration.normal,
        ease: T.easing.snap,
      });

      this.add(this.overlay);
    }

    this.panel = new Panel(scene, 0, 0, {
      width: config.width,
      height: config.height,
      variant: config.panelVariant ?? "brown",
      animated: true,
    });
    this.add(this.panel);

    if (config.showCloseButton) {
      this.closeButton = new Button(
        scene,
        config.width / 2 - UI_COMPONENTS_CONFIG.modal.closeButtonOffsetX,
        -config.height / 2 + UI_COMPONENTS_CONFIG.modal.closeButtonOffsetY,
        {
          label: "",
          icon: "icon_cross",
          variant: "danger",
          size: "icon",
          onClick: () => this.close(),
        }
      );
      this.add(this.closeButton);
    }
  }

  close(): void {
    if (this.isClosing) return;
    this.isClosing = true;

    if (!this.scene || !this.scene.tweens) {
      this.destroy();
      return;
    }

    if (this.overlay) {
      this.scene.tweens.add({
        targets: this.overlay,
        alpha: 0,
        duration: T.duration.fast,
        ease: T.easing.snap,
      });
    }

    const targets: Phaser.GameObjects.GameObject[] = [this.panel];
    if (this.closeButton) {
      targets.push(this.closeButton);
    }

    this.scene.tweens.add({
      targets,
      alpha: 0,
      scale: UI_COMPONENTS_CONFIG.modal.closeAnimationScale,
      duration: T.duration.fast,
      ease: UI_COMPONENTS_CONFIG.modal.closeEase,
      onComplete: () => {
        if (this.onCloseCallback) {
          this.onCloseCallback();
        }
        this.destroy();
      },
    });
  }
}
