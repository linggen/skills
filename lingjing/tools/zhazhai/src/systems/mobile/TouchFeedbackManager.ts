import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import type { IMobileSettingsProvider } from "../../interfaces/IMobileSettings";

export type TouchFeedbackType = "tap" | "aim" | "fire" | "drag";

export interface TouchFeedbackManagerDeps {
  scene: Phaser.Scene;
  settingsProvider?: IMobileSettingsProvider;
}

/**
 * Manages visual and haptic touch feedback
 */
export class TouchFeedbackManager {
  private settingsProvider?: IMobileSettingsProvider;

  constructor(deps: TouchFeedbackManagerDeps) {
    this.settingsProvider = deps.settingsProvider;
  }

  showTapFeedback(_screenX: number, _screenY: number, type: TouchFeedbackType = "tap"): void {
    switch (type) {
      case "aim":
        this.showAimFeedback();
        break;
      case "fire":
        this.showFireFeedback();
        break;
      case "drag":
        this.showDragFeedback();
        break;
      default:
        this.vibrate("light");
    }
  }

  private isHapticEnabled(): boolean {
    if (this.settingsProvider) {
      return this.settingsProvider.getSettings().hapticEnabled;
    }
    return T.mobile.hapticEnabled;
  }

  vibrate(pattern: "light" | "medium" | "heavy" | "success" = "light"): void {
    if (!this.isHapticEnabled()) return;
    if (!navigator.vibrate) return;

    const hapticConfig = T.mobile.haptic;
    const value = hapticConfig[pattern];
    navigator.vibrate(Array.isArray(value) ? [...value] : (value as number));
  }

  showAimFeedback(): void {
    this.vibrate("medium");
  }

  showFireFeedback(): void {
    this.vibrate("heavy");
  }

  showDragFeedback(): void {
    this.vibrate("light");
  }

  destroy(): void {}
}
