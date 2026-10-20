import type { IMobileSettingsProvider, MobileSettings } from "../../interfaces/IMobileSettings";
import { MISC_TIMING_CONFIG } from "../../config/TimingConfig";

export class MobileSettingsStore implements IMobileSettingsProvider {
  private static readonly STORAGE_KEY = "angry-aliens-mobile-settings";

  private settings: MobileSettings;
  private listeners: Set<(settings: MobileSettings) => void> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingNotification = false;

  constructor() {
    this.settings = this.loadFromStorage();
  }

  getSettings(): MobileSettings {
    return { ...this.settings };
  }

  setHapticEnabled(enabled: boolean): void {
    if (this.settings.hapticEnabled === enabled) return;
    this.settings.hapticEnabled = enabled;
    this.saveToStorage();
    this.scheduleNotification();
  }

  onChange(callback: (settings: MobileSettings) => void): void {
    this.listeners.add(callback);
  }

  offChange(callback: (settings: MobileSettings) => void): void {
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
        console.error("[MobileSettingsStore] Error in listener callback", e);
      }
    });
  }

  private loadFromStorage(): MobileSettings {
    try {
      const stored = localStorage.getItem(MobileSettingsStore.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          hapticEnabled: parsed.hapticEnabled ?? true,
        };
      }
    } catch {
      // Ignore parse errors
    }
    return this.getDefaultSettings();
  }

  private saveToStorage(): void {
    localStorage.setItem(MobileSettingsStore.STORAGE_KEY, JSON.stringify(this.settings));
  }

  private getDefaultSettings(): MobileSettings {
    return {
      hapticEnabled: true,
    };
  }
}
