import type { Bird } from "../../Bird";

export interface IBirdState {
  readonly name: string;

  enter(bird: Bird): void;
  exit(bird: Bird): void;

  update(bird: Bird, delta: number): void;
  handleCollision(bird: Bird, event: Phaser.Types.Physics.Matter.MatterCollisionData): void;

  canActivateAbility(bird: Bird): boolean;
  isLaunched(): boolean;
}
