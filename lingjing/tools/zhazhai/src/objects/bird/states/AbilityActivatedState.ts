import type { Bird } from "../../Bird";
import type { IBirdState } from "./IBirdState";

export class AbilityActivatedBirdState implements IBirdState {
  readonly name = "ABILITY_ACTIVATED";

  enter(bird: Bird): void {
    bird.setStatic(false);
  }

  exit(_bird: Bird): void {}

  update(bird: Bird, _delta: number): void {
    const body = bird.getMatterImage()?.body;
    if (!body) return;

    const velocity = body.velocity;
    const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);

    if (speed < 0.5) {
      bird.transitionToState("LANDED");
    }
  }

  handleCollision(_bird: Bird, _event: Phaser.Types.Physics.Matter.MatterCollisionData): void {}

  canActivateAbility(_bird: Bird): boolean {
    return false;
  }

  isLaunched(): boolean {
    return true;
  }
}
