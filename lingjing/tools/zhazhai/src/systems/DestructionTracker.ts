import Phaser from "phaser";
import { gameEvents, SubscriptionGroup } from "../events/EventBus";

/**
 * Tracks destruction events for physics settle detection.
 * Provides callbacks for the PhysicsSettleDetector to make smarter decisions
 * about when physics has truly settled.
 */
export class DestructionTracker {
  private scene: Phaser.Scene;
  private subscriptions: SubscriptionGroup;
  private lastDestructionTime: number = 0;
  private destructionCount: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.subscriptions = new SubscriptionGroup();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Track pig destruction events
    this.subscriptions.add(
      gameEvents.subscribe("pigDestroyed", () => {
        this.recordDestruction();
      })
    );

    // Track explosion events (also cause destruction)
    this.subscriptions.add(
      gameEvents.subscribe("explosion", () => {
        this.recordDestruction();
      })
    );

    // Reset tracking when a new bird is launched
    this.subscriptions.add(
      gameEvents.subscribe("birdLaunched", () => {
        this.reset();
      })
    );
  }

  private recordDestruction(): void {
    this.lastDestructionTime = this.scene.time.now;
    this.destructionCount++;
  }

  /**
   * Reset tracking for a new bird launch
   */
  reset(): void {
    this.lastDestructionTime = 0;
    this.destructionCount = 0;
  }

  /**
   * Get the timestamp of the last destruction event
   */
  getLastDestructionTime(): number {
    return this.lastDestructionTime;
  }

  /**
   * Get the total destruction count for the current shot
   */
  getDestructionCount(): number {
    return this.destructionCount;
  }

  /**
   * Check if any destruction has occurred
   */
  hasDestruction(): boolean {
    return this.destructionCount > 0;
  }

  destroy(): void {
    this.subscriptions.disposeAll();
  }
}
