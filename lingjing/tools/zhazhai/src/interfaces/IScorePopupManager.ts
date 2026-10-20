import type { ITimeEffectsSettingsProvider } from "./ITimeEffectsSettings";

export interface ScorePopupConfig {
  fontSize: string;
  color: string;
  offsetY: number;
  duration: number;
}

export interface IScorePopupManager {
  show(x: number, y: number, points: number, config?: Partial<ScorePopupConfig>): void;
  showCombo(x: number, y: number, comboCount: number): void;
  showDamageNumber(x: number, y: number, damage: number): void;
  processQueue(): void;
  resetFrameBudget(): void;
  clearAll(): void;
  destroy(): void;
  setVFXSettings(settings: ITimeEffectsSettingsProvider): void;
}
