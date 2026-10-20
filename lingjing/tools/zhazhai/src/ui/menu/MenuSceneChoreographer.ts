import Phaser from "phaser";
import {
  MenuTitleConfig,
  MenuBounceConfig,
  MenuIdleConfig,
  MenuStarsConfig,
  MenuStarParticleConfig,
  MenuTimingConfig,
  MenuButtonsConfig,
} from "../../config/MenuConfig";
import { getMobileSafeBlendMode } from "../../utils/MobileBlendMode";
import { PerformanceManager } from "../../systems/PerformanceManager";
import { MobileManager } from "../../systems/mobile/MobileManager";

export interface ChoreographerConfig {
  scene: Phaser.Scene;
  centerX: number;
  centerY: number;
  viewportWidth: number;
  viewportHeight: number;
  onButtonsReady?: () => void;
  onComplete?: () => void;
}

interface TitleElements {
  container: Phaser.GameObjects.Container;
  text: Phaser.GameObjects.Text;
  shadow: Phaser.GameObjects.Text;
  glow: Phaser.GameObjects.Text;
  outerGlow?: Phaser.GameObjects.Text;
}

export class MenuSceneChoreographer {
  private scene: Phaser.Scene;
  private centerX: number;
  private viewportHeight: number;
  private titleElements: TitleElements | null = null;

  private onButtonsReady?: () => void;
  private onComplete?: () => void;

  private isDestroyed: boolean = false;

  constructor(config: ChoreographerConfig) {
    this.scene = config.scene;
    this.centerX = config.centerX;
    this.viewportHeight = config.viewportHeight;
    this.onButtonsReady = config.onButtonsReady;
    this.onComplete = config.onComplete;
  }

  startEntrance(): void {
    this.playEntranceSequence();
  }

  private playEntranceSequence(): void {
    this.showTitle();

    this.scene.time.delayedCall(MenuTimingConfig.buttonsReadyDelay, () => {
      if (this.isDestroyed) return;
      if (this.onButtonsReady) {
        this.onButtonsReady();
      }
    });

    this.scene.time.delayedCall(MenuTimingConfig.onCompleteDelay, () => {
      if (this.isDestroyed) return;
      if (this.onComplete) {
        this.onComplete();
      }
    });
  }

  private showTitle(): void {
    const titleY = this.viewportHeight * MenuTitleConfig.titleYPercent;
    const startY = MenuTitleConfig.startY;
    const _blend = getMobileSafeBlendMode(
      PerformanceManager.getQualityMultiplier(this.scene),
      MobileManager.getInstance().isMobile()
    );

    const container = this.scene.add.container(this.centerX, startY);
    container.setDepth(MenuTitleConfig.depth);

    const outerGlow = this.scene.add.text(0, 0, MenuTitleConfig.text, {
      fontFamily: MenuTitleConfig.fontFamily,
      fontSize: `${MenuTitleConfig.outerGlow.fontSize}px`,
      color: MenuTitleConfig.outerGlow.color,
    });
    outerGlow.setOrigin(0.5);
    outerGlow.setAlpha(0);
    outerGlow.setBlendMode(_blend);

    const innerGlow = this.scene.add.text(0, 0, MenuTitleConfig.text, {
      fontFamily: MenuTitleConfig.fontFamily,
      fontSize: `${MenuTitleConfig.innerGlow.fontSize}px`,
      color: MenuTitleConfig.innerGlow.color,
    });
    innerGlow.setOrigin(0.5);
    innerGlow.setAlpha(0);
    innerGlow.setBlendMode(_blend);

    const shadow = this.scene.add.text(
      MenuTitleConfig.shadow.offsetX,
      MenuTitleConfig.shadow.offsetY,
      MenuTitleConfig.text,
      {
        fontFamily: MenuTitleConfig.fontFamily,
        fontSize: `${MenuTitleConfig.shadow.fontSize}px`,
        color: MenuTitleConfig.shadow.color,
      }
    );
    shadow.setOrigin(0.5);
    shadow.setAlpha(MenuTitleConfig.shadow.alpha);

    const titleText = this.scene.add.text(0, 0, MenuTitleConfig.text, {
      fontFamily: MenuTitleConfig.fontFamily,
      fontSize: `${MenuTitleConfig.mainText.fontSize}px`,
      color: MenuTitleConfig.mainText.color,
      stroke: MenuTitleConfig.mainText.stroke,
      strokeThickness: MenuTitleConfig.mainText.strokeThickness,
    });
    titleText.setOrigin(0.5);

    container.add([outerGlow, innerGlow, shadow, titleText]);
    container.setRotation(MenuTitleConfig.rotation.start);
    container.setScale(MenuTitleConfig.scale.start);

    this.titleElements = { container, text: titleText, shadow, glow: innerGlow, outerGlow };

    this.scene.tweens.add({
      targets: container,
      y: titleY + MenuTitleConfig.entrance.overshootY,
      rotation: MenuTitleConfig.rotation.bounce,
      scale: MenuTitleConfig.scale.overshoot,
      duration: MenuTitleConfig.entrance.duration,
      ease: MenuTitleConfig.entrance.ease,
      onComplete: () => {
        this.playTitleBounce(container, titleText, shadow, innerGlow, outerGlow, titleY);
      },
    });
  }

  private playTitleBounce(
    container: Phaser.GameObjects.Container,
    titleText: Phaser.GameObjects.Text,
    shadow: Phaser.GameObjects.Text,
    innerGlow: Phaser.GameObjects.Text,
    outerGlow: Phaser.GameObjects.Text,
    finalY: number
  ): void {
    const bounces = MenuBounceConfig.phases.map((phase) => ({
      y: finalY + phase.y,
      rot: phase.rot,
      squashX: phase.squashX,
      squashY: phase.squashY,
      dur: phase.dur,
    }));

    let bounceIndex = 0;

    const doBounce = () => {
      if (bounceIndex >= bounces.length) {
        this.playTitleSettle(container, titleText, shadow, innerGlow, outerGlow);
        return;
      }

      const b = bounces[bounceIndex];

      this.scene.tweens.add({
        targets: container,
        y: b.y,
        rotation: b.rot,
        duration: b.dur,
        ease: "Quad.out",
      });

      this.scene.tweens.add({
        targets: [titleText, shadow],
        scaleX: b.squashX,
        scaleY: b.squashY,
        duration: b.dur * 0.8,
        ease: "Quad.out",
      });

      if (bounceIndex === 1) {
        this.scene.tweens.add({
          targets: innerGlow,
          alpha: MenuBounceConfig.innerGlow.alpha,
          scaleX: MenuBounceConfig.innerGlow.scale,
          scaleY: MenuBounceConfig.innerGlow.scale,
          duration: MenuBounceConfig.innerGlow.duration,
          ease: "Quad.out",
        });
        this.scene.tweens.add({
          targets: outerGlow,
          alpha: MenuBounceConfig.outerGlow.alpha,
          scaleX: MenuBounceConfig.outerGlow.scale,
          scaleY: MenuBounceConfig.outerGlow.scale,
          duration: MenuBounceConfig.outerGlow.duration,
          ease: "Quad.out",
        });
        this.spawnTitleStars(finalY);
      }

      bounceIndex++;
      this.scene.time.delayedCall(b.dur, doBounce);
    };

    doBounce();
  }

  private playTitleSettle(
    container: Phaser.GameObjects.Container,
    titleText: Phaser.GameObjects.Text,
    shadow: Phaser.GameObjects.Text,
    innerGlow: Phaser.GameObjects.Text,
    outerGlow: Phaser.GameObjects.Text
  ): void {
    this.scene.tweens.add({
      targets: [titleText, shadow],
      scaleX: 1,
      scaleY: 1,
      duration: MenuBounceConfig.settle.duration,
      ease: MenuBounceConfig.settle.ease,
    });

    this.scene.tweens.add({
      targets: container,
      rotation: MenuTitleConfig.rotation.settle[0],
      duration: 60,
      ease: "Quad.out",
      onComplete: () => {
        this.scene.tweens.add({
          targets: container,
          rotation: MenuTitleConfig.rotation.settle[1],
          duration: 50,
          ease: "Quad.out",
          onComplete: () => {
            this.scene.tweens.add({
              targets: container,
              rotation: MenuTitleConfig.rotation.settle[2],
              duration: 70,
              ease: "Quad.out",
            });
          },
        });
      },
    });

    this.scene.tweens.add({
      targets: innerGlow,
      alpha: 0.18,
      scaleX: 1,
      scaleY: 1,
      duration: 350,
      ease: "Quad.out",
    });

    this.scene.tweens.add({
      targets: outerGlow,
      alpha: 0.1,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 400,
      ease: "Quad.out",
      onComplete: () => {
        this.startTitleIdleAnimation(container, innerGlow, outerGlow);
      },
    });
  }

  private spawnTitleStars(titleY: number): void {
    const _blend = getMobileSafeBlendMode(
      PerformanceManager.getQualityMultiplier(this.scene),
      MobileManager.getInstance().isMobile()
    );
    if (!this.scene.textures.exists("star_particle")) {
      const graphics = this.scene.add.graphics();
      graphics.fillStyle(0xffffff);
      graphics.beginPath();
      const size = MenuStarParticleConfig.size;
      const cx = size;
      const cy = size;
      for (let i = 0; i < 5; i++) {
        const angle = (i * 144 - 90) * (Math.PI / 180);
        const outerX = cx + Math.cos(angle) * size * 0.6;
        const outerY = cy + Math.sin(angle) * size * 0.6;
        const innerAngle = angle + 72 * (Math.PI / 180);
        const innerX = cx + Math.cos(innerAngle) * size * 0.25;
        const innerY = cy + Math.sin(innerAngle) * size * 0.25;
        if (i === 0) {
          graphics.moveTo(outerX, outerY);
        } else {
          graphics.lineTo(outerX, outerY);
        }
        graphics.lineTo(innerX, innerY);
      }
      graphics.closePath();
      graphics.fillPath();
      graphics.generateTexture(
        "star_particle",
        MenuStarParticleConfig.textureSize,
        MenuStarParticleConfig.textureSize
      );
      graphics.destroy();
    }

    if (!this.scene.textures.exists("spark_circle")) {
      const graphics = this.scene.add.graphics();
      graphics.fillStyle(0xffffff);
      graphics.fillCircle(
        MenuStarParticleConfig.circleRadius,
        MenuStarParticleConfig.circleRadius,
        MenuStarParticleConfig.circleRadius
      );
      graphics.generateTexture(
        "spark_circle",
        MenuStarParticleConfig.circleTextureSize,
        MenuStarParticleConfig.circleTextureSize
      );
      graphics.destroy();
    }

    const halfWidth = MenuStarsConfig.titleWidth / 2;

    for (let i = 0; i < MenuStarsConfig.count; i++) {
      const progress = i / MenuStarsConfig.count;
      const startX =
        this.centerX -
        halfWidth +
        progress * MenuStarsConfig.titleWidth +
        (Math.random() - 0.5) * MenuStarsConfig.spreadRange;
      const distance = MenuStarsConfig.distanceMin + Math.random() * MenuStarsConfig.distanceMax;
      const isCircle = Math.random() > MenuStarsConfig.circleThreshold;
      const texture = isCircle ? "spark_circle" : "star_particle";
      const particle = this.scene.add.image(startX, titleY, texture);
      particle.setDepth(MenuTitleConfig.particleDepth);
      particle.setTint(MenuStarsConfig.colors[i % MenuStarsConfig.colors.length]);
      particle.setScale(0);
      particle.setAlpha(1);
      particle.setBlendMode(_blend);

      const spreadAngle = Math.random() * Math.PI - Math.PI / 2;
      const targetX = startX + Math.cos(spreadAngle) * distance;
      const targetY = titleY + Math.sin(spreadAngle) * distance * 0.6 - 30;

      const targetScale = isCircle
        ? MenuStarsConfig.targetScaleMin + Math.random() * MenuStarsConfig.targetScaleMax
        : MenuStarsConfig.starTargetScaleMin + Math.random() * MenuStarsConfig.starTargetScaleMax;

      this.scene.tweens.add({
        targets: particle,
        x: targetX,
        y: targetY,
        scale: { from: 0, to: targetScale },
        alpha: { from: 1, to: 0 },
        rotation: isCircle ? 0 : { from: 0, to: (Math.random() - 0.5) * Math.PI * 2 },
        duration: MenuStarsConfig.durationMin + Math.random() * MenuStarsConfig.durationMax,
        delay: i * MenuStarsConfig.delayPerStar,
        ease: "Quad.out",
        onComplete: () => particle.destroy(),
      });
    }

    for (let i = 0; i < MenuStarsConfig.sparkleCount; i++) {
      const startX = this.centerX - halfWidth + Math.random() * MenuStarsConfig.titleWidth;
      const distance =
        MenuStarsConfig.sparkleDistanceMin + Math.random() * MenuStarsConfig.sparkleDistanceMax;
      const sparkle = this.scene.add.image(startX, titleY, "spark_circle");
      sparkle.setDepth(MenuTitleConfig.sparkleDepth);
      sparkle.setTint(0xffffff);
      sparkle.setScale(0);
      sparkle.setAlpha(0);
      sparkle.setBlendMode(_blend);

      const spreadAngle = Math.random() * Math.PI - Math.PI / 2;
      const targetX = startX + Math.cos(spreadAngle) * distance;
      const targetY = titleY + Math.sin(spreadAngle) * distance * 0.5;

      this.scene.tweens.add({
        targets: sparkle,
        x: targetX,
        y: targetY,
        scale: { from: MenuStarsConfig.sparkleScaleFrom, to: MenuStarsConfig.sparkleScaleTo },
        alpha: { from: MenuStarsConfig.sparkleAlphaFrom, to: 0 },
        duration: MenuStarsConfig.sparkleDuration,
        delay: MenuStarsConfig.sparkleDelayBase + i * MenuStarsConfig.sparkleDelayPerStar,
        ease: "Quad.out",
        onComplete: () => sparkle.destroy(),
      });
    }
  }

  private startTitleIdleAnimation(
    container: Phaser.GameObjects.Container,
    innerGlow: Phaser.GameObjects.Text,
    outerGlow: Phaser.GameObjects.Text
  ): void {
    this.scene.tweens.add({
      targets: container,
      y: `+=${MenuIdleConfig.container.yOffset}`,
      scaleX: MenuIdleConfig.container.scaleX,
      scaleY: MenuIdleConfig.container.scaleY,
      duration: MenuIdleConfig.container.duration,
      yoyo: true,
      repeat: -1,
      ease: MenuIdleConfig.container.ease,
    });

    this.scene.tweens.add({
      targets: innerGlow,
      alpha: MenuIdleConfig.innerGlow.alpha,
      scaleX: MenuIdleConfig.innerGlow.scale,
      scaleY: MenuIdleConfig.innerGlow.scale,
      duration: MenuIdleConfig.innerGlow.duration,
      yoyo: true,
      repeat: -1,
      ease: MenuIdleConfig.innerGlow.ease,
    });

    this.scene.tweens.add({
      targets: outerGlow,
      alpha: MenuIdleConfig.outerGlow.alpha,
      scaleX: MenuIdleConfig.outerGlow.scale,
      scaleY: MenuIdleConfig.outerGlow.scale,
      duration: MenuIdleConfig.outerGlow.duration,
      yoyo: true,
      repeat: -1,
      ease: MenuIdleConfig.outerGlow.ease,
      delay: MenuIdleConfig.outerGlow.delay,
    });
  }

  animateButtons(buttons: Phaser.GameObjects.Container[]): void {
    buttons.forEach((button, index) => {
      button.setScale(0);
      button.setAlpha(0);

      this.scene.tweens.add({
        targets: button,
        scale: 1,
        alpha: 1,
        duration: MenuButtonsConfig.duration,
        delay: MenuButtonsConfig.delays[index] ?? index * MenuButtonsConfig.defaultDelay,
        ease: MenuButtonsConfig.ease,
      });
    });
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.titleElements) {
      this.scene.tweens.killTweensOf(this.titleElements.container);
      this.scene.tweens.killTweensOf(this.titleElements.text);
      this.scene.tweens.killTweensOf(this.titleElements.shadow);
      if (this.titleElements.glow) {
        this.scene.tweens.killTweensOf(this.titleElements.glow);
      }
      if (this.titleElements.outerGlow) {
        this.scene.tweens.killTweensOf(this.titleElements.outerGlow);
      }
      this.titleElements.container.destroy();
      this.titleElements = null;
    }
  }
}
