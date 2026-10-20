import { BirdType } from "../types/BirdType";
import { BlockMaterial } from "../constants/Materials";
import { DAMAGE_MULTIPLIERS, GameConfig } from "../config/GameConfig";

export class DamageCalculator {
  static calculateDamage(birdType: BirdType, material: BlockMaterial, baseDamage: number): number {
    const multipliers = DAMAGE_MULTIPLIERS[birdType];
    const multiplier = multipliers[material] ?? 1.0;
    return Math.floor(baseDamage * multiplier);
  }

  static getMultiplier(birdType: BirdType, material: BlockMaterial): number {
    return DAMAGE_MULTIPLIERS[birdType][material] ?? 1.0;
  }

  static isEffective(birdType: BirdType, material: BlockMaterial): boolean {
    return this.getMultiplier(birdType, material) >= 1.5;
  }

  static isIneffective(birdType: BirdType, material: BlockMaterial): boolean {
    return this.getMultiplier(birdType, material) <= 0.5;
  }

  /**
   * - GLASS: any bird at decent speed → one-shot
   * - WOOD: YELLOW → one-shot. Others: normal HP damage
   * - STONE: BLACK explosion handles it. Direct hits: normal HP
   * - METAL: never one-shot from collision
   * - EXPLOSIVE: low HP, any decent hit kills
   */
  static shouldOneShot(
    birdType: BirdType,
    material: BlockMaterial,
    impactSpeed: number,
    _blockHP: number
  ): boolean {
    if (impactSpeed < GameConfig.damage.minOneShotSpeed) return false;

    switch (material) {
      case BlockMaterial.GLASS:
        return true;
      case BlockMaterial.EXPLOSIVE:
        return true;
      case BlockMaterial.WOOD:
        return birdType === BirdType.YELLOW;
      case BlockMaterial.STONE:
      case BlockMaterial.METAL:
        return false;
      default:
        return false;
    }
  }
}
