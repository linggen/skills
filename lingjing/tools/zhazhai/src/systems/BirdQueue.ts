import Phaser from "phaser";
import { BirdType } from "../types/BirdType";
import { BIRD_PHYSICS, BIRD_ASSET_MAP } from "../config/PhysicsConfig";
import { LEVEL_ATLAS_KEY } from "../config/assetManifest";
import { BirdQueueConfig } from "../config/BirdQueueConfig";
import type { IBirdQueue } from "../interfaces/IBirdQueue";
import type { Position } from "../types/Vector2";
import { getMobileSafeBlendMode } from "../utils/MobileBlendMode";
import { PerformanceManager } from "./PerformanceManager";
import { MobileManager } from "./mobile/MobileManager";

export class BirdQueue implements IBirdQueue {
  private scene: Phaser.Scene;
  private queue: BirdType[] = [];
  private birdSprites: Phaser.GameObjects.Image[] = [];
  private pouchRestPos: Phaser.Math.Vector2;
  private groundY: number;
  private trailEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private dustEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private idleTweens: Map<Phaser.GameObjects.Image, Phaser.Tweens.Tween> = new Map();
  private firstBirdReady: boolean = false;
  private isDestroyed: boolean = false;
  private pendingJump: {
    onBounce: (
      birdSprite: Phaser.GameObjects.Image,
      bounceY: (t: number) => number,
      onComplete: () => void
    ) => void;
    onComplete: (landingX: number, landingY: number) => void;
  } | null = null;

  constructor(scene: Phaser.Scene, pouchRestPos: Phaser.Math.Vector2, groundY: number) {
    this.scene = scene;
    this.pouchRestPos = pouchRestPos;
    this.groundY = groundY;
    this.createParticleEmitters();
  }

  /**
   * Get queue position for a bird at given index
   * First bird is closest to pouch (100px left), subsequent birds further left
   */
  private getQueuePosition(index: number): Position {
    const firstBirdX = this.pouchRestPos.x - BirdQueueConfig.layout.firstBirdOffset;
    const x = firstBirdX - index * BirdQueueConfig.layout.birdSpacing;
    return { x, y: this.groundY };
  }

  getSpawnPosition(): Position {
    return { x: BirdQueueConfig.layout.spawnX, y: this.groundY };
  }

  private createParticleEmitters(): void {
    if (this.scene.textures.exists("vfx")) {
      this.trailEmitter = this.scene.add.particles(0, 0, "vfx", {
        frame: "trace_01",
        lifespan: BirdQueueConfig.trail.lifespan,
        speed: { min: BirdQueueConfig.trail.speedMin, max: BirdQueueConfig.trail.speedMax },
        scale: { start: BirdQueueConfig.trail.scaleStart, end: BirdQueueConfig.trail.scaleEnd },
        alpha: { start: BirdQueueConfig.trail.alphaStart, end: BirdQueueConfig.trail.alphaEnd },
        tint: [...BirdQueueConfig.trail.tints],
        blendMode: getMobileSafeBlendMode(
          PerformanceManager.getQualityMultiplier(this.scene),
          MobileManager.getInstance().isMobile()
        ),
        emitting: false,
      });
      this.trailEmitter.setDepth(BirdQueueConfig.trail.depth);

      this.dustEmitter = this.scene.add.particles(0, 0, "vfx", {
        frame: "smoke_01",
        lifespan: BirdQueueConfig.dust.lifespan,
        speed: { min: BirdQueueConfig.dust.speedMin, max: BirdQueueConfig.dust.speedMax },
        angle: { min: BirdQueueConfig.dust.angleMin, max: BirdQueueConfig.dust.angleMax },
        scale: { start: BirdQueueConfig.dust.scaleStart, end: BirdQueueConfig.dust.scaleEnd },
        alpha: { start: BirdQueueConfig.dust.alphaStart, end: BirdQueueConfig.dust.alphaEnd },
        tint: [...BirdQueueConfig.dust.tints],
        blendMode: "NORMAL",
        emitting: false,
      });
      this.dustEmitter.setDepth(BirdQueueConfig.dust.depth);
    }
  }

  setQueue(birdTypes: BirdType[]): void {
    this.queue = [...birdTypes];

    this.birdSprites.forEach((sprite) => sprite.destroy());
    this.birdSprites = [];
    this.idleTweens.forEach((tween) => tween.stop());
    this.idleTweens.clear();

    this.firstBirdReady = false;
    this.pendingJump = null;

    this.animateWalkIn();
  }

  private animateWalkIn(): void {
    const birdTextures: Record<BirdType, string> = {
      [BirdType.RED]: "alienPink_round",
      [BirdType.YELLOW]: "alienYellow_round",
      [BirdType.BLACK]: "alienBeige_round",
      [BirdType.WHITE]: "alienPink_square",
      [BirdType.BLUE]: "alienBlue_round",
    };

    this.queue.forEach((birdType, index) => {
      const targetPos = this.getQueuePosition(index);
      const texture = birdTextures[birdType];
      const scale = this.getDisplayScale(birdType);

      const sprite = this.scene.add.image(
        BirdQueueConfig.layout.spawnX,
        this.groundY,
        LEVEL_ATLAS_KEY,
        texture
      );

      sprite.setOrigin(0.5, 1);
      sprite.setScale(scale);
      sprite.setDepth(BirdQueueConfig.depth);
      sprite.setAlpha(1);
      this.birdSprites.push(sprite);

      this.animateWalkToPosition(
        sprite,
        targetPos.x,
        targetPos.y,
        index * BirdQueueConfig.walk.staggerDelay,
        index === 0
      );
    });
  }

  private animateWalkToPosition(
    sprite: Phaser.GameObjects.Image,
    targetX: number,
    targetY: number,
    delay: number,
    skipDust: boolean = false,
    onComplete?: () => void
  ): void {
    const startX = sprite.x;
    const walkProgress = { t: 0 };

    this.scene.tweens.add({
      targets: walkProgress,
      t: 1,
      duration: BirdQueueConfig.walk.duration,
      delay: delay,
      ease: "Linear",
      onUpdate: () => {
        const t = walkProgress.t;
        const x = Phaser.Math.Linear(startX, targetX, t);
        const y = targetY;

        const bob =
          Math.sin(t * Math.PI * BirdQueueConfig.walk.bobFrequency) *
          BirdQueueConfig.walk.bobAmplitude;
        sprite.setPosition(x, y + bob);

        sprite.setRotation(
          Math.sin(t * Math.PI * BirdQueueConfig.walk.bobFrequency) *
            BirdQueueConfig.walk.waddleRotation
        );

        if (!skipDust && Math.random() > BirdQueueConfig.walk.dustThreshold && this.dustEmitter) {
          this.dustEmitter.emitParticle(1, x + BirdQueueConfig.dust.offsetX, this.groundY);
        }
      },
      onComplete: () => {
        sprite.setPosition(targetX, targetY);
        sprite.setRotation(0);
        this.startIdleAnimation(sprite);
        onComplete?.();

        const spriteIndex = this.birdSprites.indexOf(sprite);
        if (spriteIndex === 0) {
          this.firstBirdReady = true;

          if (this.pendingJump) {
            const pending = this.pendingJump;
            this.pendingJump = null;
            this.executeJumpToPouch(pending.onBounce, pending.onComplete);
          }
        }
      },
    });
  }

  private startIdleAnimation(sprite: Phaser.GameObjects.Image): void {
    const existingTween = this.idleTweens.get(sprite);
    if (existingTween) {
      existingTween.stop();
    }

    const idleTween = this.scene.tweens.add({
      targets: sprite,
      y: this.groundY - BirdQueueConfig.idle.yOffset,
      duration: BirdQueueConfig.idle.duration,
      yoyo: true,
      repeat: -1,
      ease: BirdQueueConfig.idle.ease,
    });
    this.idleTweens.set(sprite, idleTween);
  }

  private stopIdleAnimation(sprite: Phaser.GameObjects.Image): void {
    const tween = this.idleTweens.get(sprite);
    if (tween) {
      tween.stop();
      this.idleTweens.delete(sprite);
    }
  }

  getNextBird(): BirdType | null {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  popBird(): BirdType | null {
    const bird = this.queue.shift();
    if (bird && this.birdSprites.length > 0) {
      const sprite = this.birdSprites.shift();
      if (sprite) {
        this.stopIdleAnimation(sprite);
        sprite.destroy();
      }
    }
    return bird ?? null;
  }

  peekNext(): BirdType | null {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getQueue(): BirdType[] {
    return [...this.queue];
  }

  private getDisplayScale(birdType: BirdType): number {
    const config = BIRD_PHYSICS[birdType];
    const assetKey = BIRD_ASSET_MAP[birdType];
    const texture = this.scene.textures.get(LEVEL_ATLAS_KEY);
    const frame = texture?.get(assetKey);
    const frameWidth = frame ? frame.cutWidth : 70;
    return (config.radius * 2) / frameWidth;
  }

  jumpToPouch(
    onBounce: (
      birdSprite: Phaser.GameObjects.Image,
      bounceY: (t: number) => number,
      onComplete: () => void
    ) => void,
    onComplete: (landingX: number, landingY: number) => void
  ): void {
    if (this.birdSprites.length === 0 || this.queue.length === 0) {
      onComplete(0, 0);
      return;
    }

    if (!this.firstBirdReady) {
      this.pendingJump = { onBounce, onComplete };
      return;
    }

    this.executeJumpToPouch(onBounce, onComplete);
  }

  private executeJumpToPouch(
    onBounce: (
      birdSprite: Phaser.GameObjects.Image,
      bounceY: (t: number) => number,
      onComplete: () => void
    ) => void,
    onComplete: (landingX: number, landingY: number) => void
  ): void {
    const sprite = this.birdSprites[0];
    const birdType = this.queue[0];
    const scale = this.getDisplayScale(birdType);

    this.stopIdleAnimation(sprite);

    const startX = sprite.x;
    const startY = this.groundY;
    const pouchX = this.pouchRestPos.x;
    const pouchY = this.pouchRestPos.y;

    this.scene.tweens.add({
      targets: sprite,
      scaleX: scale * BirdQueueConfig.jump.anticipationSquashX,
      scaleY: scale * BirdQueueConfig.jump.anticipationSquashY,
      y: startY + BirdQueueConfig.jump.anticipationYOffset,
      duration: BirdQueueConfig.jump.anticipationDuration,
      ease: "Sine.easeIn",
      onComplete: () => {
        const jumpProgress = { t: 0 };

        if (this.trailEmitter) {
          this.trailEmitter.start();
        }

        this.scene.tweens.add({
          targets: jumpProgress,
          t: 1,
          duration: BirdQueueConfig.jump.jumpDuration,
          ease: "Sine.easeOut",
          onUpdate: () => {
            const t = jumpProgress.t;

            const currentX = Phaser.Math.Linear(startX, pouchX, this.easeOutQuad(t));

            const arcY = -BirdQueueConfig.jump.jumpHeight * Math.sin(t * Math.PI);
            const currentY = startY + (pouchY - startY) * t + arcY;

            sprite.setPosition(currentX, currentY);
            sprite.setRotation(t * BirdQueueConfig.jump.fullRotation);

            const vel = Math.cos(t * Math.PI);
            const ss = Math.abs(vel) * BirdQueueConfig.jump.squashStretch;
            if (t < 0.5) {
              sprite.setScale(scale * (1 - ss), scale * (1 + ss));
            } else {
              sprite.setScale(scale * (1 + ss), scale * (1 - ss));
            }

            if (this.trailEmitter && Math.random() > BirdQueueConfig.trail.emitThreshold) {
              this.trailEmitter.emitParticle(
                1,
                currentX + BirdQueueConfig.trail.offsetX,
                currentY + BirdQueueConfig.trail.offsetY
              );
            }
          },
          onComplete: () => {
            if (this.trailEmitter) {
              this.trailEmitter.stop();
            }

            sprite.setOrigin(0.5, 0.5);
            sprite.setPosition(pouchX, pouchY);
            sprite.setRotation(0);
            sprite.setScale(scale, scale);

            onBounce(
              sprite,
              (bounceT: number) => {
                const bounceDepth = BirdQueueConfig.bounce.depth;

                if (bounceT < BirdQueueConfig.bounce.phase1End) {
                  return (
                    pouchY +
                    bounceDepth * this.easeOutQuad(bounceT / BirdQueueConfig.bounce.phase1End)
                  );
                } else if (bounceT < BirdQueueConfig.bounce.phase2End) {
                  const tt =
                    (bounceT - BirdQueueConfig.bounce.phase1End) /
                    (BirdQueueConfig.bounce.phase2End - BirdQueueConfig.bounce.phase1End);
                  const y = pouchY + bounceDepth * (1 - tt);
                  const overshoot =
                    bounceDepth * BirdQueueConfig.bounce.overshootFactor * Math.sin(tt * Math.PI);
                  return y - overshoot;
                } else {
                  const tt =
                    (bounceT - BirdQueueConfig.bounce.phase2End) /
                    (1 - BirdQueueConfig.bounce.phase2End);
                  const bounce =
                    Math.sin(tt * Math.PI * BirdQueueConfig.bounce.settleBounceCount) *
                    (1 - tt) *
                    bounceDepth *
                    BirdQueueConfig.bounce.settleAmplitude;
                  return pouchY - bounce;
                }
              },
              () => {
                this.birdSprites.shift();
                this.queue.shift();
                this.shiftQueue();
                sprite.destroy();
                onComplete(pouchX, pouchY);
              }
            );
          },
        });
      },
    });
  }

  private shiftQueue(): void {
    this.firstBirdReady = false;
    if (this.birdSprites.length === 0) return;

    this.birdSprites.forEach((sprite, index) => {
      const targetPos = this.getQueuePosition(index);

      this.stopIdleAnimation(sprite);
      this.animateWalkToPosition(
        sprite,
        targetPos.x,
        targetPos.y,
        index * BirdQueueConfig.walk.shiftDelay
      );
    });
  }

  private easeOutQuad(t: number): number {
    return t * (2 - t);
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.idleTweens.forEach((tween) => tween.stop());
    this.idleTweens.clear();

    this.birdSprites.forEach((sprite) => sprite.destroy());
    this.birdSprites = [];

    if (this.trailEmitter) {
      this.trailEmitter.destroy();
      this.trailEmitter = null;
    }

    if (this.dustEmitter) {
      this.dustEmitter.destroy();
      this.dustEmitter = null;
    }
  }
}
