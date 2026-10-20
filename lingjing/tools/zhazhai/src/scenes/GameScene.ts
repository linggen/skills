import Phaser from "phaser";
import { SlingshotState } from "../objects/slingshot-modules/SlingshotConfig";
import { getLevelById, LevelData } from "../data/levels";
import type { Pig } from "../objects/Pig";
import type { Block } from "../objects/Block";
import { ExplosionShaderManager } from "../systems/ExplosionShaderManager";
import { GroundManager } from "../systems/GroundManager";
import { LEVEL_HEIGHT, LEVEL_WIDTH, type ThemeType } from "../config/GameConfig";
import { TimingConfig } from "../config/TimingConfig";
import { PARALLAX_CAMERA_CONFIG } from "../config/CameraConfig";
import { WakeCascadeManager } from "../systems/WakeCascadeManager";
import { MobileManager, TouchFeedbackManager } from "../systems/mobile";
import {
  ProgressManager,
  InputHandler,
  GameLifecycleManager,
  type InputHandlerCallbacks,
} from "../systems";
import type { IGameStateManager } from "../systems/state/IGameStateManager";
import type { IScoringSystem } from "../systems/scoring/IScoringSystem";
import type { IProgressManager } from "../systems/progress/IProgressManager";
import type { IVFXManager } from "../interfaces/IVFXManager";
import type { ICameraEffects } from "../interfaces/ICameraEffects";
import type { IScorePopupManager } from "../interfaces/IScorePopupManager";
import type { IInputHandler } from "../systems/input/IInputHandler";
import type { ICameraController } from "../systems/camera/ICameraController";
import type { ILevelBuilder } from "../systems/level/ILevelBuilder";
import type { IExplosionSystem } from "../systems/explosion/IExplosionSystem";
import type { IGroundManager } from "../interfaces/IGroundManager";
import type { IBirdQueue } from "../interfaces/IBirdQueue";
import type { IPhysicsSettleDetector } from "../interfaces/IPhysicsSettleDetector";
import type { IAudioSystem } from "../interfaces/audio";
import type { IMobileSettingsProvider } from "../interfaces/IMobileSettings";
import { getServiceContainer, ServiceTokens } from "../config/bootstrap";
import { DestructionHandler } from "./GameScene/DestructionHandler";
import { EntityManager } from "./GameScene/EntityManager";
import { BirdLaunchOrchestrator } from "./GameScene/BirdLaunchOrchestrator";
import { EventHandler } from "./GameScene/EventHandler";
import { VFXSetup, type VFXSystems } from "./GameScene/VFXSetup";
import { SceneSetup, type PhysicsProfileState } from "./GameScene/SceneSetup";
import { SlingshotSetup } from "./GameScene/SlingshotSetup";
import { LevelSetup } from "./GameScene/LevelSetup";
import { CallbackHandlers } from "./GameScene/CallbackHandlers";
import { CelebrationUtility } from "./GameScene/CelebrationUtility";
import { gameEvents, SubscriptionGroup } from "../events/EventBus";
import { DestructionTracker } from "../systems/DestructionTracker";
import { SCENE_KEYS } from "../config/UIConstants";
import { clearGeneratedTextures } from "../config/assetManifest";
import type { TransitionScene } from "./TransitionScene";
import type { Slingshot } from "../objects/Slingshot";
import { ComboTracker } from "../systems/ComboTracker";
import {
  initializeFastBodyCollisionDetector,
  destroyFastBodyCollisionDetector,
} from "../utils/FastBodyCollisionDetector";

interface SceneInitData {
  level: number;
}

export class GameScene extends Phaser.Scene {
  private level: number = 1;
  private lastScrollX: number = 0;
  private lastScrollY: number = 0;
  private lastZoom: number = 1;
  private levelData: LevelData | null = null;
  private container = getServiceContainer().createChild();

  private gameStateManager!: IGameStateManager;
  private scoringSystem!: IScoringSystem;
  private explosionSystem!: IExplosionSystem;
  private progressManager!: IProgressManager;

  private inputHandler!: IInputHandler;
  private cameraController!: ICameraController;
  private levelBuilder!: ILevelBuilder;

  private slingshot!: Slingshot;
  private birdLaunchOrchestrator!: BirdLaunchOrchestrator;

  private vfxManager!: IVFXManager;
  private explosionShaderManager!: ExplosionShaderManager;
  private cameraEffects!: ICameraEffects;
  private audioSystem!: IAudioSystem;
  private scorePopupManager!: IScorePopupManager;
  private groundManager!: IGroundManager;
  private birdQueueSystem!: IBirdQueue;
  private physicsSettleDetector!: IPhysicsSettleDetector;
  private wakeCascadeManager!: WakeCascadeManager;

  private gameLifecycleManager!: GameLifecycleManager;
  private physicsProfileState: PhysicsProfileState = { currentProfile: null, tick: 0 };
  private vfxSystems!: VFXSystems;

  private destructionHandler!: DestructionHandler;
  private entityManager!: EntityManager;
  private comboTracker!: ComboTracker;
  private destructionTracker!: DestructionTracker;
  private eventHandler!: EventHandler;
  private cleanupTimer: number = 0;
  private subscriptions: SubscriptionGroup;
  private touchFeedbackManager: TouchFeedbackManager | null = null;
  private pendingTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super({ key: "GameScene" });
    this.subscriptions = new SubscriptionGroup();
  }

  shutdown(): void {
    this.pendingTimers.forEach((t) => t.remove());
    this.pendingTimers = [];

    destroyFastBodyCollisionDetector();

    if (this.touchFeedbackManager) {
      this.touchFeedbackManager.destroy();
      this.touchFeedbackManager = null;
    }

    this.wakeCascadeManager?.reset();

    if (this.physicsSettleDetector) {
      this.physicsSettleDetector.stopMonitoring();
    }

    if (this.eventHandler) {
      this.eventHandler.destroy();
    }

    this.subscriptions.disposeAll();

    if (this.inputHandler) {
      this.inputHandler.destroy();
    }

    if (this.cameraController) {
      this.cameraController.destroy();
    }

    if (this.levelBuilder) {
      this.levelBuilder.destroy();
    }

    if (this.vfxSystems) {
      VFXSetup.destroy(this.vfxSystems);
    }

    if (this.groundManager) {
      this.groundManager.destroy();
    }

    if (this.birdQueueSystem) {
      this.birdQueueSystem.destroy();
    }

    if (this.birdLaunchOrchestrator) {
      this.birdLaunchOrchestrator.destroy();
    }

    if (this.destructionTracker) {
      this.destructionTracker.destroy();
    }

    if (this.entityManager) {
      this.entityManager.clearAll();
    }

    if (this.gameStateManager) {
      this.gameStateManager.reset();
    }
    if (this.scoringSystem) {
      this.scoringSystem.reset();
    }

    clearGeneratedTextures();

    gameEvents.emit("ui-reset", undefined);
    gameEvents.emit("parallax:reset", undefined);
  }

  init(data: SceneInitData): void {
    this.level = data.level || 1;
    this.levelData = getLevelById(this.level) || null;

    this.container = getServiceContainer().createChild();

    this.gameStateManager = this.container.resolve(ServiceTokens.GAME_STATE_MANAGER);
    this.scoringSystem = this.container.resolve(ServiceTokens.SCORING_SYSTEM);
    this.progressManager = this.container.resolve(ServiceTokens.PROGRESS_MANAGER);
    this.audioSystem = this.container.resolve(ServiceTokens.AUDIO_SYSTEM);

    this.entityManager = new EntityManager();
  }

  create(): void {
    this.events.once("shutdown", this.shutdown, this);

    this.wakeCascadeManager = this.container.resolveWith<
      WakeCascadeManager,
      { scene: Phaser.Scene }
    >(ServiceTokens.WAKE_CASCADE_MANAGER, { scene: this });
    this.wakeCascadeManager.initialize(this);

    this.configureMatterPhysics();
    this.setupGround();
    this.setupBackground();
    this.setupAudio();

    this.initVFXSystems();

    this.destructionTracker = new DestructionTracker(this);

    this.setupCameraController();
    this.setupInputHandler();
    this.setupLevelBuilder();

    this.createSlingshot();
    this.buildLevel();

    this.setupEvents();
    this.launchUIScene();

    // Start intro pan — bird spawn gated until pan completes
    this.cameraController.startIntroPan(() => {
      this.birdLaunchOrchestrator.spawnNextBird();
    });

    // Allow skipping the intro pan with a click/tap
    this.input.once("pointerdown", () => {
      if (this.cameraController.isIntroPanning()) {
        this.cameraController.skipIntroPan();
      }
    });

    // Trigger transition reveal after scene is ready
    const revealTimer = this.time.delayedCall(TimingConfig.transition.revealDelay, () => {
      const ts = this.scene.get(SCENE_KEYS.TRANSITION) as TransitionScene | null;
      if (ts?.scene?.isActive?.()) {
        ts.requestReveal();
      }
    });
    this.pendingTimers.push(revealTimer);
  }

  private configureMatterPhysics(): void {
    initializeFastBodyCollisionDetector(this);
  }

  private setupGround(): void {
    const theme = this.getThemeForLevel();
    this.groundManager = new GroundManager(this);
    this.groundManager.setTheme(theme);
    this.groundManager.create();
  }

  private getThemeForLevel(): ThemeType {
    return this.levelData?.theme || "forest";
  }

  private setupBackground(): void {
    const theme = this.getThemeForLevel();
    SceneSetup.setupBackground(this, theme, (t, transition) => {
      const parallaxScene = this.scene.get("ParallaxScene");
      if (parallaxScene && parallaxScene.scene.isActive()) {
        gameEvents.emit("parallax:theme", { theme: t, transition });
      } else {
        this.scene.launch("ParallaxScene", { theme: t });
      }
    });
  }

  private initVFXSystems(): void {
    this.vfxSystems = VFXSetup.initialize({
      scene: this,
      container: this.container,
      scoringSystem: this.scoringSystem,
      audioSystem: { sfx: this.audioSystem.sfx },
    });

    this.vfxManager = this.vfxSystems.vfxManager;
    this.explosionShaderManager = this.vfxSystems.explosionShaderManager;
    this.cameraEffects = this.vfxSystems.cameraEffects;
    this.scorePopupManager = this.vfxSystems.scorePopupManager;
    this.physicsSettleDetector = this.vfxSystems.physicsSettleDetector;
    this.explosionSystem = this.vfxSystems.explosionSystem;
    this.comboTracker = this.vfxSystems.comboTracker;
    this.destructionHandler = this.vfxSystems.destructionHandler;

    this.vfxManager.setFragmentCollisionSoundCallback?.((material, impactSpeed) => {
      this.audioSystem.sfx.playImpact(material, impactSpeed);
    });

    this.vfxManager.setFragmentCollisionHapticCallback?.((material, impactSpeed, areaRatio) => {
      this.vfxSystems.hapticsManager.onFragmentImpact(material, impactSpeed, areaRatio);
    });
  }

  private setupAudio(): void {
    this.sound.pauseOnBlur = false;

    const theme = this.getThemeForLevel();
    this.audioSystem.music.playLevelMusic(theme);

    this.input.once("pointerdown", () => {
      this.audioSystem.context.unlock();
    });
  }

  // ==================== EXTRACTED SYSTEM SETUP ====================

  private setupCameraController(): void {
    this.cameraController = this.container.resolveWith<ICameraController, { scene: Phaser.Scene }>(
      ServiceTokens.CAMERA_CONTROLLER,
      { scene: this }
    );
    const slingshotX = this.levelData?.slingshot?.x ?? 180;
    const groundY = this.groundManager.getGroundY();
    this.cameraController.setup(slingshotX, groundY);
  }

  private setupInputHandler(): void {
    const mobileManager = MobileManager.getInstance();
    if (mobileManager.isTouchDevice()) {
      const mobileSettings = this.container.resolve<IMobileSettingsProvider>(
        ServiceTokens.MOBILE_SETTINGS
      );
      this.touchFeedbackManager = new TouchFeedbackManager({
        scene: this,
        settingsProvider: mobileSettings,
      });
    }

    const inputDeps = {
      scene: this,
      slingshotGetBird: () => this.slingshot?.getBird() ?? null,
      slingshotStartAiming: () => this.slingshot?.startAiming(),
      slingshotUpdateAim: (x: number, y: number) => this.slingshot?.updateAim(x, y) ?? null,
      slingshotCancel: () => this.slingshot?.cancel(),
      isPaused: () => this.gameStateManager.isPaused(),
      isGameOver: () => this.gameStateManager.isGameOver(),
      isTransitioning: () =>
        this.gameStateManager.isTransitioning() || this.cameraController.isIntroPanning(),
      canActivateAbility: () => this.birdLaunchOrchestrator.canActivateAbility(),
      activateAbility: () => this.birdLaunchOrchestrator.activateAbility(),
      isTouchDevice: () => mobileManager.isTouchDevice(),
      getAimHitboxRadius: () => mobileManager.getAimHitboxRadius(),
      isBirdInFlight: () => this.birdLaunchOrchestrator.hasActiveFlyingBird(),
      showTouchFeedback: (x: number, y: number, type: "tap" | "aim" | "fire" | "drag") => {
        this.touchFeedbackManager?.showTapFeedback(x, y, type);
      },
    };

    this.inputHandler = new InputHandler(inputDeps);

    const callbacks: InputHandlerCallbacks = {
      onAimStart: () => {
        this.cameraController.resetToInitial(true);
      },
      onAimUpdate: () => {},
      onAimEnd: (_x, _y, _powerRatio) => this.birdLaunchOrchestrator.fireBird(),
      onAimCancel: () => {
        this.cameraController.clearAimAssist();
        this.slingshot.cancel();
        this.slingshot.clearTrajectory();
      },
      onCameraDrag: (deltaX) => this.cameraController.handleDrag(deltaX),
      onCameraDragEnd: () => this.cameraController.handleDragEnd(),
      onCameraZoom: (delta) => {
        this.cameraController.handleManualZoom(delta);
      },
      onPauseToggle: () => this.togglePause(),
      onFire: () => this.birdLaunchOrchestrator.fireBird(),
      onAbilityActivate: () => {},
    };

    this.inputHandler.init(callbacks);
  }

  private setupLevelBuilder(): void {
    this.levelBuilder = this.container.resolveWith<
      ILevelBuilder,
      { scene: Phaser.Scene; vfxManager: IVFXManager; wakeManager: WakeCascadeManager }
    >(ServiceTokens.LEVEL_BUILDER, {
      scene: this,
      vfxManager: this.vfxManager,
      wakeManager: this.wakeCascadeManager,
    });
  }

  private buildLevel(): void {
    if (!this.levelData) return;

    const result = LevelSetup.build({
      scene: this,
      levelData: this.levelData,
      level: this.level,
      levelBuilder: this.levelBuilder,
      groundManager: this.groundManager,
      gameStateManager: this.gameStateManager,
      scoringSystem: this.scoringSystem,
      progressManager: this.progressManager,
      explosionSystem: this.explosionSystem,
      cameraController: this.cameraController,
      physicsSettleDetector: this.physicsSettleDetector,
      scorePopupManager: this.scorePopupManager,
      birdQueueSystem: this.birdQueueSystem,
      jingles: this.audioSystem.jingles,
      ui: this.audioSystem.ui,
      comboTracker: this.comboTracker,
      entityManager: this.entityManager,
      onPigDestroyed: (pig) => this.handlePigDestroyedCallback(pig),
      onBlockDestroyed: (block, impactSpeed, impactAngle, impactX, impactY) =>
        this.handleBlockDestroyedCallback(block, impactSpeed, impactAngle, impactX, impactY),
      onBlockDamaged: (
        block: Block,
        _damage: number,
        _health: number,
        impactSpeed: number,
        impactAngle: number,
        impactX?: number,
        impactY?: number
      ) => this.handleBlockDamagedCallback(block, impactSpeed, impactAngle, impactX, impactY),
      spawnNextBird: () => this.birdLaunchOrchestrator.spawnNextBird(),
      updateUI: () => this.updateUI(),
      getBirdPositionsForCelebration: () => this.getBirdPositionsForCelebration(),
      destructionTracker: this.destructionTracker,
      vfxManager: this.vfxManager,
    });

    this.gameLifecycleManager = result.gameLifecycleManager;
  }

  // ==================== CALLBACK HANDLERS ====================

  private handlePigDestroyedCallback(pig: Pig): void {
    CallbackHandlers.handlePigDestroyed(
      {
        destructionHandler: this.destructionHandler,
        cameraController: this.cameraController,
        birdLaunchOrchestrator: this.birdLaunchOrchestrator,
      },
      pig
    );
  }

  private handleBlockDestroyedCallback(
    block: Block,
    impactSpeed: number,
    impactAngle: number,
    impactX?: number,
    impactY?: number
  ): void {
    CallbackHandlers.handleBlockDestroyed(
      {
        destructionHandler: this.destructionHandler,
        cameraController: this.cameraController,
        birdLaunchOrchestrator: this.birdLaunchOrchestrator,
      },
      block,
      impactSpeed,
      impactAngle,
      impactX,
      impactY
    );
  }

  private handleBlockDamagedCallback(
    block: Block,
    impactSpeed: number,
    impactAngle: number,
    impactX?: number,
    impactY?: number
  ): void {
    CallbackHandlers.handleBlockDamaged(
      {
        destructionHandler: this.destructionHandler,
        cameraController: this.cameraController,
        birdLaunchOrchestrator: this.birdLaunchOrchestrator,
      },
      block,
      impactSpeed,
      impactAngle,
      impactX,
      impactY
    );
  }

  // ==================== GAME OBJECT CREATION ====================

  private createSlingshot(): void {
    const result = SlingshotSetup.create({
      scene: this,
      levelData: this.levelData,
      groundManager: this.groundManager,
      cameraController: this.cameraController,
      cameraEffects: this.cameraEffects,
      audioSystem: { sfx: this.audioSystem.sfx },
      gameStateManager: this.gameStateManager,
      physicsSettleDetector: this.physicsSettleDetector,
      wakeCascadeManager: this.wakeCascadeManager,
      entityManager: this.entityManager,
      hapticsManager: this.vfxSystems.hapticsManager,
      checkGameState: () => this.checkGameState(),
      updateUI: () => this.updateUI(),
      updateBirdQueueUI: () => this.updateBirdQueueUI(),
      canEarlySettle: () => this.gameLifecycleManager.canEarlySettle(),
      getCurrentCombo: () => this.comboTracker.getCurrentCombo(),
      flushCombo: () => this.comboTracker.flushCombo(),
      onSlingshotStateChange: (state, bird) => this.handleSlingshotStateChange(state, bird),
      hasQueuedFragments: () => this.vfxManager.hasQueuedFragments?.() ?? false,
      getLastDestructionTime: () => this.destructionTracker.getLastDestructionTime(),
      getDestructionCount: () => this.destructionTracker.getDestructionCount(),
    });

    this.slingshot = result.slingshot;
    this.birdQueueSystem = result.birdQueueSystem;
    this.birdLaunchOrchestrator = result.birdLaunchOrchestrator;
  }

  // ==================== EVENT HANDLERS ====================

  private handleSlingshotStateChange(
    _state: SlingshotState,
    _bird?: Phaser.GameObjects.Image
  ): void {}

  private setupEvents(): void {
    this.eventHandler = new EventHandler({
      scene: this,
      scoringSystem: this.scoringSystem,
      scorePopupManager: this.scorePopupManager,
      cameraController: this.cameraController,
      cameraEffects: this.cameraEffects,
      gameStateManager: this.gameStateManager,
      physicsSettleDetector: this.physicsSettleDetector,
      birdLaunchOrchestrator: this.birdLaunchOrchestrator,
      updateUI: () => this.updateUI(),
    });

    this.subscriptions.add(
      gameEvents.subscribe("ui-request-initial-state", this.handleUIRequestInitialState, this)
    );
  }

  private handleUIRequestInitialState(): void {
    gameEvents.emit("ui-level", { level: this.level });
    const queue = this.birdQueueSystem?.getQueue() ?? [];
    gameEvents.emit("ui-birdQueue", { queue });
    this.updateUI();
  }

  // ==================== UI & STATE ====================

  private launchUIScene(): void {
    this.scene.launch("UIScene", { level: this.level });
  }

  private updateUI(): void {
    if (this.gameStateManager.isGameOver() || this.gameStateManager.isTransitioning()) return;

    gameEvents.emit("ui-update", {
      score: this.scoringSystem.getScore(),
      pigsRemaining: this.gameStateManager.getPigsRemaining(),
    });
  }

  private updateBirdQueueUI(): void {
    const queue = this.birdQueueSystem?.getQueue() ?? [];
    gameEvents.emit("ui-birdQueue", { queue });
  }

  private togglePause(): void {
    if (this.gameStateManager.isGameOver()) return;

    this.gameStateManager.togglePause();
    gameEvents.emit("ui-pause", { isPaused: this.gameStateManager.isPaused() });
  }

  // ==================== GAME STATE ====================

  private getBirdPositionsForCelebration(): { x: number; y: number; texture: string }[] {
    return CelebrationUtility.getBirdPositions({
      birdQueueSystem: this.birdQueueSystem,
      slingshot: this.slingshot,
      groundManager: this.groundManager,
      birdLaunchOrchestrator: this.birdLaunchOrchestrator,
    });
  }

  private checkGameState(): void {
    this.gameLifecycleManager.checkGameState();
  }

  public static loadMaxUnlockedLevel(): number {
    return ProgressManager.loadMaxUnlockedLevel();
  }

  public static getLevelProgress(
    levelId: number
  ): { stars: number; score: number; completed: boolean } | null {
    return ProgressManager.getLevelProgress(levelId);
  }

  // ==================== UPDATE LOOP ====================

  update(_time: number, delta: number): void {
    if (
      this.gameLifecycleManager.isGameOver() ||
      this.gameLifecycleManager.isTransitioning() ||
      this.gameStateManager.isPaused()
    )
      return;

    this.slingshot.update(delta);
    this.explosionShaderManager.update(delta);
    this.scorePopupManager.resetFrameBudget();
    this.vfxManager.update(this.entityManager.getPigs(), {
      minX: 0,
      minY: 0,
      maxX: LEVEL_WIDTH,
      maxY: LEVEL_HEIGHT,
    });
    this.scorePopupManager.processQueue();

    SceneSetup.updatePhysicsQualityProfile(
      this,
      this.physicsProfileState,
      TimingConfig.scene.physicsProfileUpdateInterval
    );

    const currentBird = this.birdLaunchOrchestrator.getCurrentBird();
    if (currentBird) {
      currentBird.update(delta);
    }

    this.birdLaunchOrchestrator.update();
    this.emitParallaxScroll();

    this.cleanupTimer += delta;
    if (this.cleanupTimer >= TimingConfig.scene.entityCleanupInterval) {
      this.cleanupTimer = 0;
      this.entityManager.cleanupFallenEntities();
    }
  }

  private emitParallaxScroll(): void {
    if (this.inputHandler.isAiming()) {
      return;
    }

    const camera = this.cameras.main;

    if (
      Math.abs(camera.scrollX - this.lastScrollX) < PARALLAX_CAMERA_CONFIG.scrollThreshold &&
      Math.abs(camera.scrollY - this.lastScrollY) < PARALLAX_CAMERA_CONFIG.scrollThreshold &&
      Math.abs(camera.zoom - this.lastZoom) < PARALLAX_CAMERA_CONFIG.zoomThreshold
    ) {
      return;
    }

    this.lastScrollX = camera.scrollX;
    this.lastScrollY = camera.scrollY;
    this.lastZoom = camera.zoom;

    gameEvents.emit("parallax:scroll", {
      scrollX: camera.scrollX,
      scrollY: camera.scrollY,
      zoom: camera.zoom,
    });
  }
}

export default GameScene;
