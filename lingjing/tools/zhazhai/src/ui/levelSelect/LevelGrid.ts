import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { UI_COMPONENTS_CONFIG } from "../../config/UIComponentsConfig";
import { LevelCard } from "./LevelCard";

export interface LevelData {
  level: number;
  unlocked: boolean;
  stars: number;
}

export interface LevelGridConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  columns: number;
  levels: LevelData[];
  onLevelSelected: (level: number) => void;
  onLockedTap?: (level: number) => void;
}

export class LevelGrid extends Phaser.GameObjects.Container {
  private cards: LevelCard[] = [];
  private config: LevelGridConfig;
  private scrollContainer: Phaser.GameObjects.Container;

  private contentHeight: number = 0;
  private isDragging: boolean = false;
  private lastPointerY: number = 0;
  private velocityY: number = 0;

  private readonly CARD_SPACING_Y = UI_COMPONENTS_CONFIG.levelGrid.cardSpacingY;
  private readonly PADDING_TOP = UI_COMPONENTS_CONFIG.levelGrid.paddingTop;
  private readonly CARD_WIDTH = UI_COMPONENTS_CONFIG.levelGrid.cardWidth;

  private cardSpacingX: number;

  constructor(scene: Phaser.Scene, config: LevelGridConfig) {
    super(scene, config.x, config.y);
    this.config = config;

    this.cardSpacingX =
      Math.floor(config.width / config.columns) *
      UI_COMPONENTS_CONFIG.levelGrid.cardSpacingXMultiplier;

    this.scrollContainer = this.scene.add.container(
      config.width * UI_COMPONENTS_CONFIG.levelGrid.scrollContainerXMultiplier,
      0
    );
    this.add(this.scrollContainer);

    this.createMask();
    this.createCards();
    this.setupScrollInteraction();

    scene.add.existing(this as Phaser.GameObjects.Container);
  }

  private createMask(): void {
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(0xffffff);
    graphics.fillRect(
      UI_COMPONENTS_CONFIG.levelGrid.maskX,
      UI_COMPONENTS_CONFIG.levelGrid.maskY,
      this.config.width,
      this.config.height
    );

    const mask = graphics.createGeometryMask();
    this.scrollContainer.setMask(mask);

    graphics.setVisible(false);
    this.add(graphics);
  }

  private createCards(): void {
    const { columns, levels, onLevelSelected, onLockedTap } = this.config;

    const paddingX = (this.cardSpacingX - this.CARD_WIDTH) / 2;

    levels.forEach((levelData, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);

      const x = paddingX + col * this.cardSpacingX + this.CARD_WIDTH / 2;
      const y =
        this.PADDING_TOP + row * this.CARD_SPACING_Y + UI_COMPONENTS_CONFIG.levelGrid.cardYOffset;

      const card = new LevelCard(this.scene, x, y, {
        level: levelData.level,
        unlocked: levelData.unlocked,
        stars: levelData.stars,
        onSelected: onLevelSelected,
        onLockedTap: onLockedTap,
      });

      this.cards.push(card);
      this.scrollContainer.add(card as Phaser.GameObjects.Container);
    });

    const rows = Math.ceil(levels.length / columns);
    this.contentHeight =
      this.PADDING_TOP * 2 +
      rows * this.CARD_SPACING_Y +
      UI_COMPONENTS_CONFIG.levelGrid.cardYOffset;
  }

  private setupScrollInteraction(): void {
    const hitArea = new Phaser.Geom.Rectangle(0, 0, this.config.width, this.config.height);

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

        const newY = this.scrollContainer.y + deltaY;
        this.constrainScroll(newY, false);
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
      const newY =
        this.scrollContainer.y - dy * UI_COMPONENTS_CONFIG.levelGrid.wheelScrollMultiplier;
      this.constrainScroll(newY, false);
    });
  }

  private applyMomentum(): void {
    if (Math.abs(this.velocityY) < UI_COMPONENTS_CONFIG.levelGrid.velocityThreshold) return;

    const maxScroll = Math.max(0, this.contentHeight - this.config.height);
    const targetY =
      this.scrollContainer.y + this.velocityY * UI_COMPONENTS_CONFIG.levelGrid.velocityMultiplier;
    const clampedY = Phaser.Math.Clamp(targetY, -maxScroll, 0);

    this.scene.tweens.add({
      targets: this.scrollContainer,
      y: clampedY,
      duration: UI_COMPONENTS_CONFIG.levelGrid.momentumDuration,
      ease: "Quad.Out",
    });
  }

  private constrainScroll(newY: number, animated: boolean = false): void {
    const maxScroll = Math.max(0, this.contentHeight - this.config.height);
    const clampedY = Phaser.Math.Clamp(newY, -maxScroll, 0);

    if (animated) {
      this.scene.tweens.add({
        targets: this.scrollContainer,
        y: clampedY,
        duration: T.duration.normal,
        ease: "Quad.Out",
      });
    } else {
      this.scrollContainer.y = clampedY;
    }
  }

  scrollToLevel(level: number): void {
    const index = this.cards.findIndex((card) => card.getLevel() === level);
    if (index === -1) return;

    const row = Math.floor(index / this.config.columns);
    const targetY = -(row * this.CARD_SPACING_Y) + this.config.height / 3;

    const maxScroll = Math.max(0, this.contentHeight - this.config.height);
    const clampedY = Phaser.Math.Clamp(targetY, -maxScroll, 0);

    this.scene.tweens.add({
      targets: this.scrollContainer,
      y: clampedY,
      duration: T.duration.slow,
      ease: "Quad.Out",
    });
  }

  updateLevel(level: number, unlocked: boolean, stars: number): void {
    const card = this.cards.find((c) => c.getLevel() === level);
    if (card) {
      card.setUnlocked(unlocked, stars);
    }
  }

  getCards(): LevelCard[] {
    return this.cards;
  }
}
