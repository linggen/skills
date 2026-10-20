import { BaseScene } from "./BaseScene";
import { BirdType } from "../types/BirdType";
import { getTotalLevels } from "../data/levels";
import { HUDManager } from "../ui/hud/HUDManager";
import { ResultsDialog } from "../ui/dialogs/ResultsDialog";
import { PauseDialog } from "../ui/dialogs/PauseDialog";
import { SettingsDialog } from "../ui/dialogs/SettingsDialog";
import { HelpDialog } from "../ui/dialogs/HelpDialog";
import type { IAudioSystem } from "../interfaces/audio";
import type { ITimeEffectsSettingsProvider } from "../interfaces/ITimeEffectsSettings";
import type { IMobileSettingsProvider } from "../interfaces/IMobileSettings";
import { ServiceTokens } from "../config/registries/ServiceContainer";
import { getServiceContainer } from "../config/bootstrap";
import { gameEvents, SubscriptionGroup } from "../events/EventBus";
import type { ScoreBreakdown } from "../systems/scoring/IScoringSystem";
import type { Position } from "../types/Vector2";
import { SceneNavigator } from "../utils/SceneNavigator";
import { getLevelById } from "../data/levels";
import { PerformanceManager } from "../systems/PerformanceManager";

interface UIState {
  score: number;
  pigsRemaining: number;
  birdsRemaining: number;
  isPaused: boolean;
  isGameOver: boolean;
}

interface ResultsData {
  level: number;
  score: number;
  stars: number;
  won: boolean;
  birdPositions?: { x: number; y: number; texture: string }[];
  pigPositions?: Position[];
  breakdown?: ScoreBreakdown;
}

export class UIScene extends BaseScene {
  private audioSystem!: IAudioSystem;
  private timeEffectsSettings!: ITimeEffectsSettingsProvider;
  private mobileSettings!: IMobileSettingsProvider;
  private hudManager!: HUDManager;
  private pauseDialog: PauseDialog | null = null;
  private helpDialog: HelpDialog | null = null;
  private currentLevel: number = 1;
  private subscriptions: SubscriptionGroup;

  private state: UIState = {
    score: 0,
    pigsRemaining: 3,
    birdsRemaining: 5,
    isPaused: false,
    isGameOver: false,
  };

  constructor() {
    super({ key: "UIScene" });
    this.subscriptions = new SubscriptionGroup();
  }

  init(data: { level: number }): void {
    this.currentLevel = data.level || 1;
  }

  create(): void {
    const container = getServiceContainer();
    this.audioSystem = container.resolve(ServiceTokens.AUDIO_SYSTEM);
    this.timeEffectsSettings = container.resolve(ServiceTokens.TIME_EFFECTS_SETTINGS);
    this.mobileSettings = container.resolve(ServiceTokens.MOBILE_SETTINGS);

    this.setupOrientationOverlay();
    this.createHUD();
    this.setupEventListeners();

    this.events.once("shutdown", this.cleanup, this);
  }

  private setupEventListeners(): void {
    this.subscriptions.add(gameEvents.subscribe("ui-update", this.handleUIUpdate, this));
    this.subscriptions.add(gameEvents.subscribe("ui-birdQueue", this.handleBirdQueueUpdate, this));
    this.subscriptions.add(gameEvents.subscribe("ui-level", this.handleLevelUpdate, this));
    this.subscriptions.add(gameEvents.subscribe("ui-pause", this.handlePauseRequest, this));
    this.subscriptions.add(gameEvents.subscribe("ui-results", this.handleShowResults, this));
    this.subscriptions.add(gameEvents.subscribe("ui-reset", this.handleReset, this));
    this.subscriptions.add(gameEvents.subscribe("ui-help-toggle", this.handleHelpToggle, this));

    gameEvents.emit("ui-request-initial-state", undefined);
  }

  private createHUD(): void {
    const levelData = getLevelById(this.currentLevel);
    this.hudManager = new HUDManager(this, {
      level: this.currentLevel,
      levelName: levelData!.name,
      totalPigs: this.state.pigsRemaining,
    });
  }

  private handleUIUpdate(data: { score: number; pigsRemaining: number }): void {
    this.state.score = data.score;
    this.state.pigsRemaining = data.pigsRemaining;
  }

  private handleBirdQueueUpdate(data: { queue: BirdType[] }): void {
    this.state.birdsRemaining = data.queue.length;
  }

  private handleLevelUpdate(data: { level: number }): void {
    this.currentLevel = data.level;
  }

  private handlePauseRequest(data: { isPaused: boolean }): void {
    this.state.isPaused = data.isPaused;
    if (this.state.isPaused) {
      this.showPauseDialog();
    } else {
      this.hidePauseDialog();
    }
  }

  private handleShowResults(data: ResultsData): void {
    this.state.isGameOver = true;
    this.showResultsDialog(data);
  }

  private handleReset(): void {
    this.state = {
      score: 0,
      pigsRemaining: 3,
      birdsRemaining: 5,
      isPaused: false,
      isGameOver: false,
    };
    this.currentLevel = 1;

    if (this.hudManager) {
      this.hudManager.destroy();
    }
    this.createHUD();
  }

  private handleHelpToggle(): void {
    if (this.helpDialog) {
      this.helpDialog.close();
      this.helpDialog = null;
      return;
    }
    this.showHelpDialog();
  }

  private showHelpDialog(): void {
    if (this.helpDialog) return;

    const levelData = getLevelById(this.currentLevel)!;
    this.helpDialog = new HelpDialog(this, {
      levelName: levelData.name,
      levelNumber: this.currentLevel,
      description: levelData.description,
      teachingFocus: levelData.teachingFocus,
    });

    this.add.existing(this.helpDialog);
  }

  private showPauseDialog(): void {
    if (this.pauseDialog) return;

    this.pauseDialog = new PauseDialog(this, {
      onResume: () => {
        this.audioSystem.ui.playClick();
        this.togglePause();
      },
      onRestart: () => {
        this.audioSystem.ui.playClick();
        this.hidePauseDialog();
        this.transitionToGameScene(this.currentLevel);
      },
      onSettings: () => {
        this.audioSystem.ui.playClick();
        this.openSettingsDialog();
      },
      onMenu: () => {
        this.audioSystem.ui.playClick();
        this.hidePauseDialog();
        this.transitionToMenu();
      },
    });

    this.add.existing(this.pauseDialog);
  }

  private hidePauseDialog(): void {
    if (this.pauseDialog) {
      this.pauseDialog.close();
      this.pauseDialog = null;
    }
  }

  private togglePause(): void {
    this.state.isPaused = !this.state.isPaused;
    gameEvents.emit("ui-pause-toggle", { isPaused: this.state.isPaused });

    if (this.state.isPaused) {
      this.showPauseDialog();
    } else {
      this.hidePauseDialog();
    }
  }

  private showResultsDialog(data: ResultsData): void {
    const totalLevels = getTotalLevels();
    const nextLevel = data.level < totalLevels ? data.level + 1 : data.level;
    const levelData = getLevelById(data.level)!;

    const dialog = new ResultsDialog(this, {
      level: data.level,
      levelName: levelData.name,
      score: data.score,
      stars: data.stars,
      won: data.won,
      birdPositions: data.birdPositions ?? [],
      pigPositions: data.pigPositions ?? [],
      breakdown: data.breakdown,
      onNext: () => {
        this.audioSystem.ui.playClick();
        this.transitionToGameScene(nextLevel);
      },
      onReplay: () => {
        this.audioSystem.ui.playClick();
        this.transitionToGameScene(data.level);
      },
      onHome: () => {
        this.audioSystem.ui.playClick();
        this.transitionToMenu();
      },
    });

    this.add.existing(dialog);
  }

  private openSettingsDialog(): void {
    const currentSettings = this.audioSystem.settings.getSettings();
    const timeEffectsSettings = this.timeEffectsSettings.getSettings();
    const mobileSettings = this.mobileSettings.getSettings();

    const dialog = new SettingsDialog(this, {
      showOverlay: false,
      musicEnabled: currentSettings.musicEnabled,
      sfxEnabled: currentSettings.sfxEnabled,
      musicVolume: currentSettings.musicVolume * 100,
      sfxVolume: currentSettings.sfxVolume * 100,
      performanceMode: PerformanceManager.getPerformanceMode(),
      hitPauseEnabled: timeEffectsSettings.hitPauseEnabled,
      slowMotionEnabled: timeEffectsSettings.slowMotionEnabled,
      hapticEnabled: mobileSettings.hapticEnabled,
      screenFlashEnabled: timeEffectsSettings.screenFlashEnabled,
      onMusicToggle: (enabled: boolean) => {
        this.audioSystem.settings.setMusicEnabled(enabled);
      },
      onSfxToggle: (enabled: boolean) => {
        this.audioSystem.settings.setSfxEnabled(enabled);
      },
      onMusicVolumeChange: (value: number) => {
        this.audioSystem.settings.setMusicVolume(value / 100);
      },
      onSfxVolumeChange: (value: number) => {
        this.audioSystem.settings.setSfxVolume(value / 100);
      },
      onPerformanceModeChange: (mode) => {
        PerformanceManager.setPerformanceMode(mode);
      },
      onHitPauseToggle: (enabled: boolean) => {
        this.timeEffectsSettings.setHitPauseEnabled(enabled);
      },
      onSlowMotionToggle: (enabled: boolean) => {
        this.timeEffectsSettings.setSlowMotionEnabled(enabled);
      },
      onHapticToggle: (enabled: boolean) => {
        this.mobileSettings.setHapticEnabled(enabled);
      },
      onScreenFlashToggle: (enabled: boolean) => {
        this.timeEffectsSettings.setScreenFlashEnabled(enabled);
      },
    });

    this.add.existing(dialog);
  }

  private transitionToGameScene(level: number): void {
    const theme = getLevelById(level)?.theme || "forest";
    const navigator = new SceneNavigator(this);
    navigator.toGameScene(level, theme);
  }

  private transitionToMenu(): void {
    const theme = getLevelById(this.currentLevel)?.theme;
    const navigator = new SceneNavigator(this);
    navigator.toMenuScene(theme);
  }

  private cleanup(): void {
    this.subscriptions.disposeAll();

    if (this.hudManager) {
      this.hudManager.destroy();
    }

    if (this.pauseDialog) {
      this.pauseDialog.destroy();
      this.pauseDialog = null;
    }

    if (this.helpDialog) {
      this.helpDialog.destroy();
      this.helpDialog = null;
    }

    super.shutdown();
  }
}
