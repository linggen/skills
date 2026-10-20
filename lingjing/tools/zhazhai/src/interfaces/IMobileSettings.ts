export interface MobileSettings {
  hapticEnabled: boolean;
}

export interface IMobileSettingsProvider {
  getSettings(): MobileSettings;
  setHapticEnabled(enabled: boolean): void;
  onChange(callback: (settings: MobileSettings) => void): void;
  offChange(callback: (settings: MobileSettings) => void): void;
}
