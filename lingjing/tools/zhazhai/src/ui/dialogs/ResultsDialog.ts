import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { RESULTS_DIALOG_CONFIG } from "../../config/UIDialogsConfig";
import { LayoutManager } from "../LayoutManager";
import { Modal } from "../components/Modal";
import { Button } from "../components/Button";
import { StarRevealAnimation } from "../results/StarRevealAnimation";
import {
  ScoreBreakdown as ScoreBreakdownComponent,
  ScoreCategory,
} from "../results/ScoreBreakdown";
import { CelebrationController } from "../results/CelebrationController";
import type { ScoreBreakdown } from "../../systems/scoring/IScoringSystem";
import type { Position } from "../../types/Vector2";

export interface ResultsDialogConfig {
  level: number;
  levelName?: string;
  score: number;
  stars: number;
  won: boolean;
  birdPositions?: { x: number; y: number; texture: string }[];
  pigPositions?: Position[];
  breakdown?: ScoreBreakdown;
  onNext?: () => void;
  onReplay?: () => void;
  onHome?: () => void;
}

export class ResultsDialog extends Phaser.GameObjects.Container {
  private modal: Modal;
  private starReveal!: StarRevealAnimation;
  private scoreBreakdown!: ScoreBreakdownComponent;
  private celebrationController!: CelebrationController;
  private buttonsContainer!: Phaser.GameObjects.Container;
  private config: ResultsDialogConfig;
  private skippedToButtons: boolean = false;

  private readonly DIALOG_WIDTH = RESULTS_DIALOG_CONFIG.width;
  private readonly DIALOG_HEIGHT = RESULTS_DIALOG_CONFIG.height;
  private readonly BUTTON_GAP = RESULTS_DIALOG_CONFIG.buttonGap;

  constructor(scene: Phaser.Scene, config: ResultsDialogConfig) {
    super(scene, LayoutManager.CENTER_X, LayoutManager.CENTER_Y);

    this.config = config;

    this.modal = new Modal(scene, {
      width: this.DIALOG_WIDTH,
      height: this.DIALOG_HEIGHT,
      panelVariant: "brown",
      showCloseButton: false,
      showOverlay: false,
      closeOnOverlay: false,
      onClose: () => this.destroy(),
    });
    this.add(this.modal);

    this.createTitle();
    this.createStarReveal();
    this.createScoreBreakdown();
    this.createButtons();
    this.startCelebration();
    this.setupSkipInteraction();

    this.setDepth(T.depth.dialogs);
    scene.add.existing(this);
  }

  private createTitle(): void {
    const titleText = this.scene.add.text(
      0,
      -this.DIALOG_HEIGHT / 2 + RESULTS_DIALOG_CONFIG.titleY,
      this.config.won ? "LEVEL COMPLETE!" : "LEVEL FAILED",
      {
        fontFamily: T.fonts.family,
        fontSize: `${T.fonts.sizes.subtitle}px`,
        color: this.config.won ? T.colors.accent.green : T.colors.accent.red,
        stroke: T.colors.neutral.black,
        strokeThickness: 4,
      }
    );
    titleText.setOrigin(0.5);
    this.add(titleText);
  }

  private createStarReveal(): void {
    this.starReveal = new StarRevealAnimation(this.scene, {
      x: RESULTS_DIALOG_CONFIG.starsX,
      y: -this.DIALOG_HEIGHT / 2 + RESULTS_DIALOG_CONFIG.starsY,
      earnedStars: this.config.won ? this.config.stars : 0,
      totalStars: 3,
      startDelay: RESULTS_DIALOG_CONFIG.starRevealDelay,
      onComplete: () => {
        this.onStarRevealComplete();
      },
    });
    this.add(this.starReveal);
  }

  private createScoreBreakdown(): void {
    const categories = this.calculateScoreCategories();

    this.scoreBreakdown = new ScoreBreakdownComponent(this.scene, {
      x: 0,
      y: RESULTS_DIALOG_CONFIG.scoreBreakdownY,
      categories: categories,
      totalLabel: "TOTAL",
      startDelay: RESULTS_DIALOG_CONFIG.scoreBreakdownDelay,
      onAllComplete: () => {
        this.showButtons();
      },
    });
    this.add(this.scoreBreakdown);
  }

  private calculateScoreCategories(): ScoreCategory[] {
    const breakdown = this.config.breakdown;

    if (!breakdown) {
      return [{ name: "TOTAL", value: this.config.score }];
    }

    const destruction = breakdown.categories.pigs + breakdown.categories.blocks;
    const bonuses =
      breakdown.categories.combos + breakdown.categories.impacts + breakdown.categories.explosions;
    const birdsLeft = breakdown.categories.unusedBirds;

    const categories: ScoreCategory[] = [];

    if (destruction > 0) {
      categories.push({ name: "DESTRUCTION", value: destruction });
    }
    if (bonuses > 0) {
      categories.push({ name: "BONUSES", value: bonuses });
    }
    if (birdsLeft > 0) {
      categories.push({ name: "BIRDS LEFT", value: birdsLeft });
    }

    if (categories.length === 0) {
      categories.push({ name: "TOTAL", value: breakdown.total });
    }

    return categories;
  }

  private createButtons(): void {
    this.buttonsContainer = this.scene.add.container(
      0,
      this.DIALOG_HEIGHT / 2 - RESULTS_DIALOG_CONFIG.buttonContainerY
    );
    this.buttonsContainer.setAlpha(0);
    this.add(this.buttonsContainer);

    const buttonY = RESULTS_DIALOG_CONFIG.buttonY;
    const secondaryButtonWidth = T.button.sizes.secondary.width;
    const buttonOffsetX =
      secondaryButtonWidth / 2 + this.BUTTON_GAP / RESULTS_DIALOG_CONFIG.buttonOffsetDivisor;

    if (this.config.won) {
      const replayButton = new Button(this.scene, -buttonOffsetX, buttonY, {
        label: "REPLAY",
        variant: "secondary",
        size: "secondary",
        onClick: () => this.handleReplay(),
      });
      this.buttonsContainer.add(replayButton);

      const nextButton = new Button(this.scene, buttonOffsetX, buttonY, {
        label: "NEXT",
        variant: "tertiary",
        size: "secondary",
        onClick: () => this.handleNext(),
      });
      this.buttonsContainer.add(nextButton);

      const homeButton = new Button(this.scene, 0, buttonY + RESULTS_DIALOG_CONFIG.homeButtonYWon, {
        label: "HOME",
        variant: "danger",
        size: "small",
        onClick: () => this.handleHome(),
      });
      this.buttonsContainer.add(homeButton);
    } else {
      const retryButton = new Button(this.scene, 0, buttonY, {
        label: "RETRY",
        variant: "danger",
        size: "secondary",
        onClick: () => this.handleReplay(),
      });
      this.buttonsContainer.add(retryButton);

      const homeButton = new Button(
        this.scene,
        0,
        buttonY + RESULTS_DIALOG_CONFIG.homeButtonYLost,
        {
          label: "HOME",
          variant: "secondary",
          size: "small",
          onClick: () => this.handleHome(),
        }
      );
      this.buttonsContainer.add(homeButton);
    }
  }

  private startCelebration(): void {
    // this.celebrationController = new CelebrationController({
    //   scene: this.scene,
    //   won: this.config.won,
    //   birdPositions: this.config.birdPositions,
    //   pigPositions: this.config.pigPositions,
    // });
  }

  private setupSkipInteraction(): void {
    // Make entire container interactive over full viewport for skip detection
    this.setInteractive(
      new Phaser.Geom.Rectangle(
        -LayoutManager.CENTER_X,
        -LayoutManager.CENTER_Y,
        LayoutManager.VIEWPORT_WIDTH,
        LayoutManager.VIEWPORT_HEIGHT
      ),
      Phaser.Geom.Rectangle.Contains
    );

    // Listen for pointer down anywhere to skip animation
    this.on("pointerdown", () => {
      if (!this.skippedToButtons) {
        this.skipToButtons();
      }
    });

    // Also listen on the modal's overlay (which covers the whole screen)
    const modalOverlay = this.getModalOverlay();
    if (modalOverlay) {
      modalOverlay.on("pointerdown", () => {
        if (!this.skippedToButtons) {
          this.skipToButtons();
        }
      });
    }
  }

  private getModalOverlay(): Phaser.GameObjects.Rectangle | null {
    // The modal is the first child added to this container
    const modal = this.getAt(0) as Phaser.GameObjects.Container;
    if (modal && modal instanceof Phaser.GameObjects.Container) {
      // The overlay is the first child of the modal
      const overlay = modal.getAt(0);
      if (overlay instanceof Phaser.GameObjects.Rectangle) {
        return overlay;
      }
    }
    return null;
  }

  private onStarRevealComplete(): void {
    // Stars done, score breakdown will start automatically
  }

  private skipToButtons(): void {
    this.skippedToButtons = true;

    this.starReveal.skip();
    this.scoreBreakdown.skip();

    this.showButtons();
  }

  private showButtons(): void {
    if (this.buttonsContainer.alpha === 1) return;

    this.scene.tweens.add({
      targets: this.buttonsContainer,
      alpha: 1,
      duration: T.duration.medium,
      ease: "Quad.Out",
    });
  }

  private handleNext(): void {
    this.cleanup();
    if (this.config.onNext) this.config.onNext();
    this.destroy();
  }

  private handleReplay(): void {
    this.cleanup();
    if (this.config.onReplay) this.config.onReplay();
    this.destroy();
  }

  private handleHome(): void {
    this.cleanup();
    if (this.config.onHome) this.config.onHome();
    this.destroy();
  }

  private cleanup(): void {
    if (this.celebrationController) {
      this.celebrationController.destroy();
    }
  }

  close(): void {
    this.cleanup();
    this.modal.close();
    this.destroy();
  }
}
