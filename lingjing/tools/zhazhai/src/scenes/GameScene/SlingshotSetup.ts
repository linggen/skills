import type Phaser from "phaser";
import type { LevelData } from "../../data/levels";
import type { IGroundManager } from "../../interfaces/IGroundManager";
import type { IBirdQueue } from "../../interfaces/IBirdQueue";
import type { ICameraController } from "../../systems/camera/ICameraController";
import type { ICameraEffects } from "../../interfaces/ICameraEffects";
import type { ISFXPlayer } from "../../interfaces/audio";
import type { IGameStateManager } from "../../systems/state/IGameStateManager";
import type { IPhysicsSettleDetector } from "../../interfaces/IPhysicsSettleDetector";
import type { IWakeCascadeManager } from "../../interfaces/IWakeCascadeManager";
import type { GameHapticsManager } from "../../systems/mobile/GameHapticsManager";
import {
  type PullData,
  type SlingshotCallbacks,
  SlingshotState,
} from "../../objects/slingshot-modules/SlingshotConfig";
import { Slingshot } from "../../objects/Slingshot";
import { BirdQueue } from "../../systems/BirdQueue";
import { BirdLaunchOrchestrator } from "./BirdLaunchOrchestrator";
import { GameConfig } from "../../config/GameConfig";
import { BirdType } from "../../types/BirdType";
import { DESTRUCTION_JUICE_CONFIG } from "../../config/PhysicsConfig";
import type { EntityManager } from "./EntityManager";

export interface SlingshotSetupResult {
  slingshot: Slingshot;
  birdQueueSystem: IBirdQueue;
  birdLaunchOrchestrator: BirdLaunchOrchestrator;
}

export interface SlingshotSetupDeps {
  scene: Phaser.Scene;
  levelData: LevelData | null;
  groundManager: IGroundManager;
  cameraController: ICameraController;
  cameraEffects: ICameraEffects;
  audioSystem: { sfx: ISFXPlayer };
  gameStateManager: IGameStateManager;
  physicsSettleDetector: IPhysicsSettleDetector;
  wakeCascadeManager: IWakeCascadeManager;
  entityManager: EntityManager;
  hapticsManager?: GameHapticsManager;
  checkGameState: () => void;
  updateUI: () => void;
  updateBirdQueueUI: () => void;
  canEarlySettle: () => boolean;
  getCurrentCombo: () => number;
  flushCombo: () => void;
  onSlingshotStateChange: (state: SlingshotState, bird?: Phaser.GameObjects.Image) => void;
  // Destruction tracking callbacks
  hasQueuedFragments: () => boolean;
  getLastDestructionTime: () => number;
  getDestructionCount: () => number;
}

export class SlingshotSetup {
  public static create(deps: SlingshotSetupDeps): SlingshotSetupResult {
    const {
      scene,
      levelData,
      groundManager,
      cameraController,
      cameraEffects,
      audioSystem,
      gameStateManager,
      physicsSettleDetector,
      wakeCascadeManager,
      entityManager,
      hapticsManager,
      checkGameState,
      updateUI,
      updateBirdQueueUI,
      canEarlySettle,
      getCurrentCombo,
      flushCombo,
      onSlingshotStateChange,
      hasQueuedFragments,
      getLastDestructionTime,
      getDestructionCount,
    } = deps;

    const groundY = groundManager.getGroundY();
    const slingshotX = levelData?.slingshot?.x;
    const slingshotY = groundY - GameConfig.slingshot.yOffsetFromGround;

    const orchestratorHolder = { current: null as BirdLaunchOrchestrator | null };

    const slingshotCallbacks: SlingshotCallbacks = {
      onLaunch: (velocity: Phaser.Math.Vector2) =>
        orchestratorHolder.current!.handleLaunch(velocity),
      onPullChange: (pullData: PullData) => orchestratorHolder.current!.handlePullChange(pullData),
      onBirdStateChanged: onSlingshotStateChange,
    };

    const slingshot = new Slingshot(scene, slingshotX, slingshotY, {}, slingshotCallbacks);

    const pouchRestPos = slingshot.getBirdRestPosition();
    const birdQueueSystem = new BirdQueue(scene, pouchRestPos, groundY);

    const birdTypes = levelData?.birds?.map((b) => b.type) ?? [
      BirdType.RED,
      BirdType.YELLOW,
      BirdType.BLACK,
      BirdType.WHITE,
      BirdType.BLUE,
    ];
    birdQueueSystem.setQueue(birdTypes);
    gameStateManager.setBirdsRemaining(birdTypes.length);

    const birdLaunchOrchestrator = new BirdLaunchOrchestrator({
      scene,
      entityManager,
      slingshot: {
        getState: () => slingshot.getState(),
        reset: () => slingshot.reset(),
        getBirdRestPosition: () => slingshot.getBirdRestPosition(),
        placeBird: (image, config) => slingshot.placeBird(image, config),
        onBirdLanded: (sprite, getBounceY, onComplete) =>
          slingshot.onBirdLanded(sprite, getBounceY, onComplete),
        clearTrajectory: () => slingshot.clearTrajectory(),
        fire: () => slingshot.fire(),
        drawTrajectory: (pullData) => slingshot.drawTrajectory(pullData),
      },
      birdQueueSystem,
      cameraController,
      cameraEffects,
      sfx: audioSystem.sfx,
      gameStateManager,
      physicsSettleDetector,
      wakeCascadeManager,
      checkGameState,
      updateUI,
      updateBirdQueueUI,
      canEarlySettle,
      getCurrentCombo,
      getDestructionScale: (comboCount: number) => DESTRUCTION_JUICE_CONFIG.getScale(comboCount),
      flushCombo,
      hasQueuedFragments,
      getLastDestructionTime,
      getDestructionCount,
      hapticsManager,
    });

    orchestratorHolder.current = birdLaunchOrchestrator;

    return {
      slingshot,
      birdQueueSystem,
      birdLaunchOrchestrator,
    };
  }
}
