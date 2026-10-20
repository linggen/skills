import type { Bird } from "../../Bird";
import type { IBirdState } from "./IBirdState";

export class LandedBirdState implements IBirdState {
  readonly name = "LANDED";

  enter(bird: Bird): void {
    // bird.setStatic(true);
    bird.notifyLanded();
  }

  exit(_bird: Bird): void {}

  update(_bird: Bird, _delta: number): void {}

  handleCollision(_bird: Bird, _event: Phaser.Types.Physics.Matter.MatterCollisionData): void {}

  canActivateAbility(_bird: Bird): boolean {
    return false;
  }

  isLaunched(): boolean {
    return false;
  }
}
