import type { ISettingsProvider, AudioSettings } from "../../../interfaces/audio";
import { SETTINGS_DEBOUNCE_MS } from "../config/AudioConfig";

export class SettingsStore implements ISettingsProvider {
  private static readonly STORAGE_KEY = "angry-aliens-audio-settings";

  private settings: AudioSettings;
  private listeners: Set<(settings: AudioSettings) => void> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingNotification = false;

  constructor() {
    this.settings = this.loadFromStorage();
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  setMusicEnabled(enabled: boolean): void {
    if (this.settings.musicEnabled === enabled) return;
    this.settings.musicEnabled = enabled;
    this.saveToStorage();
    this.scheduleNotification();
  }

  setSfxEnabled(enabled: boolean): void {
    if (this.settings.sfxEnabled === enabled) return;
    this.settings.sfxEnabled = enabled;
    this.saveToStorage();
    this.scheduleNotification();
  }

  setMusicVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    if (this.settings.musicVolume === clamped) return;
    this.settings.musicVolume = clamped;
    this.saveToStorage();
    this.scheduleNotification();
  }

  setSfxVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    if (this.settings.sfxVolume === clamped) return;
    this.settings.sfxVolume = clamped;
    this.saveToStorage();
    this.scheduleNotification();
  }

  onChange(callback: (settings: AudioSettings) => void): void {
    this.listeners.add(callback);
  }

  offChange(callback: (settings: AudioSettings) => void): void {
    this.listeners.delete(callback);
  }

  private scheduleNotification(): void {
    this.pendingNotification = true;

    if (this.debounceTimer) return;

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.pendingNotification) {
        this.notifyListeners();
        this.pendingNotification = false;
      }
    }, SETTINGS_DEBOUNCE_MS);
  }

  private notifyListeners(): void {
    const snapshot = this.getSettings();
    this.listeners.forEach((cb) => {
      try {
        cb(snapshot);
      } catch (e) {
        console.error("[SettingsStore] Error in listener callback", e);
      }
    });
  }

  private loadFromStorage(): AudioSettings {
    try {
      const stored = localStorage.getItem(SettingsStore.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          musicEnabled: parsed.musicEnabled ?? true,
          sfxEnabled: parsed.sfxEnabled ?? true,
          musicVolume: Math.max(0, Math.min(1, parsed.musicVolume ?? 0.5)),
          sfxVolume: Math.max(0, Math.min(1, parsed.sfxVolume ?? 1.0)),
        };
      }
    } catch {
      // Ignore parse errors
    }
    return this.getDefaultSettings();
  }

  private saveToStorage(): void {
    localStorage.setItem(SettingsStore.STORAGE_KEY, JSON.stringify(this.settings));
  }

  private getDefaultSettings(): AudioSettings {
    return {
      musicEnabled: true,
      sfxEnabled: true,
      musicVolume: 0.3,
      sfxVolume: 1.0,
    };
  }
}
