import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { UI_COMPONENTS_CONFIG } from "../../config/UIComponentsConfig";
import { LayoutManager } from "../LayoutManager";
import { ScorePanel } from "./ScorePanel";
import { Button } from "../components/Button";
import { gameEvents, SubscriptionGroup } from "../../events/EventBus";

export interface HUDConfig {
  level: number;
  levelName: string;
  totalPigs: number;
}

export class HUDManager {
  private scene: Phaser.Scene;
  private scorePanel!: ScorePanel;
  private pauseButton!: Button;
  private helpButton!: Button;
  private subscriptions: SubscriptionGroup;

  constructor(scene: Phaser.Scene, config: HUDConfig) {
    this.scene = scene;
    this.subscriptions = new SubscriptionGroup();

    this.createScorePanel(config);
    this.createHelpButton();
    this.createPauseButton();
    this.setupEventListeners();
  }

  private createScorePanel(config: HUDConfig): void {
    const pos = LayoutManager.getAnchorPosition(
      "topLeft",
      UI_COMPONENTS_CONFIG.hud.scorePanelOffsetX,
      T.spacing.xl
    );

    this.scorePanel = new ScorePanel(this.scene, pos.x, pos.y, {
      level: config.level,
      levelName: config.levelName,
      totalPigs: config.totalPigs,
    });

    this.scene.add.existing(this.scorePanel);
  }

  private createHelpButton(): void {
    const pos = LayoutManager.getAnchorPosition(
      "topRight",
      UI_COMPONENTS_CONFIG.hud.helpButtonOffsetX,
      UI_COMPONENTS_CONFIG.hud.helpButtonOffsetY
    );

    this.helpButton = new Button(this.scene, pos.x, pos.y, {
      label: "",
      variant: "secondary",
      size: "icon",
      icon: "icon_search",
      onClick: () => {
        gameEvents.emit("ui-help-toggle", undefined);
      },
    });

    this.helpButton.setDepth(T.depth.hudElements);
    this.scene.add.existing(this.helpButton);
  }

  private createPauseButton(): void {
    const pos = LayoutManager.getAnchorPosition(
      "topRight",
      UI_COMPONENTS_CONFIG.hud.pauseButtonOffsetX,
      UI_COMPONENTS_CONFIG.hud.pauseButtonOffsetY
    );

    this.pauseButton = new Button(this.scene, pos.x, pos.y, {
      label: "",
      variant: "secondary",
      size: "icon",
      icon: "icon_pause",
      onClick: () => {
        gameEvents.emit("ui-pause-toggle", { isPaused: true });
      },
    });

    this.pauseButton.setDepth(T.depth.hudElements);
    this.scene.add.existing(this.pauseButton);
  }

  private setupEventListeners(): void {
    this.subscriptions.add(gameEvents.subscribe("score-changed", this.handleScoreChanged, this));
    this.subscriptions.add(gameEvents.subscribe("ui-update", this.handleScoreUpdate, this));
  }

  private handleScoreChanged(data: { score: number }): void {
    this.scorePanel.setScore(data.score);
  }

  private handleScoreUpdate(data: { score: number; pigsRemaining: number }): void {
    this.scorePanel.setScore(data.score);
  }

  destroy(): void {
    this.subscriptions.disposeAll();

    this.scorePanel.destroy();
    this.helpButton.destroy();
    this.pauseButton.destroy();
  }
}
