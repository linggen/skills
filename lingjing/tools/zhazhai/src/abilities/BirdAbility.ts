import { BirdType } from "../types/BirdType";
import type { BirdAbilityContext } from "../types/BirdAbilityContext";

export type { BirdAbilityContext };

export interface IBirdAbility {
  readonly birdType: BirdType;
  activate(context: BirdAbilityContext): void;
  canActivate(context: BirdAbilityContext): boolean;
}

export abstract class BaseBirdAbility implements IBirdAbility {
  public abstract readonly birdType: BirdType;

  public abstract activate(context: BirdAbilityContext): void;

  public canActivate(context: BirdAbilityContext): boolean {
    const { bird } = context;
    return bird.canActivateAbility();
  }
}
