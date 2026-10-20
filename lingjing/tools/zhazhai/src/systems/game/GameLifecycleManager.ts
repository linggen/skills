import Phaser from "phaser";
import type { IGameStateManager } from "../state/IGameStateManager";
import type { IScoringSystem } from "../scoring/IScoringSystem";
import type { IProgressManager } from "../progress/IProgressManager";
import type { IJinglePlayer, IUIAudioPlayer } from "../../interfaces/audio";
import type { IScorePopupManager } from "../../interfaces/IScorePopupManager";
import type { LevelData } from "../../data/levels";
import type { IBirdQueue } from "../../interfaces/IBirdQueue";
import type { Position } from "../../types/Vector2";
import type { DestructionTracker } from "../DestructionTracker";
import type { IVFXManager } from "../../interfaces/IVFXManager";
import { gameEvents } from "../../events/EventBus";
import { MISC_TIMING_CONFIG } from "../../config/TimingConfig";

export interface GameLifecycleDeps {
  scene: Phaser.Scene;
  gameStateManager: IGameStateManager;
  scoringSystem: IScoringSystem;
  progressManager: IProgressManager;
  jingles: IJinglePlayer;
  ui: IUIAudioPlayer;
  scorePopupManager: IScorePopupManager;
  birdQueueSystem: IBirdQueue;
  levelData: LevelData;
  level: number;
  pigs: { isDestroyed: () => boolean; getPosition: () => Position }[];
  getBirdPositions: () => { x: number; y: number; texture: string }[];
  flushCombo: () => void;
  destructionTracker: DestructionTracker;
  vfxManager: IVFXManager;
}

export interface GameLifecycleCallbacks {
  spawnNextBird: () => void;
  updateUI: () => void;
}

export class GameLifecycleManager {
  private deps: GameLifecycleDeps;
  private callbacks: GameLifecycleCallbacks | null = null;

  constructor(deps: GameLifecycleDeps) {
    this.deps = deps;
  }

  setCallbacks(callbacks: GameLifecycleCallbacks): void {
    this.callbacks = callbacks;
  }

  checkGameState(): void {
    if (this.deps.gameStateManager.isTransitioning()) return;

    if (this.deps.gameStateManager.getPigsRemaining() <= 0) {
      this.winLevel();
      return;
    }

    if (this.deps.gameStateManager.getBirdsRemaining() <= 0) {
      const pigsStillAlive = this.deps.pigs.filter((p) => !p.isDestroyed()).length;
      if (pigsStillAlive > 0) {
        this.loseLevel();
      }
    } else {
      this.callbacks?.spawnNextBird();
    }
  }

  private winLevel(): void {
    if (this.deps.gameStateManager.isTransitioning()) return;
    this.deps.gameStateManager.triggerWin();

    this.deps.flushCombo();

    const unusedBirds = this.deps.birdQueueSystem.getQueueLength();
    if (unusedBirds > 0) {
      const bonus = this.deps.scoringSystem.addUnusedBirdBonus(unusedBirds);
      const camera = this.deps.scene.cameras.main;
      const worldCenterX = camera.scrollX + camera.width / 2;
      const worldCenterY = camera.scrollY + camera.height / 2;
      this.deps.scorePopupManager.show(worldCenterX, worldCenterY, bonus);
    }

    const breakdown = this.deps.scoringSystem.getBreakdown();
    const stars = this.deps.progressManager.calculateStars(
      breakdown.total,
      this.deps.levelData.starThresholds
    );
    this.deps.progressManager.saveProgress(this.deps.level, stars, breakdown.total);

    const birdPositions = this.deps.getBirdPositions();

    this.deps.scene.time.delayedCall(MISC_TIMING_CONFIG.jingleDelayMs, async () => {
      await this.deps.jingles.playWinJingle();
      gameEvents.emit("ui-results", {
        level: this.deps.level,
        score: breakdown.total,
        stars,
        won: true,
        birdPositions,
        breakdown,
      });
    });
  }

  private loseLevel(): void {
    if (this.deps.gameStateManager.isTransitioning()) return;
    this.deps.gameStateManager.triggerLose();

    this.deps.flushCombo();

    const pigPositions = this.deps.pigs.filter((p) => !p.isDestroyed()).map((p) => p.getPosition());
    const breakdown = this.deps.scoringSystem.getBreakdown();

    this.deps.scene.time.delayedCall(MISC_TIMING_CONFIG.jingleDelayMs, async () => {
      await this.deps.jingles.playLoseJingle();
      gameEvents.emit("ui-results", {
        level: this.deps.level,
        score: breakdown.total,
        stars: 0,
        won: false,
        pigPositions,
        breakdown,
      });
    });
  }

  /**
   * Check if early settle is allowed (skip waiting for physics to settle).
   * Early settle is allowed when:
   * 1. All pigs are destroyed (nothing left to damage)
   * 2. No queued fragments (all VFX spawned)
   * 3. No destruction has occurred (blocks can still cascade and add score)
   *
   * NOTE: If ANY destruction occurred, we use normal settle timing to ensure
   * all cascading destruction completes and scores properly.
   */
  canEarlySettle(): boolean {
    // All pigs must be destroyed
    if (this.deps.gameStateManager.getPigsRemaining() > 0) {
      return false;
    }

    // No fragments should be queued
    if (this.deps.vfxManager.hasQueuedFragments?.()) {
      return false;
    }

    // If any destruction occurred, we must wait for full physics settle
    // to ensure all cascading block destruction completes and scores
    const destructionCount = this.deps.destructionTracker.getDestructionCount();
    if (destructionCount > 0) {
      return false;
    }

    // No destruction occurred - safe to settle quickly
    return true;
  }

  isGameOver(): boolean {
    return this.deps.gameStateManager.isGameOver();
  }

  isTransitioning(): boolean {
    return this.deps.gameStateManager.isTransitioning();
  }
}
