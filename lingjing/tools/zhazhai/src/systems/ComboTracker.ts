import Phaser from "phaser";
import { COMBO_CONFIG } from "../config/PhysicsConfig";
import type { IScorePopupManager } from "../interfaces/IScorePopupManager";
import type { IScoringSystem } from "../systems/scoring/IScoringSystem";

export interface ComboTrackerDeps {
  scene: Phaser.Scene;
  scorePopupManager: IScorePopupManager;
  scoringSystem: IScoringSystem;
}

interface DestructionEvent {
  x: number;
  y: number;
  points: number;
  time: number;
}

export class ComboTracker {
  private deps: ComboTrackerDeps;
  private config: typeof COMBO_CONFIG;
  private events: DestructionEvent[] = [];
  private comboTimeout: Phaser.Time.TimerEvent | null = null;
  private currentComboCount: number = 0;
  private isDestroyed: boolean = false;

  constructor(deps: ComboTrackerDeps) {
    this.deps = deps;
    this.config = COMBO_CONFIG;
  }

  onDestruction(x: number, y: number, points: number): void {
    if (this.isDestroyed) return;

    const now = this.deps.scene.time.now;

    this.events.push({ x, y, points, time: now });

    let writeIdx = 0;
    for (let i = 0; i < this.events.length; i++) {
      if (now - this.events[i].time < this.config.windowMs) {
        this.events[writeIdx++] = this.events[i];
      }
    }
    this.events.length = writeIdx;

    this.currentComboCount = this.events.length;

    this.comboTimeout?.remove();

    this.comboTimeout = this.deps.scene.time.delayedCall(this.config.windowMs, () =>
      this.finalizeCombo()
    );
  }

  private finalizeCombo(): void {
    if (this.currentComboCount >= this.config.minCount) {
      const avgX = this.events.reduce((sum, e) => sum + e.x, 0) / this.events.length;
      const avgY = this.events.reduce((sum, e) => sum + e.y, 0) / this.events.length;

      this.deps.scorePopupManager.showCombo(avgX, avgY + 70, this.currentComboCount);

      const bonus = this.currentComboCount * this.config.bonusPerLevel;
      this.deps.scoringSystem.addComboBonus(bonus);
      this.deps.scorePopupManager.show(avgX, avgY + 70, bonus);
    }

    this.events = [];
    this.currentComboCount = 0;
  }

  getCurrentCombo(): number {
    return this.currentComboCount;
  }

  /**
   * Immediately finalize any pending combo instead of waiting for the timeout.
   * Call this at physics-settle time to ensure combo points are credited before
   * the score is captured for the results screen.
   */
  flushCombo(): void {
    if (!this.comboTimeout) return;
    this.comboTimeout.remove();
    this.comboTimeout = null;
    this.finalizeCombo();
  }

  destroy(): void {
    this.isDestroyed = true;
    this.comboTimeout?.remove();
    this.events = [];
  }
}
