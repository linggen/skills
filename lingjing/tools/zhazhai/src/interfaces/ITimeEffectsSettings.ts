export interface TimeEffectsSettings {
  hitPauseEnabled: boolean;
  slowMotionEnabled: boolean;
  screenFlashEnabled: boolean;
}

export interface ITimeEffectsSettingsProvider {
  getSettings(): TimeEffectsSettings;
  setHitPauseEnabled(enabled: boolean): void;
  setSlowMotionEnabled(enabled: boolean): void;
  setScreenFlashEnabled(enabled: boolean): void;
  onChange(callback: (settings: TimeEffectsSettings) => void): void;
  offChange(callback: (settings: TimeEffectsSettings) => void): void;
}
