import { BirdType } from "../types/BirdType";
import { BaseBirdAbility } from "./BirdAbility";
import type { BirdAbilityContext } from "../types/BirdAbilityContext";
import { gameEvents } from "../events/EventBus";

export class SplitAbility extends BaseBirdAbility {
  public readonly birdType = BirdType.BLUE;

  public activate(context: BirdAbilityContext): void {
    const { bird, position, velocity, config } = context;

    const count = config.splitCount!;
    const angleOffset = config.splitAngle!;
    const velocityRatio = config.splitVelocityRatio!;

    const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
    const currentAngle = Math.atan2(velocity.y, velocity.x);
    const newSpeed = speed * velocityRatio;

    gameEvents.emit("birdSplit", {
      originalBird: bird,
      x: position.x,
      y: position.y,
      count,
      angleOffset,
      velocity: {
        x: Math.cos(currentAngle) * newSpeed,
        y: Math.sin(currentAngle) * newSpeed,
      },
    });
  }
}
