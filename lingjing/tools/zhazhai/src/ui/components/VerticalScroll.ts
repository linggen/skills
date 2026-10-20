import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";

export interface VerticalScrollConfig {
  width: number;
  height: number;
  x?: number;
  y?: number;
  padding?: number;
  wheelScrollMultiplier?: number;
  velocityThreshold?: number;
  velocityMultiplier?: number;
  momentumDuration?: number;
}

export class VerticalScroll extends Phaser.GameObjects.Container {
  private contentContainer: Phaser.GameObjects.Container;
  private config: VerticalScrollConfig;
  private contentHeight: number = 0;
  private isDragging: boolean = false;
  private lastPointerY: number = 0;
  private velocityY: number = 0;
  private initialContainerY: number;

  private readonly PADDING: number;
  private readonly WHEEL_MULTIPLIER: number;
  private readonly VELOCITY_THRESHOLD: number;
  private readonly VELOCITY_MULTIPLIER: number;
  private readonly MOMENTUM_DURATION: number;

  constructor(scene: Phaser.Scene, config: VerticalScrollConfig) {
    super(scene, config.x ?? 0, config.y ?? 0);
    this.config = config;

    this.PADDING = config.padding ?? T.spacing.md;
    this.WHEEL_MULTIPLIER = config.wheelScrollMultiplier ?? 0.5;
    this.VELOCITY_THRESHOLD = config.velocityThreshold ?? 2;
    this.VELOCITY_MULTIPLIER = config.velocityMultiplier ?? 8;
    this.MOMENTUM_DURATION = config.momentumDuration ?? 200;

    this.initialContainerY = 0;
    this.contentContainer = scene.add.container(0, 0);
    this.add(this.contentContainer);

    this.createMask();
    this.setupScrollInteraction();

    scene.add.existing(this);
  }

  private createMask(): void {
    const maskGraphics = this.scene.add.graphics();
    maskGraphics.fillStyle(0xffffff);
    maskGraphics.fillRect(
      -this.config.width / 2,
      -this.config.height / 2,
      this.config.width,
      this.config.height
    );
    this.add(maskGraphics);

    const mask = maskGraphics.createGeometryMask();
    this.contentContainer.setMask(mask);
    maskGraphics.setVisible(false);
  }

  private setupScrollInteraction(): void {
    const hitArea = new Phaser.Geom.Rectangle(
      -this.config.width / 2,
      -this.config.height / 2,
      this.config.width,
      this.config.height
    );

    this.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

    this.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.isDragging = true;
      this.lastPointerY = pointer.y;
      this.velocityY = 0;
    });

    this.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.isDragging) {
        const deltaY = pointer.y - this.lastPointerY;
        this.velocityY = deltaY;
        this.lastPointerY = pointer.y;
        this.constrainScroll(this.contentContainer.y + deltaY, false);
      }
    });

    this.on("pointerup", () => {
      if (this.isDragging) {
        this.applyMomentum();
      }
      this.isDragging = false;
    });

    this.on("pointerout", () => {
      if (this.isDragging) {
        this.applyMomentum();
      }
      this.isDragging = false;
    });

    this.on("wheel", (_pointer: Phaser.Input.Pointer, _dx: number, dy: number) => {
      const newY = this.contentContainer.y - dy * this.WHEEL_MULTIPLIER;
      this.constrainScroll(newY, false);
    });
  }

  private applyMomentum(): void {
    if (Math.abs(this.velocityY) < this.VELOCITY_THRESHOLD) return;

    const maxScroll = Math.max(0, this.contentHeight - this.config.height + this.PADDING);
    const targetY = this.contentContainer.y + this.velocityY * this.VELOCITY_MULTIPLIER;
    const minScroll = this.initialContainerY - maxScroll;
    const clampedY = Phaser.Math.Clamp(targetY, minScroll, this.initialContainerY);

    this.scene.tweens.add({
      targets: this.contentContainer,
      y: clampedY,
      duration: this.MOMENTUM_DURATION,
      ease: "Quad.Out",
    });
  }

  private constrainScroll(newY: number, animated: boolean = false): void {
    const maxScroll = Math.max(0, this.contentHeight - this.config.height + this.PADDING);
    const minScroll = this.initialContainerY - maxScroll;
    const clampedY = Phaser.Math.Clamp(newY, minScroll, this.initialContainerY);

    if (animated) {
      this.scene.tweens.add({
        targets: this.contentContainer,
        y: clampedY,
        duration: T.duration.normal,
        ease: "Quad.Out",
      });
    } else {
      this.contentContainer.y = clampedY;
    }
  }

  addContent(child: Phaser.GameObjects.GameObject): this {
    this.contentContainer.add(child);
    this.updateContentHeight();
    return this;
  }

  addTextContent(
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    yOffset: number
  ): Phaser.GameObjects.Text {
    const textObj = this.scene.add.text(0, yOffset, text, style);
    textObj.setOrigin(0.5, 0);
    textObj.setWordWrapWidth(this.config.width - this.PADDING * 2);
    this.contentContainer.add(textObj);
    this.updateContentHeight();
    return textObj;
  }

  private updateContentHeight(): void {
    const startY = this.getContentStartY();
    let maxY = startY;
    this.contentContainer.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Text) {
        const bottom = child.y + child.height;
        if (bottom > maxY) maxY = bottom;
      } else if (child instanceof Phaser.GameObjects.Container) {
        const bounds = child.getBounds();
        const bottom = bounds.y - this.y + bounds.height;
        if (bottom > maxY) maxY = bottom;
      }
    });
    this.contentHeight = maxY - startY + this.PADDING;
  }

  setContentHeight(bottomY: number): void {
    this.contentHeight = bottomY - this.getContentStartY();
  }

  getContentContainer(): Phaser.GameObjects.Container {
    return this.contentContainer;
  }

  scrollToTop(animated: boolean = false): void {
    this.constrainScroll(this.initialContainerY, animated);
  }

  scrollToBottom(animated: boolean = false): void {
    const maxScroll = Math.max(0, this.contentHeight - this.config.height + this.PADDING);
    this.constrainScroll(this.initialContainerY - maxScroll, animated);
  }

  reset(): void {
    this.contentContainer.removeAll(true);
    this.contentContainer.y = this.initialContainerY;
    this.contentHeight = 0;
    this.velocityY = 0;
    this.isDragging = false;
  }

  getHeight(): number {
    return this.config.height;
  }

  getWidth(): number {
    return this.config.width;
  }

  getContentStartY(): number {
    return -this.config.height / 2 + this.PADDING;
  }
}
