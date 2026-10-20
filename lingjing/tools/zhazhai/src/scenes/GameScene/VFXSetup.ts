import type Phaser from "phaser";
import type { ServiceContainer } from "../../config/registries/ServiceContainer";
import { ServiceTokens } from "../../config/bootstrap";
import type { IVFXManager } from "../../interfaces/IVFXManager";
import type { ICameraEffects } from "../../interfaces/ICameraEffects";
import type { IScorePopupManager } from "../../interfaces/IScorePopupManager";
import type { IScoringSystem } from "../../systems/scoring/IScoringSystem";
import type { IExplosionSystem } from "../../systems/explosion/IExplosionSystem";
import type { ISFXPlayer } from "../../interfaces/audio";
import type { IEventEmitter } from "../../interfaces/IEventEmitter";
import type { ITimeEffectsSettingsProvider } from "../../interfaces/ITimeEffectsSettings";
import type { IMobileSettingsProvider } from "../../interfaces/IMobileSettings";
import { gameEvents } from "../../events/EventBus";
import { ExplosionShaderManager } from "../../systems/ExplosionShaderManager";
import { PhysicsSettleDetector } from "../../systems/PhysicsSettleDetector";
import { WakeCascadeManager } from "../../systems/WakeCascadeManager";
import { ExplosionSystem, type ExplosionSystemDeps } from "../../systems/explosion";
import { AbilityHandlerRegistry, createAbilityHandlerRegistry } from "../../systems/ability";
import { AbilityVFXManager } from "../../systems/vfx/AbilityVFXManager";
import { ComboTracker } from "../../systems/ComboTracker";
import { JuiceController } from "../../systems/JuiceController";
import { GameHapticsManager } from "../../systems/mobile/GameHapticsManager";
import { DestructionHandler } from "./DestructionHandler";

export interface VFXSystems {
  vfxManager: IVFXManager;
  explosionShaderManager: ExplosionShaderManager;
  cameraEffects: ICameraEffects;
  scorePopupManager: IScorePopupManager;
  physicsSettleDetector: PhysicsSettleDetector;
  explosionSystem: IExplosionSystem;
  abilityHandlerRegistry: AbilityHandlerRegistry;
  abilityVFXManager: AbilityVFXManager;
  comboTracker: ComboTracker;
  juiceController: JuiceController;
  destructionHandler: DestructionHandler;
  hapticsManager: GameHapticsManager;
}

export interface VFXSetupDeps {
  scene: Phaser.Scene;
  container: ServiceContainer;
  scoringSystem: IScoringSystem;
  audioSystem: { sfx: ISFXPlayer };
}

export class VFXSetup {
  public static initialize(deps: VFXSetupDeps): VFXSystems {
    const { scene, container, scoringSystem, audioSystem } = deps;

    const vfxManager = container.resolveWith<IVFXManager, { scene: Phaser.Scene }>(
      ServiceTokens.VFX_MANAGER,
      { scene }
    );

    const explosionShaderManager = container.resolveWith<
      ExplosionShaderManager,
      { scene: Phaser.Scene }
    >(ServiceTokens.EXPLOSION_SHADER_MANAGER, { scene });

    const cameraEffects = container.resolveWith<ICameraEffects, { scene: Phaser.Scene }>(
      ServiceTokens.CAMERA_EFFECTS,
      { scene }
    );

    const timeEffectsSettings = container.resolve<ITimeEffectsSettingsProvider>(
      ServiceTokens.TIME_EFFECTS_SETTINGS
    );
    cameraEffects.setTimeEffectsSettings(timeEffectsSettings);

    const scorePopupManager = container.resolveWith<IScorePopupManager, { scene: Phaser.Scene }>(
      ServiceTokens.SCORE_POPUP_MANAGER,
      { scene }
    );
    scorePopupManager.setVFXSettings(timeEffectsSettings);

    const physicsSettleDetector = container.resolveWith<
      PhysicsSettleDetector,
      { scene: Phaser.Scene }
    >(ServiceTokens.PHYSICS_SETTLE_DETECTOR, { scene });

    const wakeCascadeManager = container.resolveWith<WakeCascadeManager, { scene: Phaser.Scene }>(
      ServiceTokens.WAKE_CASCADE_MANAGER,
      { scene }
    );

    // Connect wake cascade manager to VFXManager for fragment cleanup wake cascades
    vfxManager.setWakeCascadeManager(wakeCascadeManager);

    const mobileSettings = container.resolve<IMobileSettingsProvider>(
      ServiceTokens.MOBILE_SETTINGS
    );
    const hapticsManager = new GameHapticsManager({
      settingsProvider: mobileSettings,
    });

    const explosionDeps: ExplosionSystemDeps = {
      vfxManager,
      cameraEffects,
      sfx: audioSystem.sfx,
      scorePopupManager,
      scoringSystem,
      explosionShaderManager,
      scene,
      wakeManager: wakeCascadeManager,
      hapticsManager,
    };
    const explosionSystem = new ExplosionSystem(explosionDeps);

    const abilityVFXManager = new AbilityVFXManager(scene);

    const eventEmitter: IEventEmitter = {
      emit: (event, data) => gameEvents.emit(event, data),
    };

    const abilityHandlerRegistry = createAbilityHandlerRegistry({
      scene,
      explosionSystem,
      vfxManager: abilityVFXManager,
      sfx: audioSystem.sfx,
      eventEmitter,
    });

    const comboTracker = new ComboTracker({
      scene,
      scorePopupManager,
      scoringSystem,
    });

    const juiceController = new JuiceController({
      cameraEffects,
    });

    const destructionHandler = new DestructionHandler({
      scoringSystem,
      vfxManager,
      cameraEffects,
      sfx: audioSystem.sfx,
      scorePopupManager,
      explosionSystem,
      comboTracker,
      juiceController,
      hapticsManager,
    });

    return {
      vfxManager,
      explosionShaderManager,
      cameraEffects,
      scorePopupManager,
      physicsSettleDetector,
      explosionSystem,
      abilityHandlerRegistry,
      abilityVFXManager,
      comboTracker,
      juiceController,
      destructionHandler,
      hapticsManager,
    };
  }

  public static destroy(systems: VFXSystems): void {
    systems.vfxManager.destroy();
    systems.explosionShaderManager.destroy();
    systems.cameraEffects.destroy();
    systems.scorePopupManager.destroy();
    systems.physicsSettleDetector.stopMonitoring();
    systems.explosionSystem.destroy();
    systems.comboTracker.destroy();
    systems.abilityHandlerRegistry.destroy();
    systems.hapticsManager.destroy();
  }
}
