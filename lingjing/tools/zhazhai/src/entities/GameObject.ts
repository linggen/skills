import Phaser from "phaser";
import type { Position, Velocity } from "../types/Vector2";

export abstract class GameObject {
  public readonly scene: Phaser.Scene;
  public readonly id: string;
  protected matterImage: Phaser.Physics.Matter.Image | null = null;
  protected _destroyed: boolean = false;

  constructor(scene: Phaser.Scene, id: string) {
    this.scene = scene;
    this.id = id;
  }

  public get destroyed(): boolean {
    return this._destroyed;
  }

  public getPosition(): Position {
    if (this.matterImage?.active) {
      return { x: this.matterImage.x, y: this.matterImage.y };
    }

    if (this.matterImage?.body) {
      const body = this.matterImage.body as MatterJS.BodyType;
      return { x: body.position.x, y: body.position.y };
    }

    return { x: 0, y: 0 };
  }

  public getVelocity(): Velocity {
    if (this.matterImage?.active && this.matterImage.body) {
      const body = this.matterImage.body as MatterJS.BodyType;
      return { x: body.velocity.x, y: body.velocity.y };
    }

    return { x: 0, y: 0 };
  }

  public getRotation(): number {
    if (this.matterImage?.active) {
      return this.matterImage.rotation;
    }
    return 0;
  }

  public setPosition(x: number, y: number): void {
    this.matterImage?.setPosition(x, y);
  }

  public setStatic(isStatic: boolean): void {
    this.matterImage?.setStatic(isStatic);
  }

  public getMatterImage(): Phaser.Physics.Matter.Image | null {
    return this.matterImage;
  }

  public isDestroyed(): boolean {
    return this._destroyed;
  }

  protected markDestroyed(): void {
    this._destroyed = true;
  }

  protected destroyPhysicsBody(): void {
    if (this.matterImage) {
      this.matterImage.destroy();
      this.matterImage = null;
    }

    this._destroyed = true;
  }

  public abstract destroy(): void;
}
