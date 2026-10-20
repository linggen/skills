import type { Bird } from "../Bird";
import type { IBirdState } from "./states/IBirdState";
import { IdleBirdState } from "./states/IdleState";
import { AimingBirdState } from "./states/AimingState";
import { FlyingBirdState } from "./states/FlyingState";
import { LandedBirdState } from "./states/LandedState";
import { AbilityActivatedBirdState } from "./states/AbilityActivatedState";

export class BirdStateMachine {
  private states: Map<string, IBirdState> = new Map();
  private currentState: IBirdState;
  private bird: Bird;

  constructor(bird: Bird) {
    this.bird = bird;

    this.states.set("IDLE", new IdleBirdState());
    this.states.set("AIMING", new AimingBirdState());
    this.states.set("FLYING", new FlyingBirdState());
    this.states.set("LANDED", new LandedBirdState());
    this.states.set("ABILITY_ACTIVATED", new AbilityActivatedBirdState());

    this.currentState = this.states.get("IDLE")!;
    this.currentState.enter(bird);
  }

  transitionTo(stateName: string): void {
    const newState = this.states.get(stateName);
    if (!newState || newState === this.currentState) return;

    this.currentState.exit(this.bird);
    this.currentState = newState;
    this.currentState.enter(this.bird);
  }

  getCurrentState(): IBirdState {
    return this.currentState;
  }

  getStateName(): string {
    return this.currentState.name;
  }

  update(delta: number): void {
    this.currentState.update(this.bird, delta);
  }

  handleCollision(event: Phaser.Types.Physics.Matter.MatterCollisionData): void {
    this.currentState.handleCollision(this.bird, event);
  }

  canActivateAbility(): boolean {
    return this.currentState.canActivateAbility(this.bird);
  }

  isLaunched(): boolean {
    return this.currentState.isLaunched();
  }

  destroy(): void {
    this.currentState.exit(this.bird);
  }
}
