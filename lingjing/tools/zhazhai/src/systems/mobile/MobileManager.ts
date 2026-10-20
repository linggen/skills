import { DesignTokens } from "../../config/DesignTokens";
import type { IMobileSettingsProvider } from "../../interfaces/IMobileSettings";
import { executeVibration } from "./GameHapticsManager";

type Orientation = "landscape" | "portrait";
type HapticPattern = "light" | "medium" | "heavy" | "success";

interface OrientationChangeCallback {
  (orientation: Orientation): void;
}

interface ScaleRefreshCallback {
  (): void;
}

/**
 * Central manager for mobile-specific functionality
 */
export class MobileManager {
  private static instance: MobileManager | null = null;
  private settingsProvider?: IMobileSettingsProvider;
  private orientationCallbacks: Set<OrientationChangeCallback> = new Set();
  private scaleRefreshCallbacks: Set<ScaleRefreshCallback> = new Set();
  private currentOrientation: Orientation;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private touchStartY: number = 0;
  private touchStartX: number = 0;

  private constructor() {
    this.currentOrientation = this.detectOrientation();
    this.setupOrientationMonitoring();
  }

  static getInstance(): MobileManager {
    if (!MobileManager.instance) {
      MobileManager.instance = new MobileManager();
    }
    return MobileManager.instance;
  }

  setSettingsProvider(provider: IMobileSettingsProvider): void {
    this.settingsProvider = provider;
  }

  isHapticEnabled(): boolean {
    if (this.settingsProvider) {
      return this.settingsProvider.getSettings().hapticEnabled;
    }
    return DesignTokens.mobile.hapticEnabled;
  }

  isMobile(): boolean {
    if (typeof navigator === "undefined") return false;
    const userAgent = navigator.userAgent || "";
    return /iPhone|iPad|iPod|Android/i.test(userAgent);
  }

  isTouchDevice(): boolean {
    if (typeof window === "undefined") return false;
    return (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      // @ts-expect-error - Legacy IE property
      navigator.msMaxTouchPoints > 0
    );
  }

  getOrientation(): Orientation {
    return this.currentOrientation;
  }

  isLandscape(): boolean {
    return this.currentOrientation === "landscape";
  }

  onOrientationChange(callback: OrientationChangeCallback): () => void {
    this.orientationCallbacks.add(callback);
    return () => {
      this.orientationCallbacks.delete(callback);
    };
  }

  onScaleRefresh(callback: ScaleRefreshCallback): () => void {
    this.scaleRefreshCallbacks.add(callback);
    return () => {
      this.scaleRefreshCallbacks.delete(callback);
    };
  }

  async requestFullscreen(element?: HTMLElement): Promise<void> {
    if (typeof document === "undefined") return;

    const target = element ?? document.documentElement;

    try {
      if (target.requestFullscreen) {
        await target.requestFullscreen();
      }
      // @ts-expect-error - Safari prefix
      else if (target.webkitRequestFullscreen) {
        // @ts-expect-error - Safari prefix
        await target.webkitRequestFullscreen();
      }
      // @ts-expect-error - Legacy IE
      else if (target.msRequestFullscreen) {
        // @ts-expect-error - Legacy IE
        await target.msRequestFullscreen();
      }
    } catch {
      // Fullscreen request failed or not supported
    }
  }

  async exitFullscreen(): Promise<void> {
    if (typeof document === "undefined") return;

    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
      // @ts-expect-error - Safari prefix
      else if (document.webkitExitFullscreen) {
        // @ts-expect-error - Safari prefix
        await document.webkitExitFullscreen();
      }
      // @ts-expect-error - Legacy IE
      else if (document.msExitFullscreen) {
        // @ts-expect-error - Legacy IE
        await document.msExitFullscreen();
      }
    } catch {
      // Exit fullscreen failed
    }
  }

  isFullscreen(): boolean {
    if (typeof document === "undefined") return false;
    return !!(
      document.fullscreenElement ||
      // @ts-expect-error - Safari prefix
      document.webkitFullscreenElement ||
      // @ts-expect-error - Legacy IE
      document.msFullscreenElement
    );
  }

  async toggleFullscreen(element?: HTMLElement): Promise<void> {
    if (this.isFullscreen()) {
      await this.exitFullscreen();
    } else {
      await this.requestFullscreen(element);
    }
  }

  setupSwipeFullscreen(canvas: HTMLCanvasElement): void {
    if (!this.isMobile()) return;

    let singleFingerTouch = false;

    canvas.addEventListener(
      "touchstart",
      (e) => {
        singleFingerTouch = e.touches.length === 1;
        if (singleFingerTouch) {
          this.touchStartX = e.touches[0].clientX;
          this.touchStartY = e.touches[0].clientY;
        }
      },
      { passive: true }
    );

    canvas.addEventListener(
      "touchend",
      (e) => {
        if (!singleFingerTouch || e.changedTouches.length === 0) return;

        const touchEndY = e.changedTouches[0].clientY;
        const touchEndX = e.changedTouches[0].clientX;
        const deltaY = this.touchStartY - touchEndY;
        const deltaX = Math.abs(touchEndX - this.touchStartX);

        // Only trigger if vertical swipe is dominant and exceeds threshold
        if (deltaX > Math.abs(deltaY) * DesignTokens.mobile.horizontalSwipeRatio) return;
        if (deltaY < DesignTokens.mobile.swipeThresholdPx) return;

        // Swipe up - enable fullscreen
        this.requestFullscreen();
      },
      { passive: true }
    );
  }

  async lockLandscape(): Promise<void> {
    if (typeof screen === "undefined") return;

    try {
      // @ts-expect-error - Orientation lock API
      if (screen.orientation && screen.orientation.lock) {
        // @ts-expect-error - Orientation lock API
        await screen.orientation.lock("landscape");
      }
      // @ts-expect-error - Legacy prefix
      else if (screen.lockOrientation) {
        // @ts-expect-error - Legacy prefix
        screen.lockOrientation("landscape");
      }
    } catch {
      // Orientation lock not supported or failed
    }
  }

  unlockOrientation(): void {
    if (typeof screen === "undefined") return;

    try {
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
      // @ts-expect-error - Legacy prefix
      else if (screen.unlockOrientation) {
        // @ts-expect-error - Legacy prefix
        screen.unlockOrientation();
      }
    } catch {
      // Orientation unlock not supported
    }
  }

  vibrate(pattern: HapticPattern = "light"): void {
    if (!this.isHapticEnabled()) return;
    const value = DesignTokens.mobile.haptic[pattern];
    executeVibration(value);
  }

  getRecommendedTouchTargetSize(): number {
    if (this.isMobile()) {
      return DesignTokens.touch.recommendedSize;
    }
    return DesignTokens.touch.minSize;
  }

  getAimHitboxRadius(): number {
    return this.isTouchDevice()
      ? DesignTokens.mobile.aimHitboxRadius
      : DesignTokens.mobile.desktopAimHitboxRadius;
  }

  getGestureDragThreshold(): number {
    return DesignTokens.mobile.gestureDragThreshold;
  }

  private detectOrientation(): Orientation {
    if (typeof window === "undefined") return "landscape";

    // Use screen.orientation if available
    if (screen?.orientation?.type) {
      return screen.orientation.type.startsWith("portrait") ? "portrait" : "landscape";
    }

    // Fallback to window dimensions
    return window.innerWidth > window.innerHeight ? "landscape" : "portrait";
  }

  private setupOrientationMonitoring(): void {
    if (typeof window === "undefined") return;

    const handleOrientationChange = () => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        const newOrientation = this.detectOrientation();
        if (newOrientation !== this.currentOrientation) {
          this.currentOrientation = newOrientation;
          this.notifyOrientationChange();
        }
      }, DesignTokens.mobile.orientationChangeDebounce);
    };

    window.addEventListener("resize", handleOrientationChange);
    window.addEventListener("orientationchange", handleOrientationChange);
  }

  private notifyOrientationChange(): void {
    this.orientationCallbacks.forEach((callback) => {
      try {
        callback(this.currentOrientation);
      } catch {
        // Callback error - ignore
      }
    });

    // Trigger scale refresh after orientation change with a short delay
    // to allow the browser to complete the resize
    setTimeout(() => {
      this.notifyScaleRefresh();
    }, DesignTokens.mobile.scaleRefreshDelay);
  }

  private notifyScaleRefresh(): void {
    this.scaleRefreshCallbacks.forEach((callback) => {
      try {
        callback();
      } catch {
        // Callback error - ignore
      }
    });
  }

  static destroy(): void {
    MobileManager.instance = null;
  }
}
