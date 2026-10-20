import Phaser from "phaser";
import { ICameraController, CameraControllerDeps, CameraFollowConfig } from "./ICameraController";
import { CameraMode, blocksAimReset } from "./CameraMode";
import { FlightBehavior } from "./behaviors/FlightBehavior";
import { ImpactBehavior } from "./behaviors/ImpactBehavior";
import { SequenceBehavior } from "./behaviors/SequenceBehavior";
import { FollowBehavior } from "./behaviors/FollowBehavior";
import { DragInertiaHandler } from "./DragInertiaHandler";
import { ZoomController } from "./ZoomController";
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from "../../config";
import { Pig } from "../../objects/Pig";
import { Block } from "../../objects/Block";
import { LEVEL_WIDTH, LEVEL_HEIGHT } from "../../config/GameConfig";
import { FOLLOW_CONFIG, ZOOM_CONFIG, IMPACT_CONFIG } from "../../config/CameraConfig";
import type { Position, Velocity } from "../../types/Vector2";

export class CameraController implements ICameraController {
  private readonly flightBehavior = new FlightBehavior(ZOOM_CONFIG.max);
  private scene: Phaser.Scene;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private slingshotX: number = 180;
  private pigs: Pig[] = [];
  private blocks: Block[] = [];
  private cachedFurthestX: number | null = null;
  private cachedTopmostY: number | null = null;
  private boundsCacheFrame: number = -1;
  private manualZoomActive: boolean = false;
  private manualZoomTargetScroll: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private cameraMode: CameraMode = CameraMode.Idle;

  private followBehavior: FollowBehavior;
  private impactBehavior: ImpactBehavior;
  private sequenceBehavior: SequenceBehavior;
  private dragInertiaHandler: DragInertiaHandler;
  private zoomController: ZoomController;

  constructor(deps: CameraControllerDeps) {
    this.scene = deps.scene;
    this.camera = deps.scene.cameras.main;

    this.zoomController = new ZoomController({
      scene: this.scene,
      camera: this.camera,
    });

    this.dragInertiaHandler = new DragInertiaHandler({
      camera: this.camera,
      getScrollBoundsForZoom: (zoom) => this.getScrollBoundsForZoom(zoom),
      destroyResetTween: () => this.sequenceBehavior?.destroyResetTween(),
    });

    this.followBehavior = new FollowBehavior({
      scene: this.scene,
      camera: this.camera,
      getScrollBoundsForZoom: (zoom) => this.getScrollBoundsForZoom(zoom),
      getFloorAlignedScrollY: () => this.getFloorAlignedScrollY(),
      destroyResetTween: () => this.sequenceBehavior?.destroyResetTween(),
      resetDragVelocity: () => this.dragInertiaHandler.resetVelocity(),
      getCameraMode: () => this.cameraMode,
    });

    this.impactBehavior = new ImpactBehavior({
      scene: this.scene,
      camera: this.camera,
      getFloorAlignedScrollY: () => this.getFloorAlignedScrollY(),
      getScrollBoundsForZoom: (zoom) => this.getScrollBoundsForZoom(zoom),
      setCameraMode: (mode) => this.setCameraMode(mode),
      stopFollow: () => this.stopFollow(),
      resetDragVelocity: () => this.dragInertiaHandler.resetVelocity(),
      destroyResetTween: () => this.sequenceBehavior?.destroyResetTween(),
      setZoomTarget: (zoom) => this.zoomController.setTarget(zoom),
      setZoomVelocity: (vel) => this.zoomController.setVelocity(vel),
    });

    this.sequenceBehavior = new SequenceBehavior({
      scene: this.scene,
      camera: this.camera,
      getFurthestTargetX: () => this.getFurthestTargetX(),
      getScrollBoundsForZoom: (zoom) => this.getScrollBoundsForZoom(zoom),
      getFloorAlignedScrollY: () => this.getFloorAlignedScrollY(),
      getInitialScrollForZoom: (zoom) => this.getInitialScrollForZoom(zoom),
      setZoomTarget: (zoom) => this.zoomController.setTarget(zoom),
      setZoomVelocity: (vel) => this.zoomController.setVelocity(vel),
      resetDragVelocity: () => this.dragInertiaHandler.resetVelocity(),
    });
  }

  private setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
  }

  setup(slingshotX: number, _groundY: number): void {
    this.slingshotX = slingshotX;
    const { minScrollX } = this.getScrollBoundsForZoom(ZOOM_CONFIG.max);

    this.camera.setBounds(minScrollX / 4, 0, LEVEL_WIDTH - minScrollX, LEVEL_HEIGHT);
    this.camera.setZoom(ZOOM_CONFIG.max);
    this.camera.setRoundPixels(true);
    this.camera.setBackgroundColor("rgba(0,0,0,0)");
    this.zoomController.reset();
    this.setCameraMode(CameraMode.Idle);
    this.flightBehavior.reset(ZOOM_CONFIG.max);

    this.setInitialPosition();

    this.sequenceBehavior.destroyResetTween();
    this.impactBehavior.reset();
    this.followBehavior.reset();

    this.scene.events.on("update", this.updateSmoothCamera, this);
  }

  private setInitialPosition(): void {
    const { x: targetX, y: targetY } = this.getInitialScrollForZoom(this.camera.zoom);
    this.camera.setScroll(targetX, targetY);
  }

  private getFloorAlignedScrollY(): number {
    return LEVEL_HEIGHT - VIEWPORT_HEIGHT;
  }

  private getInitialScrollForZoom(zoom: number): Position {
    const { minScrollX, maxScrollX } = this.getScrollBoundsForZoom(zoom);
    const viewportWidth = VIEWPORT_WIDTH / zoom;
    const targetX = Phaser.Math.Clamp(
      this.slingshotX - viewportWidth * FOLLOW_CONFIG.initialSlingshotScreenX,
      minScrollX,
      maxScrollX
    );
    const targetY = this.getFloorAlignedScrollY();
    return { x: targetX, y: targetY };
  }

  private getImpactScrollForZoom(zoom: number): Position {
    return (
      this.impactBehavior.getScrollForZoom({
        zoom,
        viewportWidth: VIEWPORT_WIDTH,
        bounds: this.getScrollBoundsForZoom(zoom),
      }) ?? this.getInitialScrollForZoom(zoom)
    );
  }

  private clearImpactFocusState(): void {
    this.impactBehavior.reset();
    if (this.cameraMode === CameraMode.ImpactFocus) {
      this.setCameraMode(CameraMode.Idle);
    }
  }

  private getScrollBoundsForZoom(zoom: number): { minScrollX: number; maxScrollX: number } {
    const viewportWidth = VIEWPORT_WIDTH / zoom;
    const desiredScrollX = this.slingshotX - viewportWidth * FOLLOW_CONFIG.initialSlingshotScreenX;
    const minScrollX = Math.min(0, desiredScrollX);
    const maxScrollX = Math.max(minScrollX, LEVEL_WIDTH - viewportWidth);
    return { minScrollX, maxScrollX };
  }

  startFollow(target: Phaser.GameObjects.GameObject, config?: CameraFollowConfig): void {
    this.followBehavior.start(target, config);
  }

  setFollowLerp(lerp: number): void {
    this.followBehavior.setLerp(lerp);
  }

  stopFollow(): void {
    this.followBehavior.stop();
  }

  private updateSmoothCamera(): void {
    if (!this.followBehavior.isActive()) {
      this.dragInertiaHandler.update();
    }

    this.followBehavior.updateOffsetBlend();

    if (!this.sequenceBehavior.isAimResetInProgress()) {
      this.zoomController.update(this.scene.game.loop.delta);
    }

    if (this.manualZoomActive) {
      const zoomDiff = Math.abs(this.camera.zoom - this.zoomController.getTarget());
      this.camera.scrollX = Phaser.Math.Linear(
        this.camera.scrollX,
        this.manualZoomTargetScroll.x,
        0.15
      );
      this.camera.scrollY = Phaser.Math.Linear(
        this.camera.scrollY,
        this.manualZoomTargetScroll.y,
        0.15
      );

      if (zoomDiff < 0.001) {
        this.manualZoomActive = false;
      }
    }

    if (this.followBehavior.isActive() && this.followBehavior.isManualTrackingActive()) {
      this.followBehavior.updateManualScroll();
    }

    if (this.impactBehavior.isActive()) {
      const targetScroll = this.getImpactScrollForZoom(this.camera.zoom);
      const rightwardTargetX = Math.max(this.camera.scrollX, targetScroll.x);

      this.camera.scrollX = Phaser.Math.Linear(
        this.camera.scrollX,
        rightwardTargetX,
        IMPACT_CONFIG.followLerp
      );
      this.camera.scrollY = targetScroll.y;
    }
  }

  update(birdPos: Position, birdVel: Velocity): void {
    if (!this.followBehavior.isActive()) return;

    this.followBehavior.updateTargetPosition(birdPos.x, birdPos.y);

    const framingInput = this.getFlightFramingInput(birdPos, birdVel);
    this.applyFlightFraming(framingInput);
  }

  applyAimAssist(angle: number, powerRatio: number): void {
    if (this.sequenceBehavior.isAimResetInProgress()) {
      return;
    }

    if (this.sequenceBehavior.getResetTween()) {
      this.sequenceBehavior.destroyResetTween();
    }

    this.setCameraMode(CameraMode.Aim);
    this.flightBehavior.reset(ZOOM_CONFIG.max);
    this.followBehavior.setTargetOffset(0, 0);

    if (powerRatio > 0) {
      const clampedPowerRatio = Phaser.Math.Clamp(powerRatio, 0, 1);
      const angleInfluence = Phaser.Math.Clamp(Math.abs(Math.sin(angle)) * 0.2, 0, 0.2);
      const aimBlend = Phaser.Math.Clamp(
        Phaser.Math.Easing.Cubic.Out(clampedPowerRatio) + angleInfluence,
        0,
        1
      );
      this.zoomController.setTarget(
        Phaser.Math.Linear(ZOOM_CONFIG.max, ZOOM_CONFIG.aimMin, aimBlend)
      );
    }
  }

  clearAimAssist(): void {
    if (this.sequenceBehavior.isAimResetInProgress()) return;

    if (blocksAimReset(this.cameraMode)) return;
    this.setCameraMode(CameraMode.Idle);
    this.flightBehavior.reset(ZOOM_CONFIG.max);
    this.followBehavior.setTargetOffset(0, 0);
    this.zoomController.setTarget(ZOOM_CONFIG.max);
  }

  beginReleaseHold(): void {
    this.setCameraMode(CameraMode.ReleaseHold);
    const releaseHoldZoom = this.flightBehavior.beginReleaseHold(
      this.scene.time.now,
      this.camera.zoom
    );
    this.followBehavior.setTargetOffset(0, 0);
    this.zoomController.setTarget(releaseHoldZoom);
    this.zoomController.setVelocity(0);
  }

  beginFlight(launchVelocity?: Velocity): void {
    const result = this.flightBehavior.beginFlight(
      this.scene.time.now,
      this.camera.zoom,
      this.cameraMode,
      launchVelocity
    );

    if (result.nextMode) {
      this.setCameraMode(result.nextMode);
    }
  }

  startIntroPan(onComplete: () => void): void {
    this.sequenceBehavior.startIntroPan(onComplete);
  }

  skipIntroPan(): void {
    this.sequenceBehavior.skipIntroPan();
    this.zoomController.reset();
  }

  isIntroPanning(): boolean {
    return this.sequenceBehavior.isIntroPanning();
  }

  beginDestructionShowcase(scale: string): void {
    this.impactBehavior.beginDestructionShowcase(scale);
  }

  beginImpactFocus(anchorX: number, anchorY: number, impactSpeed: number): void {
    if (this.sequenceBehavior.isIntroPanning()) return;
    this.impactBehavior.beginImpactFocus(anchorX, anchorY, impactSpeed);
  }

  expandImpactFocus(x: number, y: number): void {
    const nextZoomTarget = this.impactBehavior.expandImpactFocus(
      x,
      y,
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT
    );
    if (nextZoomTarget !== null) {
      this.zoomController.setTarget(nextZoomTarget);
    }
  }

  isInImpactFocus(): boolean {
    return this.impactBehavior.isActive();
  }

  releaseImpactFocus(): void {
    this.impactBehavior.releaseImpactFocus();
  }

  private applyFlightFraming(framingInput: ReturnType<typeof this.getFlightFramingInput>): void {
    if (this.cameraMode === CameraMode.ImpactFocus) return;

    const now = this.scene.time.now;
    const phaseUpdate = this.flightBehavior.updatePhase(now, this.cameraMode);

    if (phaseUpdate.nextMode) {
      this.setCameraMode(phaseUpdate.nextMode);
    }

    const phaseFraming = this.flightBehavior.resolvePhase({
      mode: this.cameraMode,
      now,
      framing: framingInput,
      transition: this.flightBehavior.getTransitionData(),
    });

    if (!this.followBehavior.isOffsetsFrozen()) {
      this.followBehavior.setTargetOffset(phaseFraming.offset.x, phaseFraming.offset.y);
    }

    if (phaseFraming.zoomTarget !== null) {
      this.zoomController.setTarget(phaseFraming.zoomTarget);
    }
  }

  private getFlightFramingInput(birdPos: Position, birdVel: Velocity) {
    return {
      birdPos,
      birdVel,
      slingshotX: this.slingshotX,
      furthestTargetX: this.getFurthestTargetX(),
      topmostTargetY: this.getTopmostTargetY(),
      viewportHeight: VIEWPORT_HEIGHT,
    };
  }

  private getFurthestTargetX(): number {
    const frame = this.scene.time.now;
    if (this.cachedFurthestX !== null && this.boundsCacheFrame === frame) {
      return this.cachedFurthestX;
    }

    let maxX = 0;
    for (const pig of this.pigs) {
      if (!pig.isDestroyed()) {
        const pos = pig.getPosition();
        if (pos.x > maxX) maxX = pos.x;
      }
    }
    for (const block of this.blocks) {
      if (!block.isDestroyed()) {
        const pos = block.getPosition();
        if (pos.x > maxX) maxX = pos.x;
      }
    }

    this.cachedFurthestX = maxX > 0 ? maxX : LEVEL_WIDTH * 0.7;
    this.boundsCacheFrame = frame;
    return this.cachedFurthestX;
  }

  private getTopmostTargetY(): number {
    const frame = this.scene.time.now;
    if (this.cachedTopmostY !== null && this.boundsCacheFrame === frame) {
      return this.cachedTopmostY;
    }

    let minY: number = LEVEL_HEIGHT;
    for (const pig of this.pigs) {
      if (!pig.isDestroyed()) {
        const pos = pig.getPosition();
        if (pos.y < minY) minY = pos.y;
      }
    }
    for (const block of this.blocks) {
      if (!block.isDestroyed()) {
        const pos = block.getPosition();
        const topY = pos.y - block.getHeight() / 2;
        if (topY < minY) minY = topY;
      }
    }

    this.cachedTopmostY = minY < LEVEL_HEIGHT ? minY : LEVEL_HEIGHT * 0.72;
    this.boundsCacheFrame = frame;
    return this.cachedTopmostY;
  }

  resetToInitial(immediate: boolean = false): void {
    this.camera.stopFollow();
    this.followBehavior.stop();
    this.camera.setDeadzone(0, 0);
    this.camera.setFollowOffset(0, 0);
    this.clearAimAssist();
    this.setCameraMode(CameraMode.Idle);
    this.flightBehavior.reset(ZOOM_CONFIG.max);
    this.clearImpactFocusState();

    this.sequenceBehavior.destroyResetTween();

    if (immediate) {
      this.sequenceBehavior.resetToInitial(true, {
        onComplete: () => {
          this.zoomController.setTarget(ZOOM_CONFIG.aimMin);
          this.zoomController.setVelocity(0);
        },
      });
      return;
    }

    this.sequenceBehavior.resetToInitial(false, {
      onComplete: () => {
        this.zoomController.reset();
      },
    });
  }

  handleDrag(deltaX: number): void {
    if (this.followBehavior.isActive()) {
      this.stopFollow();
      this.clearImpactFocusState();
      this.setCameraMode(CameraMode.Idle);
      this.flightBehavior.reset(ZOOM_CONFIG.max);
    }

    this.dragInertiaHandler.handleDrag(deltaX);
  }

  handleDragEnd(): void {
    this.dragInertiaHandler.handleDragEnd();
  }

  zoomTo(scale: number, duration: number = 400): void {
    this.zoomController.zoomTo(scale, duration);
    this.setCameraMode(CameraMode.Idle);
    this.flightBehavior.reset(ZOOM_CONFIG.max);
  }

  handleManualZoom(delta: number): void {
    if (this.followBehavior.isActive()) {
      this.stopFollow();
      this.clearImpactFocusState();
      this.setCameraMode(CameraMode.Idle);
      this.flightBehavior.reset(ZOOM_CONFIG.max);
    }

    const currentZoom = this.camera.zoom;
    const newZoom = Phaser.Math.Clamp(currentZoom + delta, ZOOM_CONFIG.min, ZOOM_CONFIG.max);

    this.zoomController.setTarget(newZoom);
    this.zoomController.setVelocity(0);

    const targetScroll = this.getInitialScrollForZoom(newZoom);
    this.manualZoomTargetScroll.set(targetScroll.x, targetScroll.y);
    this.manualZoomActive = true;
  }

  isFollowing(): boolean {
    return this.followBehavior.isActive();
  }

  setFollowing(following: boolean): void {
    this.followBehavior.setFollowing(following);
  }

  setEntities(pigs: Pig[], blocks: Block[]): void {
    this.pigs = pigs;
    this.blocks = blocks;
    this.cachedFurthestX = null;
    this.cachedTopmostY = null;
    this.boundsCacheFrame = -1;
  }

  destroy(): void {
    this.scene.events.off("update", this.updateSmoothCamera, this);
    this.camera.stopFollow();
    this.sequenceBehavior.destroy();
    this.impactBehavior.destroy();
    this.followBehavior.destroy();
    this.dragInertiaHandler.destroy();
    this.zoomController.destroy();
    this.pigs = [];
    this.blocks = [];
  }
}
