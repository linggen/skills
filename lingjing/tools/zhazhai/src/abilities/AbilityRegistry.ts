import { BirdType } from "../types/BirdType";
import { IBirdAbility } from "./BirdAbility";
import { SpeedBoostAbility } from "./SpeedBoostAbility";
import { ExplosionAbility } from "./ExplosionAbility";
import { EggDropAbility } from "./EggDropAbility";
import { SplitAbility } from "./SplitAbility";

/**
 * Registry that maps bird types to their ability implementations
 * Enables the Strategy pattern for bird abilities
 */
export class AbilityRegistry {
  private abilities: Map<BirdType, IBirdAbility> = new Map();

  constructor() {
    // Register default abilities
    this.register(new SpeedBoostAbility());
    this.register(new ExplosionAbility());
    this.register(new EggDropAbility());
    this.register(new SplitAbility());
  }

  /**
   * Register an ability for a bird type
   * @param ability - The ability implementation
   */
  public register(ability: IBirdAbility): void {
    this.abilities.set(ability.birdType, ability);
  }

  /**
   * Get the ability for a bird type
   * @param birdType - The bird type
   * @returns The ability implementation, or undefined if not found
   */
  public get(birdType: BirdType): IBirdAbility | undefined {
    return this.abilities.get(birdType);
  }

  /**
   * Check if an ability exists for a bird type
   * @param birdType - The bird type
   */
  public has(birdType: BirdType): boolean {
    return this.abilities.has(birdType);
  }
}
