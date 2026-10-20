import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { UI_COMPONENTS_CONFIG } from "../../config/UIComponentsConfig";
import { Panel } from "../components/Panel";
import { LayoutManager } from "../LayoutManager";

export interface ScorePanelConfig {
  initialScore?: number;
  level?: number;
  levelName?: string;
  totalPigs?: number;
  onScoreChange?: (score: number) => void;
}

export class ScorePanel extends Phaser.GameObjects.Container {
  private panel!: Panel;
  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;

  private currentScore: number = 0;
  private displayedScore: number = 0;
  private containerX: number;
  private containerY: number;

  private readonly PANEL_WIDTH = UI_COMPONENTS_CONFIG.scorePanel.width;
  private readonly PANEL_HEIGHT = UI_COMPONENTS_CONFIG.scorePanel.height;

  constructor(scene: Phaser.Scene, x: number, y: number, config: ScorePanelConfig = {}) {
    super(scene, x, y);

    this.containerX = x;
    this.containerY = y;
    this.currentScore = config.initialScore ?? 0;
    this.displayedScore = this.currentScore;

    this.createPanel();
    this.createScoreDisplay();
    this.createLevelDisplay(config.levelName ?? `LEVEL ${config.level ?? 1}`);

    scene.add.existing(this);
  }

  private createPanel(): void {
    this.panel = new Panel(this.scene, 0, 0, {
      width: this.PANEL_WIDTH,
      height: this.PANEL_HEIGHT,
      variant: "brown",
    });
    this.add(this.panel);
  }

  private createScoreDisplay(): void {
    const starIcon = this.scene.add.image(
      -this.PANEL_WIDTH / 2 + UI_COMPONENTS_CONFIG.scorePanel.starIconX,
      0,
      "UI",
      "icon_star"
    );
    starIcon.setScale(UI_COMPONENTS_CONFIG.scorePanel.starIconScale);
    starIcon.setTint(UI_COMPONENTS_CONFIG.scorePanel.starTint);
    this.add(starIcon);

    this.scoreText = this.scene.add.text(
      -this.PANEL_WIDTH / 2 + UI_COMPONENTS_CONFIG.scorePanel.scoreTextX,
      UI_COMPONENTS_CONFIG.scorePanel.scoreTextY,
      this.formatScore(this.displayedScore),
      {
        fontFamily: T.fonts.family,
        fontSize: `${T.fonts.sizes.button}px`,
        color: T.colors.text.gold,
        stroke: T.colors.neutral.black,
        strokeThickness: 3,
      }
    );
    this.scoreText.setOrigin(0, 0.5);
    this.add(this.scoreText);
  }

  private createLevelDisplay(levelName: string): void {
    const offsetX = LayoutManager.CENTER_X - this.containerX;
    const offsetY = T.spacing.xxxl - this.containerY;

    this.levelText = this.scene.add.text(offsetX, offsetY, levelName, {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.subtitle}px`,
      color: T.colors.neutral.white,
      stroke: T.colors.neutral.black,
      strokeThickness: 3,
    });

    this.levelText.setOrigin(0.5);
    this.add(this.levelText);
  }

  setScore(score: number, animate: boolean = true): void {
    const targetScore = Math.max(0, score);

    if (targetScore === this.currentScore) return;

    this.currentScore = targetScore;

    if (animate) {
      this.scene.tweens.addCounter({
        from: this.displayedScore,
        to: targetScore,
        duration: T.duration.slow,
        ease: "Quad.Out",
        onUpdate: (tween) => {
          const value = tween.getValue() ?? this.displayedScore;
          this.displayedScore = Math.floor(value);
          this.scoreText.setText(this.formatScore(this.displayedScore));
        },
        onComplete: () => {
          this.displayedScore = targetScore;
          this.scoreText.setText(this.formatScore(this.displayedScore));
        },
      });
    } else {
      this.displayedScore = targetScore;
      this.scoreText.setText(this.formatScore(this.displayedScore));
    }
  }

  setLevelName(name: string): void {
    this.levelText.setText(name);
  }

  getScore(): number {
    return this.currentScore;
  }

  private formatScore(score: number): string {
    return score.toLocaleString();
  }

  reset(initialScore: number = 0, levelName: string = "Level 1"): void {
    this.currentScore = initialScore;
    this.displayedScore = initialScore;

    this.scoreText.setText(this.formatScore(initialScore));
    this.levelText.setText(levelName);
  }
}
