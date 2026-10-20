import Phaser from "phaser";
import type { GameEvents } from "../../events/EventBus";

export type AbilityEventType = "explosion" | "birdSplit" | "eggDrop";

export interface IAbilityHandler<K extends AbilityEventType> {
  readonly eventType: K;
  handle(event: GameEvents[K], scene: Phaser.Scene): Phaser.GameObjects.GameObject | void;
}
