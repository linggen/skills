// Existing systems
export {
  PhysicsSettleDetector,
  type PhysicsSettleConfig,
  type PhysicsSettleCallbacks,
} from "./PhysicsSettleDetector";

// SOLID systems - Core game state
export type { IScoringSystem } from "./scoring";
export { ScoringSystem, SCORING_CONFIG } from "./scoring";

export type { IExplosionSystem, ExplosionSystemDeps } from "./explosion";
export { ExplosionSystem, EXPLOSION_CONFIG } from "./explosion";

export type { IProgressManager, LevelProgress } from "./progress";
export { ProgressManager } from "./progress";

export type { IGameStateManager, GameState, GameStateCallbacks } from "./state";
export { GameStateManager } from "./state";

// SOLID systems - Input handling
export type { IInputHandler, InputHandlerCallbacks, InputHandlerDeps, InputState } from "./input";
export { InputHandler } from "./input";

// SOLID systems - Camera control
export type { ICameraController, CameraControllerDeps, CameraFollowConfig } from "./camera";
export { CameraController } from "./camera";

// SOLID systems - Level building
export type {
  ILevelBuilder,
  LevelBuilderDeps,
  LevelBuilderCallbacks,
  LevelBuildResult,
} from "./level";
export { LevelBuilder } from "./level";

// SOLID systems - Ability handlers (Strategy pattern)
export type { IAbilityHandler, AbilityEventType } from "./ability";
export {
  ExplosionHandler,
  SplitHandler,
  EggDropHandler,
  AbilityHandlerRegistry,
  createAbilityHandlerRegistry,
} from "./ability";

// SOLID systems - Game lifecycle
export { GameLifecycleManager } from "./game";
export type { GameLifecycleDeps, GameLifecycleCallbacks } from "./game";

// SOLID systems - VFX
export type { MaterialVFXProfile } from "./vfx";
export {
  materialRegistry,
  ParticleEmitterService,
  ImpactEffects,
  ShockwaveEffects,
  ExplosionEffects,
} from "./vfx";
