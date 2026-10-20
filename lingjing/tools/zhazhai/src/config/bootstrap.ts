import Phaser from "phaser";
import { ServiceContainer, ServiceTokens } from "./registries/ServiceContainer";
import { GameStateManager } from "../systems/state/GameStateManager";
import { ScoringSystem } from "../systems/scoring/ScoringSystem";
import { ProgressManager } from "../systems/progress/ProgressManager";
import { VFXManager } from "../systems/VFXManager";
import { ExplosionShaderManager } from "../systems/ExplosionShaderManager";
import { CameraEffects } from "../systems/CameraEffects";
import { ScorePopupManager } from "../systems/ScorePopupManager";
import { GroundManager } from "../systems/GroundManager";
import { BirdQueue } from "../systems/BirdQueue";
import { PhysicsSettleDetector } from "../systems/PhysicsSettleDetector";
import { WakeCascadeManager } from "../systems/WakeCascadeManager";
import { CameraController } from "../systems/camera/CameraController";
import type { Position } from "../types/Vector2";
import { LevelBuilder } from "../systems/level/LevelBuilder";
import {
  ConsoleLogger,
  PhaserSoundAdapter,
  SettingsStore,
  PhaserTweenProvider,
  AudioContext,
  MusicPlayer,
  SFXPlayer,
  UIAudioPlayer,
  JinglePlayer,
  AudioSystem,
} from "../systems/audio";
import { TimeEffectsSettingsStore } from "../systems/TimeEffectsSettingsStore";
import { MobileSettingsStore } from "../systems/mobile/MobileSettingsStore";

import type { IGameStateManager } from "../systems/state/IGameStateManager";
import type { IScoringSystem } from "../systems/scoring/IScoringSystem";
import type { IProgressManager } from "../systems/progress/IProgressManager";
import type { IVFXManager } from "../interfaces/IVFXManager";
import type { ICameraEffects } from "../interfaces/ICameraEffects";
import type { IScorePopupManager } from "../interfaces/IScorePopupManager";
import type { ICameraController } from "../systems/camera/ICameraController";
import type { ILevelBuilder } from "../systems/level/ILevelBuilder";
import type { IAudioSystem } from "../interfaces/audio";
import type { ITimeEffectsSettingsProvider } from "../interfaces/ITimeEffectsSettings";
import type { IMobileSettingsProvider } from "../interfaces/IMobileSettings";

export interface SceneContext {
  scene: Phaser.Scene;
}

let globalContainer: ServiceContainer | null = null;

export function bootstrapServices(): ServiceContainer {
  if (globalContainer) {
    return globalContainer;
  }

  const container = new ServiceContainer();

  container.register<ITimeEffectsSettingsProvider>(
    ServiceTokens.TIME_EFFECTS_SETTINGS,
    () => new TimeEffectsSettingsStore(),
    true
  );

  container.register<IMobileSettingsProvider>(
    ServiceTokens.MOBILE_SETTINGS,
    () => new MobileSettingsStore(),
    true
  );

  container.register<IGameStateManager>(
    ServiceTokens.GAME_STATE_MANAGER,
    () => new GameStateManager(),
    false
  );

  container.register<IScoringSystem>(
    ServiceTokens.SCORING_SYSTEM,
    () => new ScoringSystem(),
    false
  );

  container.register<IProgressManager>(
    ServiceTokens.PROGRESS_MANAGER,
    () => new ProgressManager(),
    true
  );

  container.registerSceneFactory<IVFXManager, SceneContext>(
    ServiceTokens.VFX_MANAGER,
    (_, ctx) => new VFXManager(ctx.scene),
    false
  );

  container.registerSceneFactory<WakeCascadeManager, SceneContext>(
    ServiceTokens.WAKE_CASCADE_MANAGER,
    (_, ctx) => {
      const manager = new WakeCascadeManager();
      manager.initialize(ctx.scene);
      return manager;
    },
    false
  );

  container.registerSceneFactory<ExplosionShaderManager, SceneContext>(
    ServiceTokens.EXPLOSION_SHADER_MANAGER,
    (_, ctx) => {
      const manager = new ExplosionShaderManager(ctx.scene);
      manager.init();
      return manager;
    },
    false
  );

  container.registerSceneFactory<ICameraEffects, SceneContext>(
    ServiceTokens.CAMERA_EFFECTS,
    (_, ctx) => new CameraEffects(ctx.scene),
    false
  );

  container.registerSceneFactory<IScorePopupManager, SceneContext>(
    ServiceTokens.SCORE_POPUP_MANAGER,
    (_, ctx) => new ScorePopupManager(ctx.scene),
    false
  );

  container.registerSceneFactory<GroundManager, SceneContext>(
    ServiceTokens.GROUND_MANAGER,
    (_, ctx) => new GroundManager(ctx.scene),
    false
  );

  container.registerSceneFactory<
    BirdQueue,
    SceneContext & {
      pouchRestPos: Position;
      groundY: number;
    }
  >(
    ServiceTokens.BIRD_QUEUE,
    (_, ctx) =>
      new BirdQueue(
        ctx.scene,
        new Phaser.Math.Vector2(ctx.pouchRestPos.x, ctx.pouchRestPos.y),
        ctx.groundY
      ),
    false
  );

  container.registerSceneFactory<PhysicsSettleDetector, SceneContext>(
    ServiceTokens.PHYSICS_SETTLE_DETECTOR,
    (_, ctx) => new PhysicsSettleDetector(ctx.scene),
    false
  );

  container.registerSceneFactory<ICameraController, SceneContext>(
    ServiceTokens.CAMERA_CONTROLLER,
    (_, ctx) => new CameraController({ scene: ctx.scene }),
    false
  );

  container.registerSceneFactory<
    ILevelBuilder,
    SceneContext & { vfxManager: IVFXManager; wakeManager: WakeCascadeManager }
  >(
    ServiceTokens.LEVEL_BUILDER,
    (_, ctx) =>
      new LevelBuilder({
        scene: ctx.scene,
        vfxManager: ctx.vfxManager,
        wakeManager: ctx.wakeManager,
      }),
    false
  );

  globalContainer = container;
  return container;
}

export function getServiceContainer(): ServiceContainer {
  if (!globalContainer) {
    return bootstrapServices();
  }
  return globalContainer;
}

export function bootstrapAudio(game: Phaser.Game, scene: Phaser.Scene): IAudioSystem {
  const container = getServiceContainer();

  const logger = new ConsoleLogger("[AudioSystem]");

  const adapter = new PhaserSoundAdapter(game, logger);

  const settings = new SettingsStore();

  const tweenProvider = new PhaserTweenProvider(scene);

  const context = new AudioContext(adapter, logger);
  const music = new MusicPlayer(adapter, settings, tweenProvider, logger);
  const sfx = new SFXPlayer(adapter, settings, logger);
  const ui = new UIAudioPlayer(adapter, settings, logger);
  const jingles = new JinglePlayer(adapter, settings, music, logger);

  const audioSystem = new AudioSystem(context, music, sfx, ui, jingles, settings, adapter, logger);

  if (!audioSystem.validateAssets()) {
    logger.error("Some audio assets are missing. Audio may not work correctly.");
  }

  container.registerValue<IAudioSystem>(ServiceTokens.AUDIO_SYSTEM, audioSystem);

  logger.info("Audio system bootstrapped successfully");

  return audioSystem;
}

export { ServiceTokens } from "./registries/ServiceContainer";
