import type { IScoringSystem, ScoreBreakdown, ScoreCategories } from "./IScoringSystem";
import { SCORING_CONFIG as CONFIG } from "./IScoringSystem";
import { gameEvents } from "../../events/EventBus";

const EMPTY_CATEGORIES: ScoreCategories = {
  pigs: 0,
  blocks: 0,
  combos: 0,
  impacts: 0,
  explosions: 0,
  unusedBirds: 0,
};

export class ScoringSystem implements IScoringSystem {
  private categories: ScoreCategories = { ...EMPTY_CATEGORIES };
  private onScoreChange?: (breakdown: ScoreBreakdown) => void;

  constructor(callbacks?: { onScoreChange?: (breakdown: ScoreBreakdown) => void }) {
    this.onScoreChange = callbacks?.onScoreChange;
  }

  public getScore(): number {
    return this.calculateTotal();
  }

  public getBreakdown(): ScoreBreakdown {
    return {
      total: this.calculateTotal(),
      categories: { ...this.categories },
    };
  }

  private calculateTotal(): number {
    return (
      this.categories.pigs +
      this.categories.blocks +
      this.categories.combos +
      this.categories.impacts +
      this.categories.explosions +
      this.categories.unusedBirds
    );
  }

  private notifyChange(): void {
    const breakdown = this.getBreakdown();
    this.onScoreChange?.(breakdown);
    gameEvents.emit("score-changed", { score: breakdown.total, breakdown });
  }

  public addPigPoints(): void {
    this.categories.pigs += CONFIG.PIG_DESTROYED;
    this.notifyChange();
  }

  public addBlockPoints(material: string): void {
    const points = this.calculateBlockPoints(material);
    this.categories.blocks += points;
    this.notifyChange();
  }

  public addComboBonus(bonus: number): void {
    this.categories.combos += bonus;
    this.notifyChange();
  }

  public addImpactPoints(speed: number, isPig: boolean): void {
    const points = this.calculateImpactPoints(speed, isPig);
    this.categories.impacts += points;
    this.notifyChange();
  }

  public addExplosionBonus(): void {
    this.categories.explosions += CONFIG.EXPLOSION_BONUS;
    this.notifyChange();
  }

  public addUnusedBirdBonus(count: number): number {
    const bonus = this.calculateUnusedBirdBonus(count);
    this.categories.unusedBirds += bonus;
    this.notifyChange();
    return bonus;
  }

  public calculateBlockPoints(material: string): number {
    const multiplier =
      CONFIG.BLOCK_MATERIAL_MULTIPLIER[material as keyof typeof CONFIG.BLOCK_MATERIAL_MULTIPLIER] ??
      1;
    return CONFIG.BLOCK_DESTROYED_BASE * multiplier;
  }

  public calculatePigPoints(): number {
    return CONFIG.PIG_DESTROYED;
  }

  public calculateImpactPoints(impactSpeed: number, isPig: boolean): number {
    const multiplier = isPig ? CONFIG.IMPACT_MULTIPLIER.PIG : CONFIG.IMPACT_MULTIPLIER.BLOCK;
    return Math.floor(impactSpeed * multiplier);
  }

  public calculateUnusedBirdBonus(unusedBirds: number): number {
    return unusedBirds * CONFIG.UNUSED_BIRD_BONUS;
  }

  public reset(): void {
    this.categories = { ...EMPTY_CATEGORIES };
    this.notifyChange();
  }
}
