import Matter from "matter-js";
import { BirdType } from "../types/BirdType";
import { BaseBirdAbility } from "./BirdAbility";
import type { BirdAbilityContext } from "../types/BirdAbilityContext";
import { gameEvents } from "../events/EventBus";

export class ExplosionAbility extends BaseBirdAbility {
  // 砸寨: one burst for the 五雷符 and the 火弹.
  constructor(public readonly birdType: BirdType = BirdType.BLACK) {
    super();
  }

  public activate(context: BirdAbilityContext): void {
    const { bird, config } = context;
    const radius = config.explosionRadius!;
    const matterImage = bird.getMatterImage();
    const sourceBody = matterImage?.body ? (matterImage.body as Matter.Body) : undefined;

    gameEvents.emit("explosion", {
      x: bird.getPosition().x,
      y: bird.getPosition().y,
      radius,
      sourceBody,
    });
  }
}
