import type { ISFXPlayer } from "../../interfaces/audio";
import { ExplosionTier, ExplosionTierConfig } from "../../config/PhysicsConfig";
import type { Position } from "../../types/Vector2";
import type { IWakeCascadeManager } from "../../interfaces/IWakeCascadeManager";
import type { GameHapticsManager } from "../mobile/GameHapticsManager";

export const EXPLOSION_CONFIG = {
  CHAIN_DELAY_MS: 100,
} as const;

export interface ExplosionOptions {
  customRadius?: number;
  excludeBody?: unknown;
}

export interface IExplosionSystem {
  triggerExplosionByTier(
    position: Position,
    tier: ExplosionTier,
    isChainReaction?: boolean,
    chainSourcePos?: Position,
    chainSourceRadius?: number,
    options?: ExplosionOptions
  ): void;
  triggerBlockExplosion(block: {
    getPosition: () => Position;
    getExplosionTier(): ExplosionTier;
  }): void;
  setEntities(
    blocks: Array<{
      isDestroyed(): boolean;
      getPosition(): Position;
      getMatterImage(): { body?: unknown } | null;
      isExplosive(): boolean;
      getExplosionTier(): ExplosionTier;
      explode(): void;
      takeDamage(damage: number, speed: number): void;
    }>,
    pigs: Array<{
      isDestroyed(): boolean;
      getPosition(): Position;
      getMatterImage(): { body?: unknown } | null;
      takeDamage(damage: number): void;
    }>
  ): void;
  destroy(): void;
}

export interface ExplosionSystemDeps {
  vfxManager: {
    spawnExplosionParticles(x: number, y: number, material: string, tier: ExplosionTier): void;
    spawnDestructionEffect(x: number, y: number, material: string, impactSpeed: number): void;
    spawnShockwaveRing(x: number, y: number, material: string, impactSpeed: number): void;
    applyExplosionToFragments(
      explosionX: number,
      explosionY: number,
      radius: number,
      pushSpeed: number
    ): void;
  };
  cameraEffects: {
    slowMotion(duration: number, scale: number): void;
    shakeFromImpact(impactSpeed: number, material?: string): void;
    flashFromImpact(impactSpeed: number, material?: string): void;
    shake(intensity: number, duration: number): void;
  };
  sfx: ISFXPlayer;
  scorePopupManager: {
    show(x: number, y: number, points: number): void;
  };
  scoringSystem: {
    addExplosionBonus(): void;
  };
  explosionShaderManager: {
    triggerExplosion(x: number, y: number, radius: number, material: string): void;
  };
  scene: Phaser.Scene;
  wakeManager: IWakeCascadeManager;
  hapticsManager?: GameHapticsManager;
}

export type { ExplosionTier, ExplosionTierConfig };
