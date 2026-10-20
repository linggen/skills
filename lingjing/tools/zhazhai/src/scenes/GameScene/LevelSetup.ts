import type Phaser from "phaser";
import type { LevelData } from "../../data/levels";
import type { IGameStateManager } from "../../systems/state/IGameStateManager";
import type { IScoringSystem } from "../../systems/scoring/IScoringSystem";
import type { IProgressManager } from "../../systems/progress/IProgressManager";
import type { IJinglePlayer, IUIAudioPlayer } from "../../interfaces/audio";
import type { IScorePopupManager } from "../../interfaces/IScorePopupManager";
import type { IBirdQueue } from "../../interfaces/IBirdQueue";
import type { ICameraController } from "../../systems/camera/ICameraController";
import type { ILevelBuilder, LevelBuilderCallbacks } from "../../systems/level/ILevelBuilder";
import type { IExplosionSystem } from "../../systems/explosion/IExplosionSystem";
import type { IPhysicsSettleDetector } from "../../interfaces/IPhysicsSettleDetector";
import type { IGroundManager } from "../../interfaces/IGroundManager";
import type { IVFXManager } from "../../interfaces/IVFXManager";
import type { Pig } from "../../objects/Pig";
import type { Block } from "../../objects/Block";
import type { DestructionTracker } from "../../systems/DestructionTracker";
import type { BlockPreWarmConfig } from "../../systems/fragment/FragmentAtlasCache";
import { ensureOversizedTextureExists } from "../../config/assetManifest";
import {
  GameLifecycleManager,
  type GameLifecycleDeps,
} from "../../systems/game/GameLifecycleManager";
import { TimingConfig } from "../../config/TimingConfig";

export interface LevelSetupResult {
  gameLifecycleManager: GameLifecycleManager;
  pigs: Pig[];
  blocks: Block[];
}

export interface LevelSetupDeps {
  scene: Phaser.Scene;
  levelData: LevelData;
  level: number;
  levelBuilder: ILevelBuilder;
  groundManager: IGroundManager;
  gameStateManager: IGameStateManager;
  scoringSystem: IScoringSystem;
  progressManager: IProgressManager;
  explosionSystem: IExplosionSystem;
  cameraController: ICameraController;
  physicsSettleDetector: IPhysicsSettleDetector;
  scorePopupManager: IScorePopupManager;
  birdQueueSystem: IBirdQueue;
  jingles: IJinglePlayer;
  ui: IUIAudioPlayer;
  comboTracker: { flushCombo: () => void };
  entityManager: {
    setPigs: (pigs: Pig[]) => void;
    setBlocks: (blocks: Block[]) => void;
  };
  onPigDestroyed: (pig: Pig) => void;
  onBlockDestroyed: (
    block: Block,
    impactSpeed: number,
    impactAngle: number,
    impactX?: number,
    impactY?: number
  ) => void;
  onBlockDamaged: (
    block: Block,
    damage: number,
    health: number,
    impactSpeed: number,
    impactAngle: number,
    impactX?: number,
    impactY?: number
  ) => void;
  spawnNextBird: () => void;
  updateUI: () => void;
  getBirdPositionsForCelebration: () => { x: number; y: number; texture: string }[];
  destructionTracker: DestructionTracker;
  vfxManager: IVFXManager;
}

export class LevelSetup {
  public static build(deps: LevelSetupDeps): LevelSetupResult {
    const {
      scene,
      levelData,
      levelBuilder,
      groundManager,
      gameStateManager,
      scoringSystem,
      progressManager,
      explosionSystem,
      cameraController,
      physicsSettleDetector,
      scorePopupManager,
      birdQueueSystem,
      jingles,
      ui,
      comboTracker,
      entityManager,
      onPigDestroyed,
      onBlockDestroyed,
      onBlockDamaged,
      spawnNextBird,
      updateUI,
      getBirdPositionsForCelebration,
    } = deps;

    const groundY = groundManager.getGroundY();

    const callbacks: LevelBuilderCallbacks = {
      onPigDestroyed,
      onBlockDestroyed,
      onBlockDamaged,
      onBlockExplode: (block) => explosionSystem.triggerBlockExplosion(block),
    };

    const result = levelBuilder.build(levelData, groundY, callbacks);
    entityManager.setPigs(result.pigs);
    entityManager.setBlocks(result.blocks);

    gameStateManager.setPigsRemaining(result.pigs.length);

    explosionSystem.setEntities(result.blocks, result.pigs);
    cameraController.setEntities(result.pigs, result.blocks);

    levelBuilder.enableBlockPhysics();
    this.preWarmFragmentAtlases(result.blocks, deps.vfxManager);

    const lifecycleDeps: GameLifecycleDeps = {
      scene,
      gameStateManager,
      scoringSystem,
      progressManager,
      jingles,
      ui,
      scorePopupManager,
      birdQueueSystem,
      levelData,
      level: deps.level,
      pigs: result.pigs,
      getBirdPositions: getBirdPositionsForCelebration,
      flushCombo: () => comboTracker.flushCombo(),
      destructionTracker: deps.destructionTracker,
      vfxManager: deps.vfxManager,
    };

    const gameLifecycleManager = new GameLifecycleManager(lifecycleDeps);
    gameLifecycleManager.setCallbacks({
      spawnNextBird: () => {
        scene.time.delayedCall(TimingConfig.slingshot.bandRelaxDuration, spawnNextBird);
      },
      updateUI,
    });

    this.startInitialPhysicsMonitoring({
      scene,
      gameStateManager,
      physicsSettleDetector,
      gameLifecycleManager,
      comboTracker,
    });

    return {
      gameLifecycleManager,
      pigs: result.pigs,
      blocks: result.blocks,
    };
  }

  private static startInitialPhysicsMonitoring(params: {
    scene: Phaser.Scene;
    gameStateManager: IGameStateManager;
    physicsSettleDetector: IPhysicsSettleDetector;
    gameLifecycleManager: GameLifecycleManager;
    comboTracker: { flushCombo: () => void };
  }): void {
    const { scene, gameStateManager, physicsSettleDetector, gameLifecycleManager, comboTracker } =
      params;

    scene.time.delayedCall(TimingConfig.slingshot.bandRelaxDuration, () => {
      if (gameStateManager.getPigsRemaining() <= 0) {
        comboTracker.flushCombo();
        gameLifecycleManager.checkGameState();
        return;
      }

      physicsSettleDetector.startMonitoring({
        onSettled: () => {
          if (gameStateManager.getPigsRemaining() <= 0) {
            comboTracker.flushCombo();
            gameLifecycleManager.checkGameState();
          }
        },
        canEarlySettle: () => gameLifecycleManager.canEarlySettle(),
      });
    });
  }

  /**
   * Pre-warm fragment atlases for all unique block configurations in the level.
   * This generates atlases during scene loading to avoid frame spikes during gameplay.
   */
  private static preWarmFragmentAtlases(blocks: Block[], vfxManager: IVFXManager): void {
    if (!vfxManager.preWarmFragmentAtlases || blocks.length === 0) return;

    const scene = blocks[0].scene;

    const configMap = new Map<string, BlockPreWarmConfig>();

    for (const block of blocks) {
      const textureKey = block.getTextureKey();
      const width = block.getWidth();
      const height = block.getHeight();
      const material = block.getMaterial();

      const configKey = `${material}_${textureKey}_${width}x${height}`;

      if (!configMap.has(configKey)) {
        configMap.set(configKey, {
          material,
          textureKey,
          width,
          height,
        });
      }

      const conditions: Array<"pristine" | "dented" | "cracked"> = [
        "pristine",
        "dented",
        "cracked",
      ];
      for (const condition of conditions) {
        const texKey = `${material}_${block.shape}_${condition}_${block.gridW}x${block.gridH}`;
        ensureOversizedTextureExists(scene, texKey);
      }
    }

    const configs = Array.from(configMap.values());

    vfxManager.preWarmFragmentAtlases(configs).catch((err) => {
      console.debug("FragmentAtlasCache: Pre-warm failed (will generate on-demand)", err);
    });
  }
}
