import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";

export interface ScoreCategory {
  name: string;
  value: number;
}

export interface ScoreBreakdownConfig {
  x: number;
  y: number;
  categories: ScoreCategory[];
  totalLabel?: string;
  startDelay?: number;
  onCategoryComplete?: (category: ScoreCategory) => void;
  onAllComplete?: () => void;
}

export class ScoreBreakdown extends Phaser.GameObjects.Container {
  private categories: ScoreCategory[];
  private categoryTexts: Phaser.GameObjects.Text[] = [];
  private valueTexts: Phaser.GameObjects.Text[] = [];
  private totalText!: Phaser.GameObjects.Text;
  private divider!: Phaser.GameObjects.Rectangle;
  private totalLabel!: Phaser.GameObjects.Text;
  private currentCategoryIndex: number = 0;
  private animationComplete: boolean = false;
  private activeTimers: Phaser.Time.TimerEvent[] = [];
  private onAllCompleteCallback?: () => void;

  private readonly LINE_HEIGHT = 35;
  private readonly VALUE_OFFSET = 150;

  constructor(scene: Phaser.Scene, config: ScoreBreakdownConfig) {
    super(scene, config.x, config.y);

    this.categories = config.categories;
    this.onAllCompleteCallback = config.onAllComplete;

    this.createCategoryTexts();
    this.createTotalText(config.totalLabel ?? "TOTAL");
    this.startAnimation(config.startDelay ?? 0, config.onCategoryComplete);

    scene.add.existing(this);
  }

  private createCategoryTexts(): void {
    this.categories.forEach((category, index) => {
      const y = index * this.LINE_HEIGHT;

      const categoryText = this.scene.add.text(-this.VALUE_OFFSET, y, category.name, {
        fontFamily: T.fonts.family,
        fontSize: `${T.fonts.sizes.label}px`,
        color: T.colors.text.onCream,
      });
      categoryText.setOrigin(0, 0.5);
      categoryText.setAlpha(0);
      this.categoryTexts.push(categoryText);
      this.add(categoryText);

      const valueText = this.scene.add.text(this.VALUE_OFFSET, y, "0", {
        fontFamily: T.fonts.family,
        fontSize: `${T.fonts.sizes.label}px`,
        color: T.colors.text.gold,
        stroke: T.colors.neutral.black,
        strokeThickness: 2,
      });
      valueText.setOrigin(1, 0.5);
      valueText.setAlpha(0);
      this.valueTexts.push(valueText);
      this.add(valueText);
    });
  }

  private createTotalText(totalLabelStr: string): void {
    const totalY = this.categories.length * this.LINE_HEIGHT + 10;

    this.divider = this.scene.add.rectangle(
      0,
      totalY - 15,
      this.VALUE_OFFSET * 2,
      2,
      Phaser.Display.Color.HexStringToColor(T.colors.text.onCream).color
    );
    this.divider.setAlpha(0);
    this.add(this.divider);

    this.totalLabel = this.scene.add.text(-this.VALUE_OFFSET, totalY + 16, totalLabelStr, {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.button}px`,
      color: T.colors.text.onCream,
      fontStyle: "bold",
    });
    this.totalLabel.setOrigin(0, 0.5);
    this.totalLabel.setAlpha(0);
    this.add(this.totalLabel);

    this.totalText = this.scene.add.text(this.VALUE_OFFSET, totalY + 16, "0", {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.button}px`,
      color: T.colors.text.gold,
      stroke: T.colors.neutral.black,
      strokeThickness: 3,
      fontStyle: "bold",
    });
    this.totalText.setOrigin(1, 0.5);
    this.totalText.setAlpha(0);
    this.add(this.totalText);
  }

  private startAnimation(
    delay: number,
    onCategoryComplete?: (category: ScoreCategory) => void
  ): void {
    const timer = this.scene.time.delayedCall(delay, () => {
      this.animateNextCategory(onCategoryComplete);
    });
    this.activeTimers.push(timer);
  }

  private animateNextCategory(onCategoryComplete?: (category: ScoreCategory) => void): void {
    if (this.animationComplete) return;

    if (this.currentCategoryIndex >= this.categories.length) {
      this.animateTotal();
      return;
    }

    const category = this.categories[this.currentCategoryIndex];
    const categoryText = this.categoryTexts[this.currentCategoryIndex];
    const valueText = this.valueTexts[this.currentCategoryIndex];

    this.scene.tweens.add({
      targets: categoryText,
      alpha: 1,
      duration: T.duration.normal,
    });

    this.scene.tweens.add({
      targets: valueText,
      alpha: 1,
      duration: T.duration.normal,
    });

    const durationPerCategory = T.duration.verySlow / this.categories.length;

    this.scene.tweens.addCounter({
      from: 0,
      to: category.value,
      duration: durationPerCategory,
      ease: "Quad.Out",
      onUpdate: (tween) => {
        if (this.animationComplete) return;
        const value = tween.getValue();
        valueText.setText(Math.floor(value ?? 0).toLocaleString());
      },
      onComplete: () => {
        if (this.animationComplete) return;
        if (onCategoryComplete) onCategoryComplete(category);
        this.currentCategoryIndex++;
        this.animateNextCategory(onCategoryComplete);
      },
    });
  }

  private animateTotal(): void {
    if (this.animationComplete) return;

    const total = this.categories.reduce((sum, cat) => sum + cat.value, 0);

    this.scene.tweens.add({
      targets: [this.totalText, this.divider, this.totalLabel],
      alpha: 1,
      duration: T.duration.normal,
    });

    this.scene.tweens.addCounter({
      from: 0,
      to: total,
      duration: T.duration.verySlow,
      ease: "Quad.Out",
      onUpdate: (tween) => {
        if (this.animationComplete) return;
        const value = tween.getValue();
        this.totalText.setText(Math.floor(value ?? 0).toLocaleString());
      },
      onComplete: () => {
        if (this.animationComplete) return;
        this.animationComplete = true;
        if (this.onAllCompleteCallback) this.onAllCompleteCallback();
      },
    });
  }

  isComplete(): boolean {
    return this.animationComplete;
  }

  skip(): void {
    // Stop all pending timers
    this.activeTimers.forEach((timer) => timer.destroy());
    this.activeTimers = [];

    // Stop all tweens on text elements
    this.categoryTexts.forEach((text) => this.scene.tweens.killTweensOf(text));
    this.valueTexts.forEach((text) => this.scene.tweens.killTweensOf(text));
    this.scene.tweens.killTweensOf(this.totalText);
    this.scene.tweens.killTweensOf(this.divider);
    this.scene.tweens.killTweensOf(this.totalLabel);

    // Set final visual state
    const total = this.categories.reduce((sum, cat) => sum + cat.value, 0);

    this.categoryTexts.forEach((text) => text.setAlpha(1));
    this.valueTexts.forEach((text, index) => {
      text.setAlpha(1);
      text.setText(this.categories[index].value.toLocaleString());
    });

    this.divider.setAlpha(1);
    this.totalLabel.setAlpha(1);
    this.totalText.setAlpha(1);
    this.totalText.setText(total.toLocaleString());

    this.animationComplete = true;
  }

  getTotal(): number {
    return this.categories.reduce((sum, cat) => sum + cat.value, 0);
  }
}
