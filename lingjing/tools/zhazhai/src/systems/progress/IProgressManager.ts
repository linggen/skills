import type { LevelData } from "../../data/levels";

export interface LevelProgress {
  stars: number;
  score: number;
  completed: boolean;
}

export interface IProgressManager {
  saveProgress(levelId: number, stars: number, score: number): void;
  loadProgress(levelId: number): LevelProgress | null;
  getMaxUnlockedLevel(): number;
  isLevelUnlocked(levelId: number): boolean;
  calculateStars(score: number, thresholds: LevelData["starThresholds"]): number;
  clearAllProgress(): void;
}
