import type {
  ITimeEffectsSettingsProvider,
  TimeEffectsSettings,
} from "../interfaces/ITimeEffectsSettings";
import { MISC_TIMING_CONFIG } from "../config/TimingConfig";

export class TimeEffectsSettingsStore implements ITimeEffectsSettingsProvider {
  private static readonly STORAGE_KEY = "angry-aliens-time-effects-settings";

  private settings: TimeEffectsSettings;
  private listeners: Set<(settings: TimeEffectsSettings) => void> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingNotification = false;

  constructor() {
    this.settings = this.loadFromStorage();
  }

  getSettings(): TimeEffectsSettings {
    return { ...this.settings };
  }

  setHitPauseEnabled(enabled: boolean): void {
    if (this.settings.hitPauseEnabled === enabled) return;
    this.settings.hitPauseEnabled = enabled;
    this.saveToStorage();
    this.scheduleNotification();
  }

  setSlowMotionEnabled(enabled: boolean): void {
    if (this.settings.slowMotionEnabled === enabled) return;
    this.settings.slowMotionEnabled = enabled;
    this.saveToStorage();
    this.scheduleNotification();
  }

  setScreenFlashEnabled(enabled: boolean): void {
    if (this.settings.screenFlashEnabled === enabled) return;
    this.settings.screenFlashEnabled = enabled;
    this.saveToStorage();
    this.scheduleNotification();
  }

  onChange(callback: (settings: TimeEffectsSettings) => void): void {
    this.listeners.add(callback);
  }

  offChange(callback: (settings: TimeEffectsSettings) => void): void {
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
    }, MISC_TIMING_CONFIG.settingsDebounceMs);
  }

  private notifyListeners(): void {
    const snapshot = this.getSettings();
    this.listeners.forEach((cb) => {
      try {
        cb(snapshot);
      } catch (e) {
        console.error("[TimeEffectsSettingsStore] Error in listener callback", e);
      }
    });
  }

  private loadFromStorage(): TimeEffectsSettings {
    try {
      const stored = localStorage.getItem(TimeEffectsSettingsStore.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          hitPauseEnabled: parsed.hitPauseEnabled ?? false,
          slowMotionEnabled: parsed.slowMotionEnabled ?? false,
          screenFlashEnabled: parsed.screenFlashEnabled ?? true,
        };
      }
    } catch {
      // Ignore parse errors
    }
    return this.getDefaultSettings();
  }

  private saveToStorage(): void {
    localStorage.setItem(TimeEffectsSettingsStore.STORAGE_KEY, JSON.stringify(this.settings));
  }

  private getDefaultSettings(): TimeEffectsSettings {
    return {
      hitPauseEnabled: false,
      slowMotionEnabled: false,
      screenFlashEnabled: true,
    };
  }
}
