import type Phaser from "phaser";
import type { PhysicsQualityProfile } from "../../systems/PerformanceManager";
import { PerformanceManager } from "../../systems/PerformanceManager";
import { WORLD_CONFIG } from "../../config/PhysicsConfig";
import type { ThemeType } from "../../config/GameConfig";

type MatterEngine = {
  sleepThreshold?: number;
  positionIterations: number;
  velocityIterations: number;
  constraintIterations: number;
};

type SceneWithMatterEngine = Phaser.Scene & {
  matter: { world: { engine: MatterEngine } };
};

export interface PhysicsProfileState {
  currentProfile: PhysicsQualityProfile | null;
  tick: number;
}

export class SceneSetup {
  public static configureMatterPhysics(scene: SceneWithMatterEngine): void {
    const engine = scene.matter.world.engine;
    if (engine) {
      engine.sleepThreshold = WORLD_CONFIG.sleepThreshold;
    }
  }

  public static applyPhysicsQualityProfile(
    scene: SceneWithMatterEngine,
    profile: PhysicsQualityProfile,
    state: PhysicsProfileState
  ): void {
    const engine = scene.matter.world.engine;

    if (
      state.currentProfile &&
      state.currentProfile.positionIterations === profile.positionIterations &&
      state.currentProfile.velocityIterations === profile.velocityIterations &&
      state.currentProfile.constraintIterations === profile.constraintIterations
    ) {
      return;
    }

    engine.positionIterations = profile.positionIterations;
    engine.velocityIterations = profile.velocityIterations;
    engine.constraintIterations = profile.constraintIterations;
    state.currentProfile = profile;
  }

  public static updatePhysicsQualityProfile(
    scene: SceneWithMatterEngine,
    state: PhysicsProfileState,
    updateInterval: number
  ): void {
    state.tick++;
    if (state.tick % updateInterval !== 0) {
      return;
    }

    this.applyPhysicsQualityProfile(
      scene,
      PerformanceManager.getPhysicsQualityProfile(scene),
      state
    );
  }

  public static setupBackground(
    _scene: Phaser.Scene,
    theme: ThemeType,
    emitParallaxTheme: (theme: ThemeType, transition: boolean) => void
  ): void {
    emitParallaxTheme(theme, false);
  }
}
