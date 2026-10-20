import Phaser from "phaser";
import { IScorePopupManager, ScorePopupConfig } from "../interfaces/IScorePopupManager";
import type { ITimeEffectsSettingsProvider } from "../interfaces/ITimeEffectsSettings";
import {
  SCORE_POPUP_RANDOMIZATION,
  COMBO_INDICATOR_CONFIG,
  type ComboIndicatorConfig,
  SCORE_POPUP_MANAGER_CONFIG,
  SCORE_POPUP_THRESHOLDS,
  SCORE_POPUP_POOLS,
  SCORE_POPUP_PROCESSING,
  SCORE_POPUP_DEPTHS,
  SCORE_POPUP_STYLE,
  DAMAGE_NUMBER_CONFIG,
  SCORE_POPUP_CATEGORY_CONFIGS,
} from "../config/VFXConfig";
import { TextPool, ImagePool, RectanglePool } from "../utils/ObjectPool";
import { getMobileSafeBlendMode } from "../utils/MobileBlendMode";
import { PerformanceManager } from "./PerformanceManager";
import { MobileManager } from "./mobile/MobileManager";

type ScorePopupConfigInternal = ScorePopupConfig;

interface QueuedPopup {
  x: number;
  y: number;
  points: number;
  config?: Partial<ScorePopupConfig>;
}

export class ScorePopupManager implements IScorePopupManager {
  private static readonly POPUPS_PER_FRAME = SCORE_POPUP_PROCESSING.popupsPerFrame;
  private static readonly IMMEDIATE_POPUPS = SCORE_POPUP_PROCESSING.immediatePopups;
  private static readonly MAX_QUEUE_PROCESSING_PER_FRAME =
    SCORE_POPUP_PROCESSING.maxQueueProcessingPerFrame;

  private scene: Phaser.Scene;
  private activePopups: Phaser.GameObjects.Text[] = [];
  private defaultFont: string = SCORE_POPUP_STYLE.defaultFont;
  private isDestroyed: boolean = false;
  private textPool: TextPool;
  private comboTextPool: TextPool;
  private starPools: Map<string, ImagePool> = new Map();
  private flashPool: RectanglePool;
  private popupQueue: QueuedPopup[] = [];
  private queueIndex: number = 0;
  private frameCreatedCount: number = 0;
  private vfxSettings: ITimeEffectsSettingsProvider | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.textPool = new TextPool(scene, {
      fontFamily: this.defaultFont,
      fontSize: "32px",
      color: "#ffffff",
      stroke: SCORE_POPUP_STYLE.strokeColor,
      strokeThickness: SCORE_POPUP_STYLE.defaultStrokeThickness,
      align: "center",
    });

    this.comboTextPool = new TextPool(scene, undefined, SCORE_POPUP_POOLS.comboTextPool);

    const starTextures = ["spark_circle", "star_01", "star_02"];
    for (const texture of starTextures) {
      const atlasKey = texture === "spark_circle" ? undefined : "vfx";
      this.starPools.set(
        texture,
        new ImagePool(scene, texture, SCORE_POPUP_POOLS.starPool, atlasKey)
      );
    }

    this.flashPool = new RectanglePool(scene, SCORE_POPUP_POOLS.flashPool);
  }

  setVFXSettings(settings: ITimeEffectsSettingsProvider): void {
    this.vfxSettings = settings;
  }

  public show(x: number, y: number, points: number, config?: Partial<ScorePopupConfig>): void {
    this.popupQueue.push({ x, y, points, config });

    if (this.frameCreatedCount < ScorePopupManager.IMMEDIATE_POPUPS) {
      this.processQueue();
    }
  }

  public processQueue(): void {
    if (this.isDestroyed) return;

    // Calculate how many items remain to process
    const remainingInQueue = this.popupQueue.length - this.queueIndex;
    if (remainingInQueue === 0) {
      // Reset queue when fully processed
      this.popupQueue = [];
      this.queueIndex = 0;
      return;
    }

    const budget = Math.max(0, ScorePopupManager.POPUPS_PER_FRAME - this.frameCreatedCount);
    const toProcess = Math.min(
      Math.max(1, budget),
      ScorePopupManager.MAX_QUEUE_PROCESSING_PER_FRAME,
      remainingInQueue
    );

    for (let i = 0; i < toProcess; i++) {
      const data = this.popupQueue[this.queueIndex++];
      if (data) {
        this.createPopupInternal(data.x, data.y, data.points, data.config);
        this.frameCreatedCount++;
      }
    }

    // Clean up fully processed queue
    if (this.queueIndex >= this.popupQueue.length) {
      this.popupQueue = [];
      this.queueIndex = 0;
    }
  }

  public resetFrameBudget(): void {
    this.frameCreatedCount = 0;
  }

  public hasQueuedPopups(): boolean {
    return this.popupQueue.length - this.queueIndex > 0;
  }

  private static readonly CAMERA_PADDING = SCORE_POPUP_MANAGER_CONFIG.cameraPadding;

  private clampToCamera(
    x: number,
    y: number,
    padding: number = ScorePopupManager.CAMERA_PADDING
  ): { x: number; y: number } {
    const camera = this.scene.cameras.main;
    return {
      x: Phaser.Math.Clamp(x, camera.scrollX + padding, camera.scrollX + camera.width - padding),
      y: Phaser.Math.Clamp(y, camera.scrollY + padding, camera.scrollY + camera.height - padding),
    };
  }

  private createPopupInternal(
    x: number,
    y: number,
    points: number,
    config?: Partial<ScorePopupConfig>
  ): void {
    const sizeCategory = this.getSizeCategory(points);
    const popupConfig = SCORE_POPUP_CATEGORY_CONFIGS[sizeCategory];

    const finalConfig: ScorePopupConfigInternal = {
      ...popupConfig,
      ...config,
    };

    const randConfig = SCORE_POPUP_RANDOMIZATION;
    const offsetX = Phaser.Math.Between(-randConfig.offsetX, randConfig.offsetX);
    const offsetY = Phaser.Math.Between(-randConfig.offsetY, randConfig.offsetY);
    const rotation =
      Phaser.Math.FloatBetween(-randConfig.rotationDegrees, randConfig.rotationDegrees) *
      (Math.PI / 180);

    const { x: finalX, y: finalY } = this.clampToCamera(
      x + offsetX,
      y + offsetY + finalConfig.offsetY
    );

    const text = this.createScoreText(finalX, finalY, points, finalConfig);
    text.setRotation(rotation);
    this.animateScorePopup(text, finalConfig);
  }

  private getSizeCategory(points: number): keyof typeof SCORE_POPUP_CATEGORY_CONFIGS {
    if (points >= SCORE_POPUP_THRESHOLDS.critical) return "critical";
    if (points >= SCORE_POPUP_THRESHOLDS.large) return "large";
    if (points >= SCORE_POPUP_THRESHOLDS.medium) return "medium";
    return "small";
  }

  private createScoreText(
    x: number,
    y: number,
    points: number,
    config: ScorePopupConfigInternal
  ): Phaser.GameObjects.Text {
    const text = this.textPool.acquire();
    text.setPosition(x, y + config.offsetY);
    text.setText(`+${points}`);
    const isHighlight = SCORE_POPUP_STYLE.highlightColors.includes(config.color);
    text.setStyle({
      fontFamily: this.defaultFont,
      fontSize: config.fontSize,
      color: config.color,
      stroke: SCORE_POPUP_STYLE.strokeColor,
      strokeThickness: isHighlight
        ? SCORE_POPUP_STYLE.highlightStrokeThickness
        : SCORE_POPUP_STYLE.defaultStrokeThickness,
      align: "center",
    });
    text.setOrigin(0.5);
    text.setDepth(SCORE_POPUP_DEPTHS.scoreText);
    text.setAlpha(1);

    return text;
  }

  private animateScorePopup(text: Phaser.GameObjects.Text, config: ScorePopupConfigInternal): void {
    this.activePopups.push(text);

    this.scene.tweens.add({
      targets: text,
      y: text.y - SCORE_POPUP_MANAGER_CONFIG.riseDistance,
      alpha: 0,
      scaleX: SCORE_POPUP_MANAGER_CONFIG.scaleMultiplier,
      scaleY: SCORE_POPUP_MANAGER_CONFIG.scaleMultiplier,
      duration: config.duration,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.textPool.release(text);
        const index = this.activePopups.indexOf(text);
        if (index > -1) {
          this.activePopups.splice(index, 1);
        }
      },
    });

    this.scene.tweens.add({
      targets: text,
      scaleX: SCORE_POPUP_MANAGER_CONFIG.bounceScale,
      scaleY: SCORE_POPUP_MANAGER_CONFIG.bounceScale,
      duration: SCORE_POPUP_MANAGER_CONFIG.bounceDuration,
      yoyo: true,
      ease: "Quad.easeInOut",
    });
  }

  public showCombo(x: number, y: number, comboCount: number): void {
    const config = COMBO_INDICATOR_CONFIG;
    const { x: clampedX, y: clampedY } = this.clampToCamera(x, y);

    const text = this.comboTextPool.acquire();
    text.setPosition(clampedX, clampedY - 30);
    text.setText(`${comboCount}x COMBO!`);
    text.setStyle({
      fontFamily: config.text.fontFamily,
      fontSize: config.text.fontSize,
      color: config.text.color,
      stroke: config.text.strokeColor,
      strokeThickness: config.text.strokeThickness,
    });
    text.setOrigin(0.5);
    text.setDepth(SCORE_POPUP_DEPTHS.comboText);
    text.setScale(0);
    text.setAlpha(1);

    this.scene.tweens.add({
      targets: text,
      scaleX: config.animation.bounceScale,
      scaleY: config.animation.bounceScale,
      duration: config.animation.bounceDuration,
      ease: "Back.easeOut",
      onComplete: () => {
        this.scene.tweens.add({
          targets: text,
          scaleX: 1,
          scaleY: 1,
          duration: config.animation.bounceDuration,
          ease: "Quad.easeOut",
        });
      },
    });

    this.scene.tweens.add({
      targets: { wobble: 0 },
      wobble: config.animation.wobbleFrequency * Math.PI * 2,
      duration: config.animation.totalDuration,
      onUpdate: (tween) => {
        const wobbleValue = Math.sin((tween.targets[0] as { wobble: number }).wobble);
        text.x = clampedX + wobbleValue * config.animation.wobbleAmplitude;
      },
    });

    this.scene.tweens.add({
      targets: text,
      y: clampedY - 30 - config.animation.riseDistance,
      alpha: 0,
      delay: config.animation.totalDuration - config.animation.fadeDuration,
      duration: config.animation.fadeDuration,
      ease: "Quad.easeIn",
      onComplete: () => this.comboTextPool.release(text),
    });

    this.spawnComboStars(clampedX, clampedY - 30, config);

    if (comboCount >= config.screenFlash.threshold) {
      const flashEnabled = this.vfxSettings?.getSettings().screenFlashEnabled ?? true;
      if (flashEnabled) {
        this.triggerScreenFlash(config);
      }
    }
  }

  private spawnComboStars(x: number, y: number, config: ComboIndicatorConfig): void {
    const starConfig = config.stars;
    const _blend = getMobileSafeBlendMode(
      PerformanceManager.getQualityMultiplier(this.scene),
      MobileManager.getInstance().isMobile()
    );

    for (let i = 0; i < starConfig.count; i++) {
      const texture = Phaser.Utils.Array.GetRandom(starConfig.textures);
      const color = Phaser.Utils.Array.GetRandom(starConfig.colors);
      const angle = (Math.PI * 2 * i) / starConfig.count;

      const pool = this.starPools.get(texture);
      if (!pool) continue;

      const star = pool.acquire();
      star.setPosition(x, y);
      star.setScale(0);
      star.setTint(color);
      star.setBlendMode(_blend);
      star.setDepth(SCORE_POPUP_DEPTHS.stars);
      star.setAlpha(1);

      this.scene.tweens.add({
        targets: star,
        x: x + Math.cos(angle) * starConfig.burstRadius,
        y: y + Math.sin(angle) * starConfig.burstRadius,
        scaleX: starConfig.scale,
        scaleY: starConfig.scale,
        alpha: 0,
        duration: starConfig.duration,
        ease: "Quad.easeOut",
        onComplete: () => pool.release(star),
      });
    }
  }

  private triggerScreenFlash(config: ComboIndicatorConfig): void {
    const camera = this.scene.cameras.main;
    const zoom = camera.zoom;

    const flash = this.flashPool.acquire(
      this.scene.scale.width / 2,
      this.scene.scale.height / 2,
      this.scene.scale.width,
      this.scene.scale.height,
      config.screenFlash.color,
      config.screenFlash.alpha
    );
    flash.setDepth(SCORE_POPUP_DEPTHS.flash);
    flash.setScrollFactor(0);
    flash.setScale(1 / zoom);

    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: config.screenFlash.duration,
      onComplete: () => this.flashPool.release(flash),
    });
  }

  private static readonly DAMAGE_NUMBER_PADDING = SCORE_POPUP_MANAGER_CONFIG.damageNumberPadding;

  public showDamageNumber(x: number, y: number, damage: number): void {
    const { x: clampedX, y: clampedY } = this.clampToCamera(
      x,
      y,
      ScorePopupManager.DAMAGE_NUMBER_PADDING
    );

    const text = this.textPool.acquire();
    text.setPosition(clampedX, clampedY);
    text.setText(`-${damage}`);
    text.setStyle({
      fontFamily: this.defaultFont,
      fontSize: DAMAGE_NUMBER_CONFIG.fontSize,
      color: DAMAGE_NUMBER_CONFIG.color,
      stroke: SCORE_POPUP_STYLE.strokeColor,
      strokeThickness: DAMAGE_NUMBER_CONFIG.strokeThickness,
    });
    text.setOrigin(0.5);
    text.setDepth(SCORE_POPUP_DEPTHS.damageText);
    text.setAlpha(1);
    text.setScale(1);

    this.scene.tweens.add({
      targets: text,
      y: text.y - SCORE_POPUP_MANAGER_CONFIG.damageRiseDistance,
      alpha: 0,
      duration: SCORE_POPUP_MANAGER_CONFIG.damageDuration,
      ease: "Quad.easeOut",
      onComplete: () => this.textPool.release(text),
    });
  }

  public clearAll(): void {
    this.activePopups.forEach((popup) => {
      this.textPool.release(popup);
    });
    this.activePopups = [];
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.popupQueue = [];
    this.queueIndex = 0;
    this.textPool.destroy();
    this.comboTextPool.destroy();
    this.starPools.forEach((pool) => pool.destroy());
    this.starPools.clear();
    this.flashPool.destroy();
    this.activePopups = [];
  }
}

export default ScorePopupManager;
