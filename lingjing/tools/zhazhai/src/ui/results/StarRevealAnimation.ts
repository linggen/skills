import Phaser from "phaser";
import { DesignTokens as T } from "../../config/DesignTokens";
import { getMobileSafeBlendMode } from "../../utils/MobileBlendMode";
import { PerformanceManager } from "../../systems/PerformanceManager";
import { MobileManager } from "../../systems/mobile/MobileManager";

export interface StarRevealConfig {
  x: number;
  y: number;
  earnedStars: number;
  totalStars: number;
  starSize?: number;
  spacing?: number;
  startDelay?: number;
  onComplete?: () => void;
}

export class StarRevealAnimation extends Phaser.GameObjects.Container {
  private stars: Phaser.GameObjects.Image[] = [];
  private starSize: number;
  private spacing: number;
  private currentRevealIndex: number = 0;
  private revealComplete: boolean = false;
  private activeTimers: Phaser.Time.TimerEvent[] = [];
  private onCompleteCallback?: () => void;
  private sparkleEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor(scene: Phaser.Scene, config: StarRevealConfig) {
    super(scene, config.x, config.y);

    this.starSize = config.starSize ?? T.star.size;
    this.spacing = config.spacing ?? T.star.spacing;
    this.onCompleteCallback = config.onComplete;

    this.createSparkleEmitter();
    this.createStars(config.totalStars, config.earnedStars);
    this.startReveal(config.startDelay ?? 0);

    scene.add.existing(this);
  }

  private createSparkleEmitter(): void {
    if (this.scene.textures.exists("vfx")) {
      this.sparkleEmitter = this.scene.add.particles(0, 0, "vfx", {
        frame: "star_01",
        speed: { min: 50, max: 100 },
        angle: { min: 0, max: 360 },
        scale: { start: T.star.particleScale, end: 0 },
        lifespan: 500,
        blendMode: getMobileSafeBlendMode(
          PerformanceManager.getQualityMultiplier(this.scene),
          MobileManager.getInstance().isMobile()
        ),
        quantity: 10,
        emitting: false,
        frequency: -1,
      });

      this.sparkleEmitter.setActive(false);
      this.sparkleEmitter.setVisible(false);
      this.add(this.sparkleEmitter);
    }
  }

  private createStars(total: number, earned: number): void {
    const totalWidth = (total - 1) * this.spacing;
    const startX = -totalWidth / 2;

    for (let i = 0; i < total; i++) {
      const starX = startX + i * this.spacing;
      const isEarned = i < earned;

      const star = this.scene.add.image(starX, 0, "UI", "icon_star");
      star.setScale(0);
      star.setAlpha(0);
      star.setOrigin(0.5);
      star.setData("earned", isEarned);
      star.setData("index", i);

      this.stars.push(star);
      this.add(star);
    }
  }

  private startReveal(delay: number): void {
    const timer = this.scene.time.delayedCall(delay, () => {
      this.revealNextStar();
    });
    this.activeTimers.push(timer);
  }

  private revealNextStar(): void {
    if (this.revealComplete) return;

    if (this.currentRevealIndex >= this.stars.length) {
      this.revealComplete = true;
      if (this.onCompleteCallback) this.onCompleteCallback();
      return;
    }

    const star = this.stars[this.currentRevealIndex];
    const isEarned = star.getData("earned") as boolean;
    const isLastStar = this.currentRevealIndex === this.stars.length - 1;
    const scale = this.starSize / 70;

    if (isEarned) {
      star.setTint(0xffd700);
    }

    this.scene.tweens.add({
      targets: star,
      scale: scale,
      alpha: 1,
      duration: T.star.revealDuration,
      ease: T.easing.bounce,
      onComplete: () => {
        if (this.revealComplete) return;
        if (isEarned) {
          this.emitSparkles(star.x, star.y);
        } else {
          star.setTint(0x555555);
          star.setAlpha(0.5);
        }
        if (isLastStar) {
          this.revealComplete = true;
          if (this.onCompleteCallback) this.onCompleteCallback();
        }
      },
    });

    this.currentRevealIndex++;

    if (this.currentRevealIndex < this.stars.length) {
      const timer = this.scene.time.delayedCall(T.star.revealDelay, () => {
        this.revealNextStar();
      });
      this.activeTimers.push(timer);
    }
  }

  private emitSparkles(x: number, _y: number): void {
    if (!this.sparkleEmitter) return;

    this.sparkleEmitter.setPosition(x, 0);
    this.sparkleEmitter.setActive(true);
    this.sparkleEmitter.setVisible(true);
    this.sparkleEmitter.explode(10);
  }

  isComplete(): boolean {
    return this.revealComplete;
  }

  skip(): void {
    // Stop all pending timers
    this.activeTimers.forEach((timer) => timer.destroy());
    this.activeTimers = [];

    // Stop all tweens on stars
    this.stars.forEach((star) => {
      this.scene.tweens.killTweensOf(star);
    });

    // Set final visual state
    this.stars.forEach((star) => {
      const isEarned = star.getData("earned") as boolean;
      const scale = this.starSize / 70;

      star.setScale(scale);
      star.setAlpha(1);

      if (isEarned) {
        star.setTint(0xffd700);
      } else {
        star.setTint(0x555555);
        star.setAlpha(0.5);
      }
    });

    this.revealComplete = true;
  }
}
