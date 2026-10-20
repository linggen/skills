import Phaser from "phaser";
import { Bird } from "../../objects/Bird";
import { BIRD_PHYSICS } from "../../config/PhysicsConfig";
import { DesignTokens } from "../../config/DesignTokens";
import { CAMERA_LAUNCH_EFFECTS_CONFIG } from "../../config/VFXConfig";
import { FOLLOW_CONFIG, SHAKE_CONFIG } from "../../config/CameraConfig";
import { SlingshotState, type PullData } from "../../objects/slingshot-modules/SlingshotConfig";
import type { ICameraController } from "../../systems/camera/ICameraController";
import type { ISFXPlayer } from "../../interfaces/audio";
import type { IGameStateManager } from "../../systems/state/IGameStateManager";
import type { IPhysicsSettleDetector } from "../../interfaces/IPhysicsSettleDetector";
import type { IBirdQueue } from "../../interfaces/IBirdQueue";
import type { ICameraEffects } from "../../interfaces/ICameraEffects";
import type { ProjectileCameraHandoffPolicy } from "../../systems/camera/ProjectileCameraHandoffPolicy";
import type { Position, Velocity } from "../../types/Vector2";
import type { IWakeCascadeManager } from "../../interfaces/IWakeCascadeManager";
import type { GameHapticsManager } from "../../systems/mobile/GameHapticsManager";
import { gameObjectFactory } from "../../factories";
import type { BirdShapeConfig } from "../../utils/TrajectorySimulator";
import type { EntityManager } from "./EntityManager";

interface CameraMotionSource {
  getPosition(): Position;
  getVelocity(): Velocity;
}

interface ProjectileCameraHandoffOptions {
  velocity?: Velocity;
  policy: ProjectileCameraHandoffPolicy;
}

export interface BirdLaunchOrchestratorDeps {
  scene: Phaser.Scene;
  entityManager: EntityManager;
  slingshot: {
    getState: () => SlingshotState;
    reset: () => void;
    getBirdRestPosition: () => Position;
    placeBird: (image: Phaser.Physics.Matter.Image, config: BirdShapeConfig) => void;
    onBirdLanded: (
      sprite: Phaser.GameObjects.Image,
      getBounceY: (t: number) => number,
      onComplete: () => void
    ) => void;
    clearTrajectory: () => void;
    fire: () => void;
    drawTrajectory: (pullData: PullData | null) => void;
  };
  birdQueueSystem: IBirdQueue;
  cameraController: ICameraController;
  cameraEffects: ICameraEffects;
  sfx: ISFXPlayer;
  gameStateManager: IGameStateManager;
  physicsSettleDetector: IPhysicsSettleDetector;
  wakeCascadeManager: IWakeCascadeManager;
  checkGameState: () => void;
  updateUI: () => void;
  updateBirdQueueUI: () => void;
  canEarlySettle: () => boolean;
  getCurrentCombo: () => number;
  getDestructionScale: (comboCount: number) => string;
  flushCombo: () => void;
  hasQueuedFragments: () => boolean;
  getLastDestructionTime: () => number;
  getDestructionCount: () => number;
  hapticsManager?: GameHapticsManager;
}

export class BirdLaunchOrchestrator {
  private currentBird: Bird | null = null;
  private deps: BirdLaunchOrchestratorDeps;
  private activeCameraMotionSource: CameraMotionSource | null = null;
  private pendingTimers: Phaser.Time.TimerEvent[] = [];

  constructor(deps: BirdLaunchOrchestratorDeps) {
    this.deps = deps;
  }

  getCurrentBird(): Bird | null {
    return this.currentBird;
  }

  hasCurrentBird(): boolean {
    return this.currentBird !== null;
  }

  hasActiveFlyingBird(): boolean {
    return !!(this.currentBird && !this.currentBird.isDestroyed() && this.currentBird.isLaunched());
  }

  canActivateAbility(): boolean {
    return !!(this.currentBird && this.currentBird.canActivateAbility());
  }

  activateAbility(): void {
    this.currentBird?.activateAbility();
  }

  spawnNextBird(): void {
    if (this.currentBird && !this.currentBird.isDestroyed() && this.currentBird.isLaunched()) {
      return;
    }

    const slingshot = this.deps.slingshot;

    if (slingshot.getState() === SlingshotState.FIRED) {
      slingshot.reset();
    }

    const currentState = slingshot.getState();
    if (currentState !== SlingshotState.IDLE && currentState !== SlingshotState.FIRED) {
      return;
    }

    const birdType = this.deps.birdQueueSystem?.getNextBird();
    if (!birdType) {
      this.deps.checkGameState();
      return;
    }

    this.deps.birdQueueSystem?.jumpToPouch(
      (birdSprite, getBounceY, onBounceComplete) => {
        slingshot.onBirdLanded(birdSprite, getBounceY, onBounceComplete);
        this.deps.cameraEffects.shakeFromImpact(SHAKE_CONFIG.birdLandIntensity);
      },
      (landingX, landingY) => {
        this.currentBird = gameObjectFactory.createBird(this.deps.scene, {
          x: landingX,
          y: landingY,
          type: birdType,
          wakeManager: this.deps.wakeCascadeManager,
        });

        this.deps.entityManager.addBird(this.currentBird);

        const matterImage = this.currentBird.getMatterImage();
        if (matterImage) {
          matterImage.setStatic(true);
          matterImage.setDepth(DesignTokens.depth.bird);

          const birdConfig = BIRD_PHYSICS[birdType];
          if (birdConfig) {
            const collisionShape = birdConfig.width && birdConfig.height ? "rectangle" : "circle";
            const birdShape: BirdShapeConfig = {
              shape: collisionShape,
              radius: birdConfig.radius,
              width: birdConfig.width,
              height: birdConfig.height,
              mass: birdConfig.density * Math.PI * birdConfig.radius * birdConfig.radius,
            };
            slingshot.placeBird(matterImage, birdShape);
          }
        }
      }
    );
  }

  fireBird(): void {
    this.deps.cameraController.beginReleaseHold();
    this.deps.slingshot.clearTrajectory();
    this.deps.slingshot.fire();
  }

  private createMatterMotionSource(
    target: Phaser.GameObjects.GameObject
  ): CameraMotionSource | null {
    const matterTarget = target as Phaser.Physics.Matter.Image;
    const body = matterTarget.body;

    if (!body) {
      return null;
    }

    return {
      getPosition: () => ({ x: matterTarget.x, y: matterTarget.y }),
      getVelocity: () => ({ x: body.velocity.x, y: body.velocity.y }),
    };
  }

  private startCameraFlight(
    target: Phaser.GameObjects.GameObject,
    motionSource: CameraMotionSource,
    velocity?: Velocity,
    preserveFlightFraming: boolean = false
  ): void {
    this.activeCameraMotionSource = motionSource;
    this.deps.cameraController.startFollow(target, {
      lerp: FOLLOW_CONFIG.lerp,
      roundPixels: true,
      preserveOffset: preserveFlightFraming,
      manualTracking: true,
    });

    if (!preserveFlightFraming) {
      this.deps.cameraController.beginFlight(velocity);
    }
  }

  public trackLaunchedBird(velocity: Velocity): void {
    const matterImage = this.currentBird?.getMatterImage();
    if (!matterImage || !this.currentBird) {
      return;
    }

    this.startCameraFlight(matterImage, this.currentBird, velocity);
  }

  public handoffCameraToProjectile(
    target: Phaser.GameObjects.GameObject,
    options: ProjectileCameraHandoffOptions
  ): void {
    const { policy } = options;

    if (this.deps.cameraController.isInImpactFocus() && !policy.canInterruptImpactFocus) {
      return;
    }

    if (this.deps.cameraController.isInImpactFocus() && policy.canInterruptImpactFocus) {
      this.deps.cameraController.releaseImpactFocus();
    }

    const motionSource = this.createMatterMotionSource(target);
    if (!motionSource) {
      return;
    }

    this.startCameraFlight(
      target,
      motionSource,
      options.velocity ?? motionSource.getVelocity(),
      policy.preserveFlightFraming
    );
  }

  public releaseCameraTracking(): void {
    this.activeCameraMotionSource = null;
    this.deps.cameraController.stopFollow();
  }

  handleLaunch(velocity: Phaser.Math.Vector2): void {
    if (!this.currentBird) return;

    const launchSpeed = velocity.length();

    this.deps.sfx.playBirdLaunch(launchSpeed);
    this.deps.hapticsManager?.triggerSlingshotFire();
    this.currentBird.launch(velocity.x, velocity.y);
    this.deps.gameStateManager.decrementBirds();
    this.deps.updateUI();
    this.deps.updateBirdQueueUI();

    if (launchSpeed > CAMERA_LAUNCH_EFFECTS_CONFIG.launchSpeedThresholdLow) {
      this.deps.cameraEffects.rumble(
        Math.min(
          CAMERA_LAUNCH_EFFECTS_CONFIG.rumbleIntensitySpeedFactor,
          launchSpeed * CAMERA_LAUNCH_EFFECTS_CONFIG.rumbleIntensityBase
        ),
        CAMERA_LAUNCH_EFFECTS_CONFIG.rumbleDurationBase
      );
    }

    this.trackLaunchedBird({ x: velocity.x, y: velocity.y });

    this.deps.physicsSettleDetector.startMonitoring({
      onSettled: () => {
        if (this.deps.cameraController.isFollowing()) {
          this.releaseCameraTracking();
        }

        this.currentBird = null;

        // Read combo count BEFORE flushing — needed for linger/zoom decisions
        const comboCount = this.deps.getCurrentCombo();

        // Flush any pending combo immediately so its points land in the scoring
        // system before checkGameState() captures the final score breakdown
        this.deps.flushCombo();

        const lingerDuration = Math.min(
          CAMERA_LAUNCH_EFFECTS_CONFIG.destructionLingerMax,
          CAMERA_LAUNCH_EFFECTS_CONFIG.destructionLingerMin +
            Math.max(comboCount - 1, 0) * CAMERA_LAUNCH_EFFECTS_CONFIG.destructionLingerThreshold
        );

        // Zoom out to showcase destruction, scaled by combo tier
        const scale = this.deps.getDestructionScale(comboCount);
        this.deps.cameraController.beginDestructionShowcase(scale);

        // During linger, camera stays zoomed out showing destruction
        const timer = this.deps.scene.time.delayedCall(lingerDuration, () => {
          this.deps.cameraController.resetToInitial();
          this.deps.checkGameState();
        });
        this.pendingTimers.push(timer);
      },
      canEarlySettle: () => this.deps.canEarlySettle(),
      hasQueuedFragments: () => this.deps.hasQueuedFragments(),
      getLastDestructionTime: () => this.deps.getLastDestructionTime(),
      getDestructionCount: () => this.deps.getDestructionCount(),
    });
  }

  handlePullChange(pullData: PullData | null): void {
    if (pullData) {
      this.deps.cameraController.applyAimAssist(pullData.angle, pullData.powerRatio);
      this.deps.hapticsManager?.triggerSlingshotPull(pullData.powerRatio);
    } else {
      this.deps.cameraController.clearAimAssist();
    }

    this.deps.slingshot.drawTrajectory(pullData);
  }

  update(): void {
    if (!this.activeCameraMotionSource || !this.deps.cameraController.isFollowing()) return;

    const bird = this.currentBird;
    if (!bird || bird.isDestroyed()) {
      this.releaseCameraTracking();
      return;
    }

    const matterImage = bird.getMatterImage();
    if (!matterImage?.body) {
      this.releaseCameraTracking();
      return;
    }

    this.deps.cameraController.update(
      this.activeCameraMotionSource.getPosition(),
      this.activeCameraMotionSource.getVelocity()
    );
  }

  destroy(): void {
    this.pendingTimers.forEach((t) => t.remove());
    this.pendingTimers = [];

    this.activeCameraMotionSource = null;
    if (this.currentBird) {
      this.currentBird.destroy();
      this.currentBird = null;
    }
  }
}
