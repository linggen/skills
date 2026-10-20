import { BaseScene } from "./BaseScene";
import { GameScene } from "./GameScene";
import { DesignTokens as T } from "../config/DesignTokens";
import { Button } from "../ui/components/Button";
import { LevelGrid, LevelData } from "../ui/levelSelect";
import type { IAudioSystem } from "../interfaces/audio";
import { ServiceTokens } from "../config/registries/ServiceContainer";
import { getServiceContainer } from "../config/bootstrap";
import { getLevelById, getTotalLevels } from "../data/levels";
import { SceneNavigator } from "../utils/SceneNavigator";

export class LevelSelectScene extends BaseScene {
  private audioSystem!: IAudioSystem;
  private levelGrid: LevelGrid | null = null;
  private levelData: LevelData[] = [];

  constructor() {
    super({ key: "LevelSelectScene" });
  }

  create(): void {
    this.audioSystem = getServiceContainer().resolve(ServiceTokens.AUDIO_SYSTEM);

    this.setupOrientationOverlay();
    this.initLevelData();
    this.showBackground();
    this.showTitle();
    this.createBackButton();
    this.createLevelGrid();
    this.playEntryAnimation();
  }

  private initLevelData(): void {
    this.levelData = [];

    const maxUnlocked = GameScene.loadMaxUnlockedLevel();
    const totalLevels = getTotalLevels();

    for (let i = 1; i <= totalLevels; i++) {
      const saved = GameScene.getLevelProgress(i);
      const isUnlocked = i <= maxUnlocked;

      this.levelData.push({
        level: i,
        unlocked: isUnlocked,
        stars: saved?.stars ?? (i === 1 ? 0 : -1),
      });
    }
  }

  private showBackground(): void {
    const bg = this.add.image(this.centerX, this.centerY, "backgrounds", "backgroundForest");
    bg.setDisplaySize(this.viewportWidth, this.viewportHeight);
    bg.setDepth(T.depth.background);
  }

  private showTitle(): void {
    const title = this.add.text(this.centerX, 60, "SELECT LEVEL", {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.title}px`,
      color: T.colors.neutral.white,
      stroke: T.colors.neutral.black,
      strokeThickness: 6,
    });
    title.setOrigin(0.5);
    title.setDepth(T.depth.hud);
    title.setAlpha(0);

    this.tweens.add({
      targets: title,
      alpha: 1,
      duration: T.duration.medium,
      ease: "Quad.Out",
    });
  }

  private createBackButton(): void {
    const backButton = new Button(this, 100, 60, {
      label: "",
      variant: "secondary",
      size: "icon",
      icon: "icon_arrow",
      iconPosition: "right",
      onClick: () => {
        this.audioSystem.ui.playClick();
        this.transitionToScene("MenuScene");
      },
    });
    backButton.setDepth(T.depth.hud);
    this.add.existing(backButton);
  }

  private createLevelGrid(): void {
    const marginX = 40;
    const gridY = 180;
    const gridWidth = this.viewportWidth - marginX * 2;
    const gridHeight = this.viewportHeight - 180;

    this.levelGrid = new LevelGrid(this, {
      x: marginX,
      y: gridY,
      width: gridWidth,
      height: gridHeight,
      columns: 5,
      levels: this.levelData,
      onLevelSelected: (level: number) => {
        this.selectLevel(level);
      },
      onLockedTap: () => {
        this.audioSystem.ui.playClick();
      },
    });

    this.levelGrid.setDepth(T.depth.hud);
    this.add.existing(this.levelGrid);

    this.animateCardsAppear();
  }

  private animateCardsAppear(): void {
    if (!this.levelGrid) return;
    const cards = this.levelGrid.getCards();

    cards.forEach((card, index) => {
      card.setAlpha(0);
      card.setScale(0.8);

      const row = Math.floor(index / 5);
      const col = index % 5;
      const delay = (row * 5 + col) * 60;

      this.tweens.add({
        targets: card,
        alpha: 1,
        scale: 1,
        duration: T.duration.medium,
        delay: delay + 200,
        ease: T.easing.bounce,
      });
    });
  }

  private selectLevel(level: number): void {
    this.audioSystem.ui.playClick();
    this.startGame(level);
  }

  private startGame(level: number): void {
    const theme = getLevelById(level)?.theme || "forest";
    const navigator = new SceneNavigator(this);
    navigator.toGameScene(level, theme);
  }

  public unlockLevel(level: number, stars: number): void {
    const index = this.levelData.findIndex((l) => l.level === level);
    if (index !== -1) {
      this.levelData[index].unlocked = true;
      this.levelData[index].stars = stars;
      this.levelGrid?.updateLevel(level, true, stars);

      if (level < this.levelData.length) {
        const nextIndex = this.levelData.findIndex((l) => l.level === level + 1);
        if (nextIndex !== -1 && !this.levelData[nextIndex].unlocked) {
          this.levelData[nextIndex].unlocked = true;
          this.levelData[nextIndex].stars = -1;
          this.levelGrid?.updateLevel(level + 1, true, -1);
        }
      }
    }
  }

  private playEntryAnimation(): void {
    this.cameras.main.fadeIn(T.duration.medium);
  }

  shutdown(): void {
    if (this.levelGrid) {
      this.levelGrid.destroy();
      this.levelGrid = null;
    }

    this.levelData = [];
    super.shutdown?.();
  }
}

export default LevelSelectScene;
