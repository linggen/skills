import Phaser from "phaser";
import Matter from "matter-js";
import { IDamageable } from "../interfaces/IDamageable";
import type { IWakeCascadeManager } from "../interfaces/IWakeCascadeManager";
import { GameObject } from "./GameObject";

export abstract class PhysicsEntity extends GameObject implements IDamageable {
  public readonly maxHealth: number;
  public currentHealth: number;
  protected wakeManager: IWakeCascadeManager | undefined;

  constructor(
    scene: Phaser.Scene,
    id: string,
    maxHealth: number,
    wakeManager?: IWakeCascadeManager
  ) {
    super(scene, id);
    this.maxHealth = maxHealth;
    this.currentHealth = maxHealth;
    this.wakeManager = wakeManager;
  }

  protected wakeNearbyBodies(radius: number): void {
    if (!this.matterImage || !this.wakeManager) return;

    const pos = this.getPosition();
    this.wakeManager.requestWakeInRadius(pos.x, pos.y, radius);
  }

  protected wakeCascadeOnDestruction(blockWidth: number): void {
    if (!this.wakeManager) return;
    const pos = this.getPosition();
    this.wakeManager.requestCascadeOnDestruction(pos.x, pos.y, blockWidth);
  }

  protected wakeSelf(): void {
    if (this.matterImage?.body && this.wakeManager) {
      const body = this.matterImage.body as Matter.Body;
      this.wakeManager.wakeBodyDirectly(body);
    }
  }

  public getHealthPercent(): number {
    return Math.max(0, this.currentHealth / this.maxHealth);
  }

  public abstract takeDamage(amount: number, impactSpeed?: number, impactAngle?: number): void;
}
