export interface AudioSettings {
  musicEnabled: boolean;
  sfxEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
}

export interface ISettingsProvider {
  getSettings(): AudioSettings;
  setMusicEnabled(enabled: boolean): void;
  setSfxEnabled(enabled: boolean): void;
  setMusicVolume(volume: number): void;
  setSfxVolume(volume: number): void;
  onChange(callback: (settings: AudioSettings) => void): void;
  offChange(callback: (settings: AudioSettings) => void): void;
}
