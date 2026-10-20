import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { UI_COMPONENTS_CONFIG } from "../../config/UIComponentsConfig";
import { MobileManager } from "../../systems/mobile/MobileManager";

export interface LevelCardConfig {
  level: number;
  unlocked: boolean;
  stars: number;
  onSelected: (level: number) => void;
  onLockedTap?: (level: number) => void;
}

export class LevelCard extends Phaser.GameObjects.Container {
  private hexagon!: Phaser.GameObjects.Image;
  private levelText!: Phaser.GameObjects.Text;
  private starContainer: Phaser.GameObjects.Container;
  private lockIcon?: Phaser.GameObjects.Image;
  private config: LevelCardConfig;

  private readonly STAR_SCALE = UI_COMPONENTS_CONFIG.levelCard.starScale;
  private readonly LOCK_SCALE = UI_COMPONENTS_CONFIG.levelCard.lockScale;

  private boundOnPointerOver: () => void;
  private boundOnPointerOut: () => void;
  private boundOnPointerDownUnlocked: () => void;
  private boundOnPointerDownLocked: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, config: LevelCardConfig) {
    super(scene, x, y);
    this.config = config;

    this.boundOnPointerOver = this.handlePointerOver.bind(this);
    this.boundOnPointerOut = this.handlePointerOut.bind(this);
    this.boundOnPointerDownUnlocked = () => {
      MobileManager.getInstance().vibrate("medium");
      this.config.onSelected(this.config.level);
    };
    this.boundOnPointerDownLocked = this.handleLockedTap.bind(this);

    this.starContainer = this.scene.add.container(0, 45);

    this.createHexagon();
    this.createLevelText();

    if (config.unlocked) {
      this.createStars();
      this.setupUnlockInteraction();
    } else {
      this.createLockIcon();
      this.setupLockedInteraction();
    }

    scene.add.existing(this as Phaser.GameObjects.Container);
  }

  private createHexagon(): void {
    const textureKey = this.config.unlocked ? "hexagon_brown" : "hexagon_brown_dark";

    this.hexagon = this.scene.add.image(0, 0, "UI", textureKey);
    this.hexagon.setScale(
      UI_COMPONENTS_CONFIG.levelCard.hexagonScaleX,
      UI_COMPONENTS_CONFIG.levelCard.hexagonScaleY
    );

    if (!this.config.unlocked) {
      this.hexagon.setAlpha(UI_COMPONENTS_CONFIG.levelCard.lockedAlpha);
    }

    this.add(this.hexagon);
  }

  private createLevelText(): void {
    const color = this.config.unlocked ? T.colors.neutral.white : T.colors.neutral.disabled;

    this.levelText = this.scene.add.text(0, 0, `${this.config.level}`, {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.subtitle}px`,
      color: color,
      stroke: T.colors.neutral.black,
      strokeThickness: 3,
    });
    this.levelText.setOrigin(0.5);
    this.add(this.levelText);
  }

  private createStars(): void {
    if (this.config.stars >= 0) {
      const spacing = 30;

      const totalWidth = 2 * spacing;
      const startX = -totalWidth / 2;

      for (let i = 0; i < 3; i++) {
        const starX = startX + i * spacing;
        const textureKey = i < this.config.stars ? "starGold" : "starBronze";
        const star = this.scene.add.image(starX, 0, "level", textureKey);
        star.setScale(this.STAR_SCALE);
        star.setOrigin(0.5);

        if (i >= this.config.stars) {
          star.setAlpha(0.5);
        }

        this.starContainer.add(star);
      }

      this.add(this.starContainer);
    }
  }

  private createLockIcon(): void {
    this.lockIcon = this.scene.add.image(0, 42, "UI", "icon_lock");
    this.lockIcon.setScale(this.LOCK_SCALE);
    this.lockIcon.setAlpha(UI_COMPONENTS_CONFIG.levelCard.lockIconAlpha);
    this.add(this.lockIcon);
  }

  private setupUnlockInteraction(): void {
    const hitArea = new Phaser.Geom.Circle(0, 0, UI_COMPONENTS_CONFIG.levelCard.hitAreaRadius);
    this.setInteractive(hitArea, Phaser.Geom.Circle.Contains);

    this.on("pointerover", this.boundOnPointerOver);
    this.on("pointerout", this.boundOnPointerOut);
    this.on("pointerdown", this.boundOnPointerDownUnlocked);
  }

  private handlePointerOver(): void {
    this.scene.tweens.add({
      targets: this,
      scale: UI_COMPONENTS_CONFIG.levelCard.hoverScale,
      duration: T.duration.normal,
      ease: T.easing.smooth,
    });
  }

  private handlePointerOut(): void {
    this.scene.tweens.add({
      targets: this,
      scale: 1,
      duration: T.duration.normal,
      ease: T.easing.smooth,
    });
  }

  private handleLockedTap(): void {
    MobileManager.getInstance().vibrate("light");
    this.playLockedAnimation();
    if (this.config.onLockedTap) {
      this.config.onLockedTap(this.config.level);
    }
  }

  private setupLockedInteraction(): void {
    const hitArea = new Phaser.Geom.Circle(0, 0, UI_COMPONENTS_CONFIG.levelCard.hitAreaRadius);
    this.setInteractive(hitArea, Phaser.Geom.Circle.Contains);

    this.on("pointerdown", this.boundOnPointerDownLocked);
  }

  private playLockedAnimation(): void {
    const originalX = this.x;
    this.scene.tweens.add({
      targets: this,
      x: this.x - UI_COMPONENTS_CONFIG.levelCardAnimation.lockedXOffset,
      duration: UI_COMPONENTS_CONFIG.levelCardAnimation.lockedDuration,
      yoyo: true,
      repeat: UI_COMPONENTS_CONFIG.levelCardAnimation.lockedRepeat,
      ease: "Linear",
      onComplete: () => {
        this.x = originalX;
      },
    });
  }

  setUnlocked(unlocked: boolean, stars: number): void {
    if (unlocked && !this.config.unlocked) {
      this.config.unlocked = true;
      this.config.stars = stars;

      this.hexagon.setTexture("UI", "hexagon_brown");
      this.hexagon.setAlpha(1);

      if (this.lockIcon) {
        this.lockIcon.destroy();
        this.lockIcon = undefined;
      }

      this.levelText.setColor(T.colors.neutral.white);

      this.clearInteractionListeners();
      this.createStars();
      this.setupUnlockInteraction();
    }
  }

  private clearInteractionListeners(): void {
    this.off("pointerover", this.boundOnPointerOver);
    this.off("pointerout", this.boundOnPointerOut);
    this.off("pointerdown", this.boundOnPointerDownUnlocked);
    this.off("pointerdown", this.boundOnPointerDownLocked);
    this.disableInteractive();
  }

  getLevel(): number {
    return this.config.level;
  }

  isUnlocked(): boolean {
    return this.config.unlocked;
  }

  preDestroy(): void {
    this.clearInteractionListeners();
  }
}
