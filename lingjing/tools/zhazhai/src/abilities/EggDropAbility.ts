import { BirdType } from "../types/BirdType";
import { BaseBirdAbility } from "./BirdAbility";
import type { BirdAbilityContext } from "../types/BirdAbilityContext";
import { gameEvents } from "../events/EventBus";

export class EggDropAbility extends BaseBirdAbility {
  public readonly birdType = BirdType.WHITE;

  public activate(context: BirdAbilityContext): void {
    const { bird, position } = context;

    gameEvents.emit("eggDrop", {
      bird,
      x: position.x,
      y: position.y,
    });
  }
}
