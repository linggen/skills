import Phaser from "phaser";
import { GameConfig } from "../config/GameConfig";
import {
  FRAGMENT_BODY_CONFIG,
  PHYSICS_QUALITY_CONFIG,
  DEVICE_DETECTION_CONFIG,
  FRAGMENT_DEVICE_DETECTION_CONFIG,
} from "../config/PhysicsConfig";
import { EXPLOSION_SHADER_VFX_CONFIG } from "../config/VFXConfig";

export type PerformanceMode = "auto" | "high" | "medium" | "low";

const LOW_END_GPU_PATTERNS = [
  /PowerVR.*GX6450/i,
  /Apple GPU.*A8/i,
  /Mali-4\d{2}/i,
  /Adreno 3\d{2}/i,
];

export interface PhysicsQualityProfile {
  positionIterations: number;
  velocityIterations: number;
  constraintIterations: number;
}

const PERFORMANCE_MODES: PerformanceMode[] = ["auto", "high", "medium", "low"];

const PERFORMANCE_MODE_LABELS: Record<PerformanceMode, string> = {
  auto: "Auto",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export class PerformanceManager {
  private static readonly STORAGE_KEY = "angry-aliens.performanceMode";

  public static getAvailableModes(): readonly PerformanceMode[] {
    return PERFORMANCE_MODES;
  }

  public static getModeLabel(mode: PerformanceMode): string {
    return PERFORMANCE_MODE_LABELS[mode];
  }

  public static getNextPerformanceMode(mode: PerformanceMode): PerformanceMode {
    const index = PERFORMANCE_MODES.indexOf(mode);
    const nextIndex = index >= 0 ? (index + 1) % PERFORMANCE_MODES.length : 0;
    return PERFORMANCE_MODES[nextIndex];
  }

  public static getPreviousPerformanceMode(mode: PerformanceMode): PerformanceMode {
    const index = PERFORMANCE_MODES.indexOf(mode);
    const previousIndex =
      index >= 0 ? (index - 1 + PERFORMANCE_MODES.length) % PERFORMANCE_MODES.length : 0;
    return PERFORMANCE_MODES[previousIndex];
  }

  private static cachedMode: PerformanceMode | null = null;

  public static getPerformanceMode(): PerformanceMode {
    if (PerformanceManager.cachedMode !== null) {
      return PerformanceManager.cachedMode;
    }

    if (typeof window === "undefined") {
      return "auto";
    }

    const storedMode = window.localStorage.getItem(PerformanceManager.STORAGE_KEY);
    if (
      storedMode === "auto" ||
      storedMode === "high" ||
      storedMode === "medium" ||
      storedMode === "low"
    ) {
      PerformanceManager.cachedMode = storedMode;
      return storedMode;
    }

    PerformanceManager.cachedMode = "auto";
    return "auto";
  }

  public static setPerformanceMode(mode: PerformanceMode): void {
    PerformanceManager.cachedMode = mode;
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(PerformanceManager.STORAGE_KEY, mode);
  }

  public static getQualityMultiplier(scene: Phaser.Scene): number {
    const mode = PerformanceManager.getPerformanceMode();
    const modeMultiplier = PerformanceManager.getModeMultiplier(mode);

    if (mode !== "auto") {
      return modeMultiplier;
    }

    const fpsMultiplier = PerformanceManager.getFpsMultiplier(scene);
    return Math.max(0.25, Math.min(modeMultiplier, fpsMultiplier));
  }

  public static getScaledCount(
    scene: Phaser.Scene,
    baseCount: number,
    minCount: number = 1
  ): number {
    if (baseCount <= 0) {
      return 0;
    }

    return Math.max(
      minCount,
      Math.round(baseCount * PerformanceManager.getQualityMultiplier(scene))
    );
  }

  public static shouldRunFragmentDamage(scene: Phaser.Scene): boolean {
    return PerformanceManager.getQualityMultiplier(scene) >= 0.5;
  }

  public static getFragmentVertexLimit(scene: Phaser.Scene): number {
    const multiplier = PerformanceManager.getQualityMultiplier(scene);
    return multiplier >= FRAGMENT_BODY_CONFIG.qualityThreshold
      ? FRAGMENT_BODY_CONFIG.vertexLimits.high
      : FRAGMENT_BODY_CONFIG.vertexLimits.low;
  }

  public static getPhysicsQualityProfile(scene: Phaser.Scene): PhysicsQualityProfile {
    const multiplier = PerformanceManager.getQualityMultiplier(scene);

    if (multiplier >= PHYSICS_QUALITY_CONFIG.high.threshold) {
      return {
        positionIterations: PHYSICS_QUALITY_CONFIG.high.positionIterations,
        velocityIterations: PHYSICS_QUALITY_CONFIG.high.velocityIterations,
        constraintIterations: PHYSICS_QUALITY_CONFIG.high.constraintIterations,
      };
    }

    if (multiplier >= PHYSICS_QUALITY_CONFIG.medium.threshold) {
      return {
        positionIterations: PHYSICS_QUALITY_CONFIG.medium.positionIterations,
        velocityIterations: PHYSICS_QUALITY_CONFIG.medium.velocityIterations,
        constraintIterations: PHYSICS_QUALITY_CONFIG.medium.constraintIterations,
      };
    }

    return {
      positionIterations: PHYSICS_QUALITY_CONFIG.low.positionIterations,
      velocityIterations: PHYSICS_QUALITY_CONFIG.low.velocityIterations,
      constraintIterations: PHYSICS_QUALITY_CONFIG.low.constraintIterations,
    };
  }

  private static getModeMultiplier(mode: PerformanceMode): number {
    switch (mode) {
      case "high":
        return 1.0;
      case "medium":
        return 0.6;
      case "low":
        return 0.25;
      case "auto":
      default:
        return PerformanceManager.getDetectedDeviceMultiplier();
    }
  }

  private static getDetectedDeviceMultiplier(): number {
    if (typeof navigator === "undefined" || typeof window === "undefined") {
      return 1.0;
    }

    const userAgent = navigator.userAgent || "";
    const isMobile = /iPhone|iPad|iPod|Android/i.test(userAgent);
    const hardwareConcurrency = navigator.hardwareConcurrency ?? 4;
    const minScreenDimension = Math.min(window.screen.width, window.screen.height);

    if (!isMobile) {
      return 1.0;
    }

    if (
      /iPhone|iPod/i.test(userAgent) &&
      hardwareConcurrency <= DEVICE_DETECTION_CONFIG.lowEndCpuCores
    ) {
      return DEVICE_DETECTION_CONFIG.lowEndMobileMultiplier;
    }

    if (
      minScreenDimension <= DEVICE_DETECTION_CONFIG.smallScreenDimension ||
      hardwareConcurrency <= 4
    ) {
      return DEVICE_DETECTION_CONFIG.smallScreenMultiplier;
    }

    if (window.devicePixelRatio > 3) {
      return DEVICE_DETECTION_CONFIG.smallScreenMultiplier;
    }

    return DEVICE_DETECTION_CONFIG.highEndMobileMultiplier;
  }

  private static getFpsMultiplier(scene: Phaser.Scene): number {
    const fps = scene.game.loop.actualFps;
    const throttle = GameConfig.fpsThrottle;

    if (fps >= throttle.high.fps) return throttle.high.rate;
    if (fps >= throttle.medium.fps) return throttle.medium.rate;
    if (fps >= throttle.low.fps) return throttle.low.rate;
    return throttle.critical.rate;
  }

  private static cachedLowEndGPUResults: Map<number, boolean> = new Map();

  private static checkLowEndGPU(scene: Phaser.Scene, threshold: number): boolean {
    const cached = PerformanceManager.cachedLowEndGPUResults.get(threshold);
    if (cached !== undefined) {
      return cached;
    }

    const renderer = scene.game.renderer;
    if (!("gl" in renderer)) {
      PerformanceManager.cachedLowEndGPUResults.set(threshold, true);
      return true;
    }

    const gl = renderer.gl as WebGLRenderingContext;
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");

    if (debugInfo) {
      const rendererStr = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "";
      if (LOW_END_GPU_PATTERNS.some((p) => p.test(rendererStr))) {
        PerformanceManager.cachedLowEndGPUResults.set(threshold, true);
        return true;
      }
    }

    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const result = maxTextureSize <= threshold;
    PerformanceManager.cachedLowEndGPUResults.set(threshold, result);
    return result;
  }

  public static isLowEndGPU(scene: Phaser.Scene): boolean {
    return PerformanceManager.checkLowEndGPU(scene, 2048);
  }

  public static isLowEndGPUForExplosionShader(scene: Phaser.Scene): boolean {
    return PerformanceManager.checkLowEndGPU(
      scene,
      EXPLOSION_SHADER_VFX_CONFIG.maxTextureSizeThreshold
    );
  }

  private static cachedLowEndCPU: boolean | null = null;

  public static isLowEndCPU(): boolean {
    if (PerformanceManager.cachedLowEndCPU !== null) {
      return PerformanceManager.cachedLowEndCPU;
    }

    const hardwareConcurrency =
      navigator.hardwareConcurrency || FRAGMENT_DEVICE_DETECTION_CONFIG.defaultHardwareConcurrency;
    const deviceMemory =
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory ||
      FRAGMENT_DEVICE_DETECTION_CONFIG.defaultDeviceMemory;

    PerformanceManager.cachedLowEndCPU =
      hardwareConcurrency <= FRAGMENT_DEVICE_DETECTION_CONFIG.lowEndConcurrencyThreshold ||
      deviceMemory <= FRAGMENT_DEVICE_DETECTION_CONFIG.lowEndMemoryThreshold;

    return PerformanceManager.cachedLowEndCPU;
  }
}
