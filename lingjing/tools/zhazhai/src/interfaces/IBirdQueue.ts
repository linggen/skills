import Phaser from "phaser";
import type { BirdType } from "../types/BirdType";
import type { Position } from "../types/Vector2";

export interface IBirdQueue {
  getSpawnPosition(): Position;
  setQueue(birdTypes: BirdType[]): void;
  getNextBird(): BirdType | null;
  popBird(): BirdType | null;
  peekNext(): BirdType | null;
  getQueueLength(): number;
  getQueue(): BirdType[];
  jumpToPouch(
    onBounce: (
      birdSprite: Phaser.GameObjects.Image,
      bounceY: (t: number) => number,
      onComplete: () => void
    ) => void,
    onComplete: (landingX: number, landingY: number) => void
  ): void;
  /** 砸寨: where each thing still in the basket rests. */
  getRestPositions?(): Position[];
  destroy(): void;
}
