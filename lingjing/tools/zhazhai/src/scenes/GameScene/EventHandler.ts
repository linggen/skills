import Phaser from "phaser";
import { gameEvents, type GameEvents, SubscriptionGroup } from "../../events/EventBus";
import type { IScoringSystem } from "../../systems/scoring/IScoringSystem";
import type { IScorePopupManager } from "../../interfaces/IScorePopupManager";
import type { ICameraController } from "../../systems/camera/ICameraController";
import type { ICameraEffects } from "../../interfaces/ICameraEffects";
import type { IGameStateManager } from "../../systems/state/IGameStateManager";
import type { IPhysicsSettleDetector } from "../../interfaces/IPhysicsSettleDetector";
import type { BirdLaunchOrchestrator } from "./BirdLaunchOrchestrator";
import { BodyLabelHelpers } from "../../constants/BodyLabels";
import { defaultCameraAbilityPolicy } from "../../systems/camera/CameraAbilityPolicy";
import type { ProjectileCameraHandoffPolicy } from "../../systems/camera/ProjectileCameraHandoffPolicy";

export interface EventHandlerDeps {
  scene: Phaser.Scene;
  scoringSystem: IScoringSystem;
  scorePopupManager: IScorePopupManager;
  cameraController: ICameraController;
  cameraEffects: ICameraEffects;
  gameStateManager: IGameStateManager;
  physicsSettleDetector: IPhysicsSettleDetector;
  birdLaunchOrchestrator: BirdLaunchOrchestrator;
  updateUI: () => void;
}

export class EventHandler {
  private deps: EventHandlerDeps;
  private subscriptions: SubscriptionGroup;

  private boundBirdCollision: (event: GameEvents["birdCollision"]) => void;
  private boundBirdLanded: (event: GameEvents["birdLanded"]) => void;
  private boundPigDestroyed: (event: GameEvents["pigDestroyed"]) => void;
  private boundPauseToggle: (data: GameEvents["ui-pause-toggle"]) => void;
  private boundAbilityActivated: (event: GameEvents["birdAbilityActivated"]) => void;
  private boundSplitCameraHandoff: (event: GameEvents["splitCameraHandoff"]) => void;

  constructor(deps: EventHandlerDeps) {
    this.deps = deps;
    this.subscriptions = new SubscriptionGroup();

    this.boundBirdCollision = this.handleBirdCollision.bind(this);
    this.boundBirdLanded = this.handleBirdLanded.bind(this);
    this.boundPigDestroyed = this.handlePigDestroyed.bind(this);
    this.boundPauseToggle = this.handlePauseToggleFromUI.bind(this);
    this.boundAbilityActivated = this.handleBirdAbilityActivated.bind(this);
    this.boundSplitCameraHandoff = this.handleSplitCameraHandoff.bind(this);

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.subscriptions.add(gameEvents.subscribe("birdCollision", this.boundBirdCollision, this));
    this.subscriptions.add(gameEvents.subscribe("birdLanded", this.boundBirdLanded, this));
    this.subscriptions.add(gameEvents.subscribe("pigDestroyed", this.boundPigDestroyed, this));
    this.subscriptions.add(gameEvents.subscribe("ui-pause-toggle", this.boundPauseToggle, this));
    this.subscriptions.add(
      gameEvents.subscribe("birdAbilityActivated", this.boundAbilityActivated, this)
    );
    this.subscriptions.add(
      gameEvents.subscribe("splitCameraHandoff", this.boundSplitCameraHandoff, this)
    );
  }

  private handleBirdCollision(event: GameEvents["birdCollision"]): void {
    const { target, x, y, impactSpeed } = event;

    if (BodyLabelHelpers.isPig(target) || BodyLabelHelpers.isBlock(target)) {
      this.focusCameraOnAction(x, y, impactSpeed);

      const isPig = BodyLabelHelpers.isPig(target);
      const points = this.deps.scoringSystem.calculateImpactPoints(impactSpeed, isPig);
      this.deps.scoringSystem.addImpactPoints(impactSpeed, isPig);
      this.deps.scorePopupManager.show(x, y, points);
    }
  }

  private handleBirdLanded(_event: GameEvents["birdLanded"]): void {
    this.deps.physicsSettleDetector.reset();
  }

  private handlePigDestroyed(_event: GameEvents["pigDestroyed"]): void {
    this.deps.gameStateManager.decrementPigs();
    this.deps.updateUI();
  }

  private focusCameraOnAction(x: number, y: number, impactSpeed: number): void {
    if (!this.deps.birdLaunchOrchestrator.hasActiveFlyingBird()) return;

    if (this.deps.cameraController.isInImpactFocus()) {
      this.deps.cameraController.expandImpactFocus(x, y);
      return;
    }

    this.deps.cameraController.beginImpactFocus(x, y, impactSpeed);
  }

  private handleBirdAbilityActivated(event: GameEvents["birdAbilityActivated"]): void {
    const feedback = defaultCameraAbilityPolicy.getAbilityFeedback(event.type);

    this.deps.cameraEffects.hitPause(feedback.hitPauseMs);

    if (feedback.shake) {
      this.deps.cameraEffects.shake(feedback.shake.intensity, feedback.shake.durationMs);
    }
  }

  private handleSplitCameraHandoff(event: GameEvents["splitCameraHandoff"]): void {
    const policy: ProjectileCameraHandoffPolicy =
      defaultCameraAbilityPolicy.getProjectileHandoffPolicy("split");

    this.deps.birdLaunchOrchestrator.handoffCameraToProjectile(event.target, {
      velocity: event.velocity,
      policy,
    });
  }

  private handlePauseToggleFromUI(data: GameEvents["ui-pause-toggle"]): void {
    this.deps.gameStateManager.setPaused(data.isPaused);
    gameEvents.emit("ui-pause", { isPaused: this.deps.gameStateManager.isPaused() });
  }

  destroy(): void {
    this.subscriptions.disposeAll();
  }
}
