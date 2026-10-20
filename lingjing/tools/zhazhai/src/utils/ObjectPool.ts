import Phaser from "phaser";
import { POOL_CONFIG } from "../config/PoolConfig";

export interface Poolable {
  setActive(value: boolean): this;
  setVisible(value: boolean): this;
  active: boolean;
  destroy(): void;
}

export interface PoolConfig<T extends Poolable> {
  factory: () => T;
  initialSize?: number;
  maxSize?: number;
  onAcquire?: (obj: T) => void;
  onRelease?: (obj: T) => void;
  reset?: (obj: T) => void;
}

export class ObjectPool<T extends Poolable> {
  private pool: T[] = [];
  private active: Set<T> = new Set();
  private factory: () => T;
  private maxPoolSize: number;
  private onAcquire?: (obj: T) => void;
  private onRelease?: (obj: T) => void;
  private reset: (obj: T) => void;
  private destroyed: boolean = false;

  constructor(config: PoolConfig<T>) {
    this.factory = config.factory;
    this.maxPoolSize = config.maxSize ?? POOL_CONFIG.default.maxSize;
    this.onAcquire = config.onAcquire;
    this.onRelease = config.onRelease;
    this.reset = config.reset ?? (() => {});

    const initialSize = config.initialSize ?? POOL_CONFIG.default.initialSize;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createPooledObject());
    }
  }

  private createPooledObject(): T {
    const obj = this.factory();
    obj.setActive(false).setVisible(false);
    return obj;
  }

  acquire(): T {
    if (this.destroyed) throw new Error("Pool has been destroyed");

    let obj: T;

    if (this.pool.length > 0) {
      obj = this.pool.pop()!;
    } else if (this.active.size < this.maxPoolSize) {
      obj = this.factory();
    } else {
      obj = this.active.values().next().value!;
      this.forceRelease(obj);
    }

    obj.setActive(true).setVisible(true);
    this.onAcquire?.(obj);
    this.active.add(obj);
    return obj;
  }

  release(obj: T): void {
    if (this.destroyed || !this.active.has(obj)) return;
    this.forceRelease(obj);
  }

  private forceRelease(obj: T): void {
    this.reset(obj);
    obj.setActive(false).setVisible(false);
    this.onRelease?.(obj);
    this.active.delete(obj);
    this.pool.push(obj);
  }

  releaseAll(): void {
    for (const obj of this.active) {
      this.forceRelease(obj);
    }
  }

  getActiveCount(): number {
    return this.active.size;
  }

  getPoolSize(): number {
    return this.pool.length;
  }

  getTotalCount(): number {
    return this.active.size + this.pool.length;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.pool.forEach((obj) => obj.destroy());
    this.active.forEach((obj) => obj.destroy());
    this.pool = [];
    this.active.clear();
  }
}

export class ImagePool extends ObjectPool<Phaser.GameObjects.Image> {
  constructor(
    scene: Phaser.Scene,
    texture: string,
    config?: Partial<PoolConfig<Phaser.GameObjects.Image>>,
    atlasKey?: string
  ) {
    super({
      factory: () => {
        const image = atlasKey
          ? scene.add.image(
              POOL_CONFIG.offScreenPosition,
              POOL_CONFIG.offScreenPosition,
              atlasKey,
              texture
            )
          : scene.add.image(POOL_CONFIG.offScreenPosition, POOL_CONFIG.offScreenPosition, texture);
        return image.setActive(false).setVisible(false);
      },
      initialSize: POOL_CONFIG.image.initialSize,
      maxSize: POOL_CONFIG.image.maxSize,
      reset: (img) => {
        img.setPosition(POOL_CONFIG.offScreenPosition, POOL_CONFIG.offScreenPosition);
        img.setAlpha(1);
        img.setScale(1);
        img.setRotation(0);
        img.setTint(0xffffff);
        img.setBlendMode(Phaser.BlendModes.NORMAL);
        img.clearTint();
      },
      ...config,
    });
  }
}

export class TextPool extends ObjectPool<Phaser.GameObjects.Text> {
  constructor(
    scene: Phaser.Scene,
    defaultStyle?: Phaser.Types.GameObjects.Text.TextStyle,
    config?: Partial<PoolConfig<Phaser.GameObjects.Text>>
  ) {
    super({
      factory: () =>
        scene.add
          .text(POOL_CONFIG.offScreenPosition, POOL_CONFIG.offScreenPosition, "", defaultStyle)
          .setActive(false)
          .setVisible(false)
          .setOrigin(0.5),
      initialSize: POOL_CONFIG.text.initialSize,
      maxSize: POOL_CONFIG.text.maxSize,
      reset: (text) => {
        text.setPosition(POOL_CONFIG.offScreenPosition, POOL_CONFIG.offScreenPosition);
        text.setText("");
        text.setAlpha(1);
        text.setScale(1);
        text.setRotation(0);
      },
      ...config,
    });
  }
}

export class GraphicsPool extends ObjectPool<Phaser.GameObjects.Graphics> {
  constructor(scene: Phaser.Scene, config?: Partial<PoolConfig<Phaser.GameObjects.Graphics>>) {
    super({
      factory: () => scene.add.graphics().setActive(false).setVisible(false),
      initialSize: POOL_CONFIG.graphics.initialSize,
      maxSize: POOL_CONFIG.graphics.maxSize,
      reset: (graphics) => {
        graphics.clear();
        graphics.setPosition(0, 0);
        graphics.setAlpha(1);
        graphics.setScale(1);
      },
      ...config,
    });
  }
}

export class CirclePool {
  private pool: Phaser.GameObjects.Arc[] = [];
  private active: Set<Phaser.GameObjects.Arc> = new Set();
  private scene: Phaser.Scene;
  private maxPoolSize: number;
  private destroyed: boolean = false;

  constructor(scene: Phaser.Scene, config?: { initialSize?: number; maxSize?: number }) {
    this.scene = scene;
    this.maxPoolSize = config?.maxSize ?? POOL_CONFIG.circle.maxSize;

    const initialSize = config?.initialSize ?? POOL_CONFIG.circle.initialSize;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createCircle());
    }
  }

  private createCircle(): Phaser.GameObjects.Arc {
    const circle = this.scene.add.circle(
      POOL_CONFIG.offScreenPosition,
      POOL_CONFIG.offScreenPosition,
      POOL_CONFIG.circle.defaultRadius,
      0xffffff,
      1
    );
    circle.setActive(false).setVisible(false);
    return circle;
  }

  acquire(
    x: number,
    y: number,
    radius: number,
    color: number,
    alpha: number
  ): Phaser.GameObjects.Arc {
    if (this.destroyed) throw new Error("Pool has been destroyed");

    let circle: Phaser.GameObjects.Arc;

    if (this.pool.length > 0) {
      circle = this.pool.pop()!;
    } else if (this.active.size < this.maxPoolSize) {
      circle = this.createCircle();
    } else {
      circle = this.active.values().next().value!;
      this.forceRelease(circle);
    }

    circle.setPosition(x, y);
    circle.setRadius(radius);
    circle.setFillStyle(color, alpha);
    circle.setActive(true).setVisible(true);
    this.active.add(circle);
    return circle;
  }

  release(circle: Phaser.GameObjects.Arc): void {
    if (this.destroyed || !this.active.has(circle)) return;
    this.forceRelease(circle);
  }

  private forceRelease(circle: Phaser.GameObjects.Arc): void {
    circle.setActive(false).setVisible(false);
    circle.setPosition(POOL_CONFIG.offScreenPosition, POOL_CONFIG.offScreenPosition);
    this.active.delete(circle);
    this.pool.push(circle);
  }

  releaseAll(): void {
    for (const circle of this.active) {
      this.forceRelease(circle);
    }
  }

  getActiveCount(): number {
    return this.active.size;
  }

  getPoolSize(): number {
    return this.pool.length;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.pool.forEach((circle) => circle.destroy());
    this.active.forEach((circle) => circle.destroy());
    this.pool = [];
    this.active.clear();
  }
}

export class RectanglePool {
  private pool: Phaser.GameObjects.Rectangle[] = [];
  private active: Set<Phaser.GameObjects.Rectangle> = new Set();
  private scene: Phaser.Scene;
  private maxPoolSize: number;
  private destroyed: boolean = false;

  constructor(scene: Phaser.Scene, config?: { initialSize?: number; maxSize?: number }) {
    this.scene = scene;
    this.maxPoolSize = config?.maxSize ?? POOL_CONFIG.rectangle.maxSize;

    const initialSize = config?.initialSize ?? POOL_CONFIG.rectangle.initialSize;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createRectangle());
    }
  }

  private createRectangle(): Phaser.GameObjects.Rectangle {
    const rect = this.scene.add.rectangle(
      POOL_CONFIG.offScreenPosition,
      POOL_CONFIG.offScreenPosition,
      1,
      1,
      0xffffff,
      1
    );

    rect.setActive(false).setVisible(false);
    return rect;
  }

  acquire(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    alpha: number
  ): Phaser.GameObjects.Rectangle {
    if (this.destroyed) throw new Error("Pool has been destroyed");

    let rect: Phaser.GameObjects.Rectangle;

    if (this.pool.length > 0) {
      rect = this.pool.pop()!;
    } else if (this.active.size < this.maxPoolSize) {
      rect = this.createRectangle();
    } else {
      rect = this.active.values().next().value!;
      this.forceRelease(rect);
    }

    rect.setPosition(x, y);
    rect.setSize(width, height);
    rect.setFillStyle(color, alpha);
    rect.setActive(true).setVisible(true);
    this.active.add(rect);

    return rect;
  }

  release(rect: Phaser.GameObjects.Rectangle): void {
    if (this.destroyed || !this.active.has(rect)) return;
    this.forceRelease(rect);
  }

  private forceRelease(rect: Phaser.GameObjects.Rectangle): void {
    rect.setActive(false).setVisible(false);
    rect.setPosition(POOL_CONFIG.offScreenPosition, POOL_CONFIG.offScreenPosition);
    this.active.delete(rect);
    this.pool.push(rect);
  }

  releaseAll(): void {
    for (const rect of this.active) {
      this.forceRelease(rect);
    }
  }

  getActiveCount(): number {
    return this.active.size;
  }

  getPoolSize(): number {
    return this.pool.length;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.pool.forEach((rect) => rect.destroy());
    this.active.forEach((rect) => rect.destroy());
    this.pool = [];
    this.active.clear();
  }
}
