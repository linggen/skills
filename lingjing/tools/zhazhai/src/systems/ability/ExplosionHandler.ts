import Phaser from "phaser";
import { IAbilityHandler } from "./IAbilityHandler";
import type { GameEvents } from "../../events/EventBus";
import type { IExplosionSystem } from "../explosion/IExplosionSystem";

export interface ExplosionHandlerDeps {
  explosionSystem: IExplosionSystem;
}

export class ExplosionHandler implements IAbilityHandler<"explosion"> {
  readonly eventType = "explosion" as const;

  constructor(private deps: ExplosionHandlerDeps) {}

  handle(event: GameEvents["explosion"], _scene: Phaser.Scene): void {
    this.deps.explosionSystem.triggerExplosionByTier(
      { x: event.x, y: event.y },
      "blackBird",
      false,
      undefined,
      undefined,
      {
        customRadius: event.radius,
        excludeBody: event.sourceBody,
      }
    );
  }
}
