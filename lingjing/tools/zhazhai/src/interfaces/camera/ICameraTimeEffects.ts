import type { ITimeEffectsSettingsProvider } from "../ITimeEffectsSettings";

export interface ICameraTimeEffects {
  slowMotion(duration?: number, scale?: number): void;
  isInSlowMotion(): boolean;
  hitPause(durationMs?: number): void;
  hitPauseFromMaterial(material: string): void;
  setTimeEffectsSettings(settings: ITimeEffectsSettingsProvider): void;
}
