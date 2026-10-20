/**
 * Service tokens for dependency injection
 */
export const ServiceTokens = {
  // VFX Systems
  VFX_MANAGER: Symbol("IVFXManager"),
  EXPLOSION_SHADER_MANAGER: Symbol("IExplosionShaderManager"),
  CAMERA_EFFECTS: Symbol("ICameraEffects"),

  // Audio
  AUDIO_SYSTEM: Symbol("IAudioSystem"),

  // UI
  SCORE_POPUP_MANAGER: Symbol("IScorePopupManager"),

  // Game State
  GAME_STATE_MANAGER: Symbol("IGameStateManager"),
  SCORING_SYSTEM: Symbol("IScoringSystem"),
  PROGRESS_MANAGER: Symbol("IProgressManager"),

  // Physics
  GROUND_MANAGER: Symbol("IGroundManager"),
  PHYSICS_SETTLE_DETECTOR: Symbol("IPhysicsSettleDetector"),
  WAKE_CASCADE_MANAGER: Symbol("IWakeCascadeManager"),

  // Camera
  CAMERA_CONTROLLER: Symbol("ICameraController"),

  // Level
  LEVEL_BUILDER: Symbol("ILevelBuilder"),
  BIRD_QUEUE: Symbol("IBirdQueue"),

  // Settings
  TIME_EFFECTS_SETTINGS: Symbol("ITimeEffectsSettingsProvider"),
  MOBILE_SETTINGS: Symbol("IMobileSettingsProvider"),
} as const;

export type ServiceToken = (typeof ServiceTokens)[keyof typeof ServiceTokens];

export type ServiceFactory<T> = (container: ServiceContainer) => T;

export type SceneServiceFactory<T, C = unknown> = (container: ServiceContainer, context: C) => T;

export interface ServiceRegistration<T> {
  factory: ServiceFactory<T>;
  singleton?: boolean;
}

export class ServiceContainer {
  private factories: Map<ServiceToken, ServiceFactory<unknown>> = new Map();
  private sceneFactories: Map<ServiceToken, SceneServiceFactory<unknown, unknown>> = new Map();
  private singletons: Map<ServiceToken, unknown> = new Map();
  private singletonFlags: Map<ServiceToken, boolean> = new Map();
  private parent: ServiceContainer | null = null;

  register<T>(token: ServiceToken, factory: ServiceFactory<T>, singleton: boolean = true): this {
    this.factories.set(token, factory as ServiceFactory<unknown>);
    this.singletonFlags.set(token, singleton);
    return this;
  }

  registerSceneFactory<T, C>(
    token: ServiceToken,
    factory: SceneServiceFactory<T, C>,
    singleton: boolean = false
  ): this {
    this.sceneFactories.set(token, factory as SceneServiceFactory<unknown, unknown>);
    this.singletonFlags.set(token, singleton);
    return this;
  }

  registerValue<T>(token: ServiceToken, value: T): this {
    this.singletons.set(token, value);
    this.singletonFlags.set(token, true);
    return this;
  }

  resolve<T>(token: ServiceToken): T {
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }

    if (this.parent?.singletons.has(token)) {
      return this.parent.singletons.get(token) as T;
    }

    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`Service not registered: ${String(token)}`);
    }

    const instance = factory(this) as T;

    if (this.singletonFlags.get(token) !== false) {
      this.singletons.set(token, instance);
    }

    return instance;
  }

  resolveWith<T, C>(token: ServiceToken, context: C): T {
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }

    if (this.parent?.singletons.has(token)) {
      return this.parent.singletons.get(token) as T;
    }

    const sceneFactory = this.sceneFactories.get(token);
    if (sceneFactory) {
      const instance = sceneFactory(this, context) as T;
      if (this.singletonFlags.get(token) !== false) {
        this.singletons.set(token, instance);
      }
      return instance;
    }

    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`Service not registered: ${String(token)}`);
    }

    const instance = factory(this) as T;
    if (this.singletonFlags.get(token) !== false) {
      this.singletons.set(token, instance);
    }
    return instance;
  }

  has(token: ServiceToken): boolean {
    return (
      this.factories.has(token) ||
      this.sceneFactories.has(token) ||
      this.singletons.has(token) ||
      (this.parent?.has(token) ?? false)
    );
  }

  clear(): void {
    this.factories.clear();
    this.sceneFactories.clear();
    this.singletons.clear();
    this.singletonFlags.clear();
  }

  createChild(): ServiceContainer {
    const child = new ServiceContainer();
    child.parent = this;
    this.factories.forEach((factory, token) => {
      child.factories.set(token, factory);
    });
    this.sceneFactories.forEach((factory, token) => {
      child.sceneFactories.set(token, factory);
    });
    this.singletonFlags.forEach((flag, token) => {
      child.singletonFlags.set(token, flag);
    });
    return child;
  }
}

export function createServiceContainer(): ServiceContainer {
  return new ServiceContainer();
}
