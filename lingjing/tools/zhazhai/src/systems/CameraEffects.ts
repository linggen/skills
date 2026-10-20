import Phaser from "phaser";
import { BlockMaterial } from "../constants/Materials";
import type { ICameraEffects } from "../interfaces/ICameraEffects";
import type { ITimeEffectsSettingsProvider } from "../interfaces/ITimeEffectsSettings";
import { materialRegistry } from "../config/registries/MaterialConfigRegistry";
import type { Offset } from "../types/Vector2";
import { CAMERA_EFFECTS_CONFIG } from "../config/VFXConfig";

interface ShakeConfig {
  intensity: number;
  duration: number;
  frequency?: number;
  decay?: boolean;
  direction?: "random" | "horizontal" | "vertical";
}

interface ActiveShake {
  startTime: number;
  duration: number;
  intensity: number;
  frequency: number;
  decay: boolean;
  direction: "random" | "horizontal" | "vertical";
  lastShakeTime: number;
}

export class CameraEffects implements ICameraEffects {
  private scene: Phaser.Scene;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private flashOverlay: Phaser.GameObjects.Rectangle | null = null;
  private pulseOverlay: Phaser.GameObjects.Rectangle | null = null;
  private maxShakeIntensity: number = CAMERA_EFFECTS_CONFIG.maxShakeIntensity;
  private isSlowMotion: boolean = false;
  private slowMotionTween: Phaser.Tweens.Tween | null = null;
  private flashTween: Phaser.Tweens.Tween | null = null;
  private shakeOffset: Offset = { x: 0, y: 0 };
  private prevShakeOffset: Offset = { x: 0, y: 0 };
  private activeShakes: ActiveShake[] = [];
  private pendingTimers: Phaser.Time.TimerEvent[] = [];
  private updateCallback: () => void;
  private destroyed: boolean = false;
  private timeEffectsSettings: ITimeEffectsSettingsProvider | null = null;
  private updateRegistered: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.createOverlays();

    this.updateCallback = this.updateShakes.bind(this);
  }

  private registerUpdate(): void {
    if (!this.updateRegistered && !this.destroyed) {
      this.scene.events.on("update", this.updateCallback);
      this.updateRegistered = true;
    }
  }

  private unregisterUpdate(): void {
    if (this.updateRegistered) {
      this.scene.events.off("update", this.updateCallback);
      this.updateRegistered = false;
    }
  }

  setTimeEffectsSettings(settings: ITimeEffectsSettingsProvider): void {
    this.timeEffectsSettings = settings;
  }

  private createOverlays(): void {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;

    this.flashOverlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0);
    this.flashOverlay.setDepth(CAMERA_EFFECTS_CONFIG.flashOverlayDepth);
    this.flashOverlay.setScrollFactor(0);

    this.pulseOverlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0);
    this.pulseOverlay.setDepth(CAMERA_EFFECTS_CONFIG.pulseOverlayDepth);
    this.pulseOverlay.setScrollFactor(0);
  }

  private updateShakes(): void {
    if (this.destroyed || this.activeShakes.length === 0) {
      this.shakeOffset.x = 0;
      this.shakeOffset.y = 0;
      this.unregisterUpdate();
      return;
    }

    const now = this.scene.time.now;
    const newShakes: ActiveShake[] = [];

    for (const shake of this.activeShakes) {
      const elapsed = now - shake.startTime;
      if (elapsed >= shake.duration) {
        continue;
      }

      if (now - shake.lastShakeTime < 1000 / shake.frequency) {
        newShakes.push(shake);
        continue;
      }
      shake.lastShakeTime = now;

      const progress = elapsed / shake.duration;
      const decayFactor = shake.decay ? 1 - progress : 1;
      const currentIntensity = shake.intensity * decayFactor * this.camera.width;

      let offsetX = 0;
      let offsetY = 0;

      const randomAngle = Math.random() * Math.PI * 2;

      switch (shake.direction) {
        case "horizontal":
          offsetX = (Math.random() - 0.5) * 2 * currentIntensity;
          break;
        case "vertical":
          offsetY = (Math.random() - 0.5) * 2 * currentIntensity;
          break;
        default:
          offsetX = Math.cos(randomAngle) * currentIntensity * (Math.random() * 0.5 + 0.5);
          offsetY = Math.sin(randomAngle) * currentIntensity * (Math.random() * 0.5 + 0.5);
      }

      this.shakeOffset.x = Phaser.Math.Linear(
        this.shakeOffset.x,
        offsetX,
        CAMERA_EFFECTS_CONFIG.shake.lerpSmoothing
      );
      this.shakeOffset.y = Phaser.Math.Linear(
        this.shakeOffset.y,
        offsetY,
        CAMERA_EFFECTS_CONFIG.shake.lerpSmoothing
      );

      newShakes.push(shake);
    }

    this.activeShakes = newShakes;

    this.camera.scrollX -= this.prevShakeOffset.x;
    this.camera.scrollY -= this.prevShakeOffset.y;
    this.camera.scrollX += this.shakeOffset.x;
    this.camera.scrollY += this.shakeOffset.y;
    this.prevShakeOffset.x = this.shakeOffset.x;
    this.prevShakeOffset.y = this.shakeOffset.y;

    if (this.activeShakes.length === 0) {
      this.shakeOffset.x = 0;
      this.shakeOffset.y = 0;
      this.prevShakeOffset.x = 0;
      this.prevShakeOffset.y = 0;
      this.unregisterUpdate();
    }
  }

  public shake(
    intensity: number,
    duration: number = CAMERA_EFFECTS_CONFIG.shake.defaultDuration
  ): void {
    if (this.destroyed) return;
    const clampedIntensity = Math.min(intensity, this.maxShakeIntensity);
    this.camera.shake(duration, clampedIntensity);
  }

  public advancedShake(config: ShakeConfig): void {
    if (this.destroyed) return;

    const clampedIntensity = Math.min(config.intensity, this.maxShakeIntensity);

    this.activeShakes.push({
      startTime: this.scene.time.now,
      duration: config.duration,
      intensity: clampedIntensity,
      frequency: config.frequency ?? CAMERA_EFFECTS_CONFIG.shake.frequency,
      decay: config.decay ?? true,
      direction: config.direction ?? "random",
      lastShakeTime: 0,
    });

    this.registerUpdate();
  }

  public shakeFromImpact(impactSpeed: number, material?: string): void {
    const mat = material as BlockMaterial | undefined;
    const threshold =
      mat === BlockMaterial.EXPLOSIVE
        ? CAMERA_EFFECTS_CONFIG.impact.explosiveThreshold
        : CAMERA_EFFECTS_CONFIG.impact.normalThreshold;
    if (impactSpeed < threshold) return;

    const cameraConfig = mat ? materialRegistry.getCamera(mat) : null;
    const multiplier =
      cameraConfig?.shakeMultiplier ?? CAMERA_EFFECTS_CONFIG.shake.defaultMultiplier;
    const normalizedSpeed = Math.min(
      impactSpeed / CAMERA_EFFECTS_CONFIG.impact.speedNormalization,
      1
    );

    const duration =
      CAMERA_EFFECTS_CONFIG.impact.baseDurationMin +
      normalizedSpeed * CAMERA_EFFECTS_CONFIG.impact.baseDurationMax * multiplier;
    const intensity = normalizedSpeed * CAMERA_EFFECTS_CONFIG.impact.baseIntensity * multiplier;

    if (mat === BlockMaterial.EXPLOSIVE) {
      this.advancedShake({
        intensity,
        duration,
        frequency: CAMERA_EFFECTS_CONFIG.shake.explosiveFrequency,
        decay: true,
        direction: "random",
      });
    } else {
      this.camera.shake(duration, Math.min(intensity, this.maxShakeIntensity));
    }
  }

  public directionalShake(
    impactX: number,
    impactY: number,
    intensity: number,
    duration: number = CAMERA_EFFECTS_CONFIG.shake.defaultDuration
  ): void {
    const cameraCenterX = this.camera.scrollX + this.camera.width / 2;
    const cameraCenterY = this.camera.scrollY + this.camera.height / 2;

    const dx = cameraCenterX - impactX;
    const dy = cameraCenterY - impactY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 1) return;

    const clampedIntensity = Math.min(intensity, this.maxShakeIntensity);

    this.advancedShake({
      intensity: clampedIntensity,
      duration,
      frequency: CAMERA_EFFECTS_CONFIG.shake.frequency,
      decay: true,
      direction: Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical",
    });
  }

  public flash(
    color: number = CAMERA_EFFECTS_CONFIG.flash.defaultColor,
    intensity: number = CAMERA_EFFECTS_CONFIG.flash.defaultIntensity
  ): void {
    if (!this.flashOverlay) return;

    const flashEnabled = this.timeEffectsSettings?.getSettings().screenFlashEnabled ?? false;
    if (!flashEnabled) return;

    const worldView = this.camera.worldView;

    this.flashOverlay.setPosition(worldView.centerX, worldView.centerY);
    this.flashOverlay.setSize(worldView.width, worldView.height);
    this.flashOverlay.setScrollFactor(1);
    this.flashOverlay.setScale(1);
    this.flashOverlay.setFillStyle(color, intensity);
    this.flashOverlay.setAlpha(1);

    if (this.flashTween) {
      this.flashTween.stop();
    }

    this.flashTween = this.scene.tweens.add({
      targets: this.flashOverlay,
      alpha: 0,
      duration: CAMERA_EFFECTS_CONFIG.flash.duration,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.flashTween = null;
      },
    });
  }

  public pulse(
    worldX: number,
    worldY: number,
    color: number = CAMERA_EFFECTS_CONFIG.pulse.defaultColor,
    intensity: number = CAMERA_EFFECTS_CONFIG.pulse.defaultIntensity,
    duration: number = CAMERA_EFFECTS_CONFIG.pulse.defaultDuration
  ): void {
    if (!this.pulseOverlay) return;

    const zoom = this.camera.zoom;
    const screenX = (worldX - this.camera.scrollX) * zoom;
    const screenY = (worldY - this.camera.scrollY) * zoom;
    const zoomScale = 1 / zoom;

    this.pulseOverlay.setFillStyle(color, 0);
    this.pulseOverlay.setAlpha(0);
    this.pulseOverlay.setPosition(screenX, screenY);

    this.scene.tweens.add({
      targets: this.pulseOverlay,
      alpha: { from: intensity, to: 0 },
      scaleX: {
        from: CAMERA_EFFECTS_CONFIG.pulse.scaleFrom * zoomScale,
        to: CAMERA_EFFECTS_CONFIG.pulse.scaleTo * zoomScale,
      },
      scaleY: {
        from: CAMERA_EFFECTS_CONFIG.pulse.scaleFrom * zoomScale,
        to: CAMERA_EFFECTS_CONFIG.pulse.scaleTo * zoomScale,
      },
      duration,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (this.pulseOverlay) {
          this.pulseOverlay.setAlpha(0);
          this.pulseOverlay.setScale(1);
          this.pulseOverlay.setPosition(this.camera.width / 2, this.camera.height / 2);
        }
      },
    });
  }

  public flashFromImpact(impactSpeed: number, material?: string): void {
    const mat = material as BlockMaterial | undefined;
    if (
      mat !== BlockMaterial.EXPLOSIVE &&
      impactSpeed < CAMERA_EFFECTS_CONFIG.flash.explosiveThreshold
    )
      return;
    if (impactSpeed < CAMERA_EFFECTS_CONFIG.flash.normalThreshold) return;

    const cameraConfig = mat ? materialRegistry.getCamera(mat) : null;
    const color = cameraConfig?.flashColor ?? CAMERA_EFFECTS_CONFIG.flash.defaultColor;
    const normalizedSpeed = Math.min(
      impactSpeed / CAMERA_EFFECTS_CONFIG.impact.speedNormalization,
      1
    );

    const baseIntensity =
      mat === BlockMaterial.EXPLOSIVE
        ? CAMERA_EFFECTS_CONFIG.flash.explosiveIntensity
        : CAMERA_EFFECTS_CONFIG.flash.normalIntensity;
    const intensity = normalizedSpeed * baseIntensity;

    this.flash(color, intensity);
  }

  public slowMotion(
    duration: number = CAMERA_EFFECTS_CONFIG.slowMotion.defaultDuration,
    scale: number = CAMERA_EFFECTS_CONFIG.slowMotion.defaultScale
  ): void {
    if (this.destroyed) return;
    if (this.timeEffectsSettings && !this.timeEffectsSettings.getSettings().slowMotionEnabled)
      return;

    if (this.slowMotionTween) {
      this.slowMotionTween.stop();
    }

    // Apply timeScale to both Phaser time and Matter.js engine
    this.scene.time.timeScale = scale;
    const engine = this.scene.matter?.world?.engine;
    if (engine) {
      engine.timing.timeScale = scale;
    }

    // Tween wrapper to drive both timeScales in sync
    const timeScaleProxy = { value: scale };
    this.slowMotionTween = this.scene.tweens.add({
      targets: timeScaleProxy,
      value: 1,
      duration: duration,
      ease: "Quad.easeOut",
      onUpdate: () => {
        this.scene.time.timeScale = timeScaleProxy.value;
        if (engine) {
          engine.timing.timeScale = timeScaleProxy.value;
        }
      },
      onComplete: () => {
        this.scene.time.timeScale = 1;
        if (engine) {
          engine.timing.timeScale = 1;
        }
        this.isSlowMotion = false;
        this.slowMotionTween = null;
      },
    });
    this.isSlowMotion = true;
  }

  public isInSlowMotion(): boolean {
    return this.isSlowMotion;
  }

  public hitPause(durationMs: number = CAMERA_EFFECTS_CONFIG.hitPause.defaultDuration): void {
    if (this.destroyed) return;
    if (this.timeEffectsSettings && !this.timeEffectsSettings.getSettings().hitPauseEnabled) return;

    durationMs = this.timeEffectsSettings?.getSettings().slowMotionEnabled
      ? durationMs / CAMERA_EFFECTS_CONFIG.slowMotion.hitPauseDivisor
      : durationMs;

    this.scene.matter.world.pause();
    const timer = this.scene.time.delayedCall(durationMs, () => {
      if (!this.destroyed && this.scene.matter && this.scene.matter.world) {
        this.scene.matter.world.resume();
      }
      const idx = this.pendingTimers.indexOf(timer);
      if (idx !== -1) {
        this.pendingTimers.splice(idx, 1);
      }
    });
    this.pendingTimers.push(timer);
  }

  public hitPauseFromMaterial(material: string): void {
    const mat = material as BlockMaterial;
    const cameraConfig = materialRegistry.getCamera(mat);
    const duration =
      cameraConfig?.hitPauseDuration ?? CAMERA_EFFECTS_CONFIG.hitPause.defaultDuration;

    this.hitPause(duration);
  }

  public rumble(
    intensity: number = CAMERA_EFFECTS_CONFIG.rumble.defaultIntensity,
    duration: number = CAMERA_EFFECTS_CONFIG.rumble.defaultDuration
  ): void {
    this.camera.shake(duration, intensity);
  }

  public destroy(): void {
    this.destroyed = true;

    this.unregisterUpdate();

    for (const timer of this.pendingTimers) {
      timer.remove();
    }
    this.pendingTimers = [];

    this.activeShakes = [];

    if (this.scene.time) {
      this.scene.time.timeScale = 1;
    }

    const engine = this.scene.matter?.world?.engine;
    if (engine) {
      engine.timing.timeScale = 1;
    }

    if (this.flashOverlay) {
      this.flashOverlay.destroy();
      this.flashOverlay = null;
    }
    if (this.pulseOverlay) {
      this.pulseOverlay.destroy();
      this.pulseOverlay = null;
    }
  }
}

export default CameraEffects;
