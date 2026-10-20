// 砸寨 御物 (Hanli 10-20: queued throws walking and hopping to the sling 「有点不太make sense」 — option A, 「按A改」):
// upstream queued living aliens that walked in along the ground and hopped into the pouch. 砸寨's throws are things
// (石子, 飞剑, 陶罐, 五雷符), so they rest in a bamboo basket (竹篮) beside the slingshot, each one showing, and when
// it is a thing's turn it rises out of the basket on a wisp of 灵光 (a halo and a few sparkles), bobs at the top, and
// floats into the pouch. Nothing moves on the ground by itself; a spent thing leaves its slot empty. Reduced motion:
// the thing is simply in the pouch.
import Phaser from "phaser";
import { BirdType } from "../types/BirdType";
import { BIRD_PHYSICS, BIRD_ASSET_MAP } from "../config/PhysicsConfig";
import { BirdQueueConfig } from "../config/BirdQueueConfig";
import type { IBirdQueue } from "../interfaces/IBirdQueue";
import type { Position } from "../types/Vector2";
import { Runtime } from "../zhazhai/runtime";
import { sizeOf, texOf } from "../zhazhai/skin";

type OnBounce = (
  birdSprite: Phaser.GameObjects.Image,
  bounceY: (t: number) => number,
  onComplete: () => void
) => void;

const C = BirdQueueConfig;

export class BirdQueue implements IBirdQueue {
  private scene: Phaser.Scene;
  private queue: BirdType[] = [];
  /** The things in the basket, queue order: [0] goes next (the slot nearest the sling). */
  private items: Phaser.GameObjects.Image[] = [];
  private pouchRestPos: Phaser.Math.Vector2;
  private groundY: number;
  private basketBack: Phaser.GameObjects.Image | null = null;
  private basketFront: Phaser.GameObjects.Image | null = null;
  private sparkles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  /** What a float in progress made, so a teardown mid-float stops it cleanly. */
  private flight: { tweens: Phaser.Tweens.Tween[]; glow: Phaser.GameObjects.Image | null } | null = null;
  private isDestroyed: boolean = false;

  constructor(scene: Phaser.Scene, pouchRestPos: Phaser.Math.Vector2, groundY: number) {
    this.scene = scene;
    this.pouchRestPos = pouchRestPos;
    this.groundY = groundY;
    this.createBasket();
    this.createSparkles();
  }

  private basketX(): number {
    return this.pouchRestPos.x - C.basket.offsetX;
  }

  /** The near rim's top, in world y: things rest just above it, their lower part behind the woven wall. */
  private rimY(): number {
    const h = this.basketFront?.displayHeight ?? C.basket.width * 0.52;
    return this.groundY - h + h * C.basket.rimY;
  }

  /** Slot i of n: centred in the basket, slot 0 at the sling's side. */
  private slotPosition(i: number, n: number): Position {
    const spacing = n > 1 ? Math.min(C.items.spacing, C.items.mouth / (n - 1)) : 0;
    const x = this.basketX() + ((n - 1) / 2 - i) * spacing;
    const y = this.rimY() - C.items.peek + (i % 2) * C.items.stagger;
    return { x, y };
  }

  getSpawnPosition(): Position {
    return this.slotPosition(0, Math.max(1, this.queue.length));
  }

  private createBasket(): void {
    const put = (key: string, depth: number) => {
      if (!this.scene.textures.exists(key)) return null;
      const img = this.scene.add.image(this.basketX(), this.groundY, key).setOrigin(0.5, 1).setDepth(depth);
      img.setScale(C.basket.width / img.width);
      return img;
    };
    this.basketBack = put("zz-basket-back", C.depth.basketBack);
    this.basketFront = put("zz-basket-front", C.depth.basketFront);
  }

  private createSparkles(): void {
    if (!this.scene.textures.exists("vfx")) return;
    this.sparkles = this.scene.add.particles(0, 0, "vfx", {
      frame: [...C.sparkle.frames],
      lifespan: C.sparkle.lifespan,
      speed: { min: C.sparkle.speedMin, max: C.sparkle.speedMax },
      scale: { start: C.sparkle.scaleStart, end: C.sparkle.scaleEnd },
      alpha: { start: C.sparkle.alphaStart, end: C.sparkle.alphaEnd },
      tint: [...C.sparkle.tints],
      blendMode: "ADD",
      emitting: false,
    });
    this.sparkles.setDepth(C.depth.sparkle);
  }

  setQueue(birdTypes: BirdType[]): void {
    this.stopFlight();
    this.queue = [...birdTypes];
    this.items.forEach((s) => s.destroy());
    this.items = this.queue.map((type, i) => {
      const pos = this.slotPosition(i, this.queue.length);
      const img = this.scene.add.image(pos.x, pos.y, ...texOf(BIRD_ASSET_MAP[type]));
      img.setScale(this.getDisplayScale(type) * C.items.scale);
      img.setRotation((i % 2 ? 1 : -1) * C.items.tilt);
      img.setDepth(C.depth.item);
      return img;
    });
  }

  getNextBird(): BirdType | null {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  popBird(): BirdType | null {
    const bird = this.queue.shift();
    this.items.shift()?.destroy();
    return bird ?? null;
  }

  peekNext(): BirdType | null {
    return this.getNextBird();
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getQueue(): BirdType[] {
    return [...this.queue];
  }

  /** Where each thing still in the basket rests (the win screen's leftovers start there). */
  getRestPositions(): Position[] {
    return this.items.map((s) => ({ x: s.x, y: s.y }));
  }

  private getDisplayScale(birdType: BirdType): number {
    const config = BIRD_PHYSICS[birdType];
    const frameWidth = sizeOf(this.scene, BIRD_ASSET_MAP[birdType]).w;
    return (config.visualLength ?? config.radius * 2) / frameWidth;
  }

  /** Upstream's name: the next thing goes to the pouch. In 砸寨 it floats there. */
  jumpToPouch(onBounce: OnBounce, onComplete: (landingX: number, landingY: number) => void): void {
    if (this.items.length === 0 || this.queue.length === 0) {
      onComplete(0, 0);
      return;
    }
    const sprite = this.items[0];
    const pouchX = this.pouchRestPos.x;
    const pouchY = this.pouchRestPos.y;
    const done = () => {
      if (this.isDestroyed) return;
      this.flight = null;
      this.items.shift();
      this.queue.shift();
      sprite.destroy();
      onComplete(pouchX, pouchY);
    };
    if (Runtime.reducedMotion) {
      done();
      return;
    }
    this.floatToPouch(sprite, pouchX, pouchY, onBounce, done);
  }

  private floatToPouch(
    sprite: Phaser.GameObjects.Image,
    pouchX: number,
    pouchY: number,
    onBounce: OnBounce,
    done: () => void
  ): void {
    const type = this.queue[0];
    const scale = this.getDisplayScale(type);
    const startX = sprite.x;
    const startY = sprite.y;
    const topY = startY - C.float.riseHeight;
    sprite.setDepth(C.depth.floating);

    const glow = this.scene.textures.exists("vfx")
      ? this.scene.add
          .image(startX, startY, "vfx", C.glow.frame)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(C.glow.tint)
          .setAlpha(0)
          .setDepth(C.depth.floating - 1)
      : null;
    if (glow) glow.setScale((sprite.displayWidth / glow.width) * C.glow.scale * 2);
    this.flight = { tweens: [], glow };
    this.sparkles?.emitParticle(C.sparkle.puff, startX, this.rimY());

    const follow = () => {
      glow?.setPosition(sprite.x, sprite.y);
      if (this.sparkles && Math.random() < C.sparkle.perFrame) {
        this.sparkles.emitParticle(1, sprite.x + Phaser.Math.Between(-14, 14), sprite.y + Phaser.Math.Between(-10, 14));
      }
    };
    const tween = (cfg: Phaser.Types.Tweens.TweenBuilderConfig) => {
      const t = this.scene.tweens.add(cfg);
      this.flight?.tweens.push(t);
      return t;
    };

    // Up out of the basket: straightening, growing to its size in the sling, a small overshoot for the bob.
    if (glow) tween({ targets: glow, alpha: C.glow.alpha, duration: C.float.riseDuration, ease: "Sine.easeOut" });
    tween({
      targets: sprite,
      y: topY,
      rotation: 0,
      scaleX: scale,
      scaleY: scale,
      duration: C.float.riseDuration,
      ease: C.float.riseEase,
      onUpdate: follow,
      onComplete: () => {
        // Then across, on a shallow arc, into the pouch.
        const p = { t: 0 };
        const midY = Math.min(topY, pouchY) - C.float.glideArc;
        tween({
          targets: p,
          t: 1,
          duration: C.float.glideDuration,
          ease: C.float.glideEase,
          onUpdate: () => {
            const t = p.t;
            const u = 1 - t;
            sprite.setPosition(
              Phaser.Math.Linear(startX, pouchX, t),
              u * u * topY + 2 * u * t * midY + t * t * pouchY
            );
            follow();
          },
          onComplete: () => {
            if (this.isDestroyed) return;
            sprite.setPosition(pouchX, pouchY);
            if (glow) {
              tween({ targets: glow, alpha: 0, duration: 220, onComplete: () => glow.destroy() });
              if (this.flight) this.flight.glow = null;
            }
            this.sparkles?.emitParticle(C.sparkle.puff, pouchX, pouchY);
            const depth = C.float.settleDepth;
            // A soft settle: the pouch dips a little under it and comes back.
            onBounce(sprite, (t) => pouchY + depth * Math.sin(t * Math.PI) * (1 - t * 0.6), done);
          },
        });
      },
    });
  }

  private stopFlight(): void {
    if (!this.flight) return;
    this.flight.tweens.forEach((t) => t.stop());
    this.flight.glow?.destroy();
    this.flight = null;
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.stopFlight();
    this.items.forEach((s) => s.destroy());
    this.items = [];
    this.basketBack?.destroy();
    this.basketFront?.destroy();
    this.basketBack = this.basketFront = null;
    this.sparkles?.destroy();
    this.sparkles = null;
  }
}
