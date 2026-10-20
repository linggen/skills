import type { LevelData } from "../../data/levels";
import type { IProgressManager, LevelProgress } from "./IProgressManager";

export class ProgressManager implements IProgressManager {
  private static readonly LEVEL_KEY_PREFIX = "angry-aliens-level-";
  private static readonly MAX_LEVEL_KEY = "angry-aliens-max-level";

  public saveProgress(levelId: number, stars: number, score: number): void {
    try {
      const key = ProgressManager.LEVEL_KEY_PREFIX + levelId;
      const existing = this.loadProgress(levelId);

      const existingStars = existing?.stars ?? 0;
      const existingScore = existing?.score ?? 0;

      if (stars > existingStars || score > existingScore) {
        localStorage.setItem(
          key,
          JSON.stringify({
            stars: Math.max(stars, existingStars),
            score: Math.max(score, existingScore),
            completed: true,
          })
        );
      }

      const maxUnlocked = this.getMaxUnlockedLevel();
      if (levelId >= maxUnlocked) {
        localStorage.setItem(ProgressManager.MAX_LEVEL_KEY, String(levelId + 1));
      }
    } catch (e) {
      console.warn("Could not save progress:", e);
    }
  }

  public loadProgress(levelId: number): LevelProgress | null {
    try {
      const key = ProgressManager.LEVEL_KEY_PREFIX + levelId;
      const data = localStorage.getItem(key);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn("Could not load progress:", e);
    }
    return null;
  }

  public getMaxUnlockedLevel(): number {
    try {
      return parseInt(localStorage.getItem(ProgressManager.MAX_LEVEL_KEY) || "1", 10);
    } catch {
      return 1;
    }
  }

  public isLevelUnlocked(levelId: number): boolean {
    return levelId <= this.getMaxUnlockedLevel();
  }

  public calculateStars(score: number, thresholds: LevelData["starThresholds"]): number {
    if (score >= thresholds.threeStars) return 3;
    if (score >= thresholds.twoStars) return 2;
    return 1;
  }

  public clearAllProgress(): void {
    try {
      for (let i = 1; i <= 100; i++) {
        localStorage.removeItem(ProgressManager.LEVEL_KEY_PREFIX + i);
      }
      localStorage.removeItem(ProgressManager.MAX_LEVEL_KEY);
    } catch (e) {
      console.warn("Could not clear progress:", e);
    }
  }

  public static loadMaxUnlockedLevel(): number {
    try {
      return parseInt(localStorage.getItem(ProgressManager.MAX_LEVEL_KEY) || "1", 10);
    } catch {
      return 1;
    }
  }

  public static getLevelProgress(levelId: number): LevelProgress | null {
    try {
      const data = localStorage.getItem(ProgressManager.LEVEL_KEY_PREFIX + levelId);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // Silently ignore parse errors
    }
    return null;
  }
}
