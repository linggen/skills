import Phaser from "phaser";
import { VerletBand } from "../utils/VerletBand";
import { TrajectorySimulator, BirdShapeConfig } from "../utils/TrajectorySimulator";
import { SlingshotRenderer, TrajectoryRenderer, type BandRenderData } from "../renderers";
import { PouchPhysics, SlingshotParticles } from "./slingshot-modules";
import {
  SlingshotState,
  type PullData,
  type SlingshotConfig,
  type SlingshotCallbacks,
} from "./slingshot-modules/SlingshotConfig";
import { SLINGSHOT_CONFIG } from "../config/PhysicsConfig";
import {
  SlingshotPositionConfig,
  SlingshotBounceConfig,
  SlingshotPhysicsConfig,
} from "../config/SlingshotRenderConfig";
import { VERLET_BAND_DEFAULTS, VERLET_BAND_QUALITY_CONFIG } from "../config/VerletBandConfig";
import { LEVEL_HEIGHT, LEVEL_WIDTH } from "../config/GameConfig";
import { TimingConfig } from "../config/TimingConfig";
import { DesignTokens } from "../config/DesignTokens";
import { PerformanceManager } from "../systems/PerformanceManager";

const DEFAULT_CONFIG: SlingshotConfig = {
  MAX_PULL: SLINGSHOT_CONFIG.maxPull,
  MIN_PULL: SLINGSHOT_CONFIG.minPull,
  POST_WIDTH: SLINGSHOT_CONFIG.postWidth,
  POST_HEIGHT: SLINGSHOT_CONFIG.postHeight,
  VELOCITY_MULTIPLIER: SLINGSHOT_CONFIG.velocityMultiplier,
};

export class Slingshot {
  public readonly config: SlingshotConfig;
  public readonly callbacks: SlingshotCallbacks;

  public state: SlingshotState = SlingshotState.IDLE;
  public readonly scene: Phaser.Scene;

  private container: Phaser.GameObjects.Container;
  private containerBase: Phaser.GameObjects.Container;
  private frame: Phaser.GameObjects.Image;
  private frameBase: Phaser.GameObjects.Image;

  private bandRenderer: SlingshotRenderer;
  private trajectoryRenderer: TrajectoryRenderer;

  private bird: Phaser.GameObjects.Image | null = null;
  private birdShape: BirdShapeConfig = {
    shape: "circle",
    radius: SlingshotPhysicsConfig.birdShape.radius,
    mass: SlingshotPhysicsConfig.birdShape.mass,
  };

  private readonly anchorLeft: Phaser.Math.Vector2;
  private readonly anchorRight: Phaser.Math.Vector2;
  private readonly centerPos: Phaser.Math.Vector2;
  private readonly forkY: number;
  private readonly birdRestX: number;
  private readonly birdRestY: number;

  private pullStartPos: Phaser.Math.Vector2 | null = null;
  private currentPull: PullData | null = null;

  private readonly _pointerPos = new Phaser.Math.Vector2();
  private readonly _pullVector = new Phaser.Math.Vector2();
  private readonly _newPos = new Phaser.Math.Vector2();

  private leftVerletBand: VerletBand;
  private rightVerletBand: VerletBand;
  private pouchPhysics: PouchPhysics;
  private particles: SlingshotParticles;
  private trajectorySimulator: TrajectorySimulator | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number | undefined,
    y: number | undefined,
    config: Partial<SlingshotConfig> = {},
    callbacks: SlingshotCallbacks = {}
  ) {
    this.scene = scene;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;

    const screenWidth = scene.scale.width;
    const screenHeight = scene.scale.height;

    const slingshotX = x ?? screenWidth * 0.2;
    const slingshotY = y ?? screenHeight - SlingshotPositionConfig.bottomOffset;
    const slingshotX1 = slingshotX - 24;
    const slingshotY1 = slingshotY + 16;

    this.centerPos = new Phaser.Math.Vector2(slingshotX1, slingshotY1);
    const forkTipOffset = SlingshotPositionConfig.forkTipOffset;
    this.forkY = slingshotY1 - this.config.POST_HEIGHT + forkTipOffset;

    this.anchorLeft = new Phaser.Math.Vector2(
      slingshotX1 - this.config.POST_WIDTH * 0.35,
      this.forkY
    );
    this.anchorRight = new Phaser.Math.Vector2(
      slingshotX1 + this.config.POST_WIDTH * 0.35,
      this.forkY
    );

    const minDistance = SlingshotPositionConfig.minDistance;
    const hangAngle = Math.PI * SlingshotPositionConfig.hangAngleMultiplier;
    this.birdRestX = slingshotX1 - minDistance * Math.cos(hangAngle);
    this.birdRestY = this.forkY + minDistance * Math.sin(hangAngle);

    this.container = scene.add.container(slingshotX, slingshotY);
    this.containerBase = scene.add.container(slingshotX, slingshotY);

    this.frame = scene.add.image(-24, 16, "level", "slingshot");
    this.frame.setOrigin(0.5, 1);
    this.frame.setScale(1);
    this.container.add(this.frame);

    this.frameBase = scene.add.image(0, 0, "level", "slingshot_base");
    this.frameBase.setOrigin(0.5, 0);
    this.frameBase.setScale(1);
    this.containerBase.add(this.frameBase);

    this.bandRenderer = new SlingshotRenderer({ scene });
    this.trajectoryRenderer = new TrajectoryRenderer({
      scene,
      levelHeight: LEVEL_HEIGHT,
      levelWidth: LEVEL_WIDTH,
    });

    this.particles = new SlingshotParticles(scene);

    // Quality-aware Verlet band configuration
    // Scale segments and iterations based on device performance to maintain smooth gameplay
    const qualityMultiplier = PerformanceManager.getQualityMultiplier(scene);
    const QC = VERLET_BAND_QUALITY_CONFIG;
    let segments: number;
    let constraintIterations: number;

    if (qualityMultiplier >= QC.high.threshold!) {
      segments = QC.high.segments;
      constraintIterations = QC.high.iterations;
    } else if (qualityMultiplier >= QC.medium.threshold!) {
      segments = QC.medium.segments;
      constraintIterations = QC.medium.iterations;
    } else {
      segments = QC.low.segments;
      constraintIterations = QC.low.iterations;
    }

    this.leftVerletBand = new VerletBand(
      this.anchorLeft.x,
      this.anchorLeft.y,
      this.birdRestX,
      this.birdRestY,
      {
        segments,
        damping: VERLET_BAND_DEFAULTS.damping,
        gravity: VERLET_BAND_DEFAULTS.gravity,
        constraintIterations,
      }
    );
    this.leftVerletBand.setVariationSeed(SlingshotPhysicsConfig.verletVariationSeeds.left);

    this.rightVerletBand = new VerletBand(
      this.anchorRight.x,
      this.anchorRight.y,
      this.birdRestX,
      this.birdRestY,
      {
        segments,
        damping: VERLET_BAND_DEFAULTS.damping,
        gravity: VERLET_BAND_DEFAULTS.gravity,
        constraintIterations,
      }
    );
    this.rightVerletBand.setVariationSeed(SlingshotPhysicsConfig.verletVariationSeeds.right);

    this.pouchPhysics = new PouchPhysics(this.birdRestX, this.birdRestY);

    this.initTrajectorySimulator();

    this.drawBands();
    this.container.setDepth(DesignTokens.depth.slingshot);
    this.containerBase.setDepth(DesignTokens.depth.slingshotBase);
  }

  placeBird(bird: Phaser.GameObjects.Image, birdShape?: BirdShapeConfig): void {
    this.bird = bird;
    if (birdShape) {
      this.birdShape = birdShape;
    }
    this.bird.setPosition(this.birdRestX, this.birdRestY);
    this.state = SlingshotState.READY;

    this.leftVerletBand.setEndPoint(this.birdRestX, this.birdRestY);
    this.rightVerletBand.setEndPoint(this.birdRestX, this.birdRestY);
    this.pouchPhysics.reset(this.birdRestX, this.birdRestY);

    this.callbacks.onBirdStateChanged?.(this.state, this.bird);
  }

  onBirdLanded(
    visualBird: Phaser.GameObjects.Image,
    getBounceY: (t: number) => number,
    onComplete: () => void
  ): void {
    const originalY = this.birdRestY;
    const bounceDuration = SlingshotBounceConfig.duration;

    this.pouchPhysics.setBouncing(true);

    this.leftVerletBand.applyImpulse(0, SlingshotBounceConfig.impulse);
    this.rightVerletBand.applyImpulse(0, SlingshotBounceConfig.impulse);

    const bounceProgress = { t: 0 };

    this.scene.tweens.add({
      targets: bounceProgress,
      t: 1,
      duration: bounceDuration,
      ease: "Sine.easeOut",
      onUpdate: () => {
        const t = bounceProgress.t;
        const currentY = getBounceY(t);
        const pouchPos = this.pouchPhysics.getPosition();
        this.pouchPhysics.setPosition(pouchPos.x, currentY);
        visualBird.y = currentY;

        this.leftVerletBand.setEndPoint(pouchPos.x, currentY, false);
        this.rightVerletBand.setEndPoint(pouchPos.x, currentY, false);
      },
      onComplete: () => {
        const pouchPos = this.pouchPhysics.getPosition();
        this.pouchPhysics.setPosition(pouchPos.x, originalY);
        visualBird.y = originalY;
        this.pouchPhysics.setBouncing(false);
        onComplete();
      },
    });

    this.scene.time.delayedCall(TimingConfig.slingshot.resetDelay, () => {
      this.leftVerletBand.applyImpulse(SlingshotPhysicsConfig.resetImpulse.left, 0);
      this.rightVerletBand.applyImpulse(SlingshotPhysicsConfig.resetImpulse.right, 0);
    });
  }

  update(_delta: number): void {
    const dt = 1;

    if (this.bird && this.state === SlingshotState.AIMING) {
      this.pouchPhysics.setPosition(this.bird.x, this.bird.y);
      this.leftVerletBand.setEndPoint(this.bird.x, this.bird.y, true);
      this.rightVerletBand.setEndPoint(this.bird.x, this.bird.y, true);
    } else if (this.state === SlingshotState.FIRED) {
      this.pouchPhysics.updateWhip(this.birdRestX, this.birdRestY, dt);
      const newPos = this.pouchPhysics.getPosition();
      this.leftVerletBand.setEndPoint(newPos.x, newPos.y, false);
      this.rightVerletBand.setEndPoint(newPos.x, newPos.y, false);
    } else {
      if (!this.pouchPhysics.isBouncing()) {
        this.pouchPhysics.reset(this.birdRestX, this.birdRestY);
        this.leftVerletBand.setEndPoint(this.birdRestX, this.birdRestY);
        this.rightVerletBand.setEndPoint(this.birdRestX, this.birdRestY);
      } else {
        const pouchPos = this.pouchPhysics.getPosition();
        this.leftVerletBand.setEndPoint(pouchPos.x, pouchPos.y, false);
        this.rightVerletBand.setEndPoint(pouchPos.x, pouchPos.y, false);
      }
    }

    this.leftVerletBand.update();
    this.rightVerletBand.update();

    this.drawBands();
  }

  getBandTension(): number {
    return this.leftVerletBand.getTension();
  }

  startAiming(): void {
    if (this.state !== SlingshotState.READY || !this.bird) return;
    this.state = SlingshotState.AIMING;
    this.pullStartPos = new Phaser.Math.Vector2(this.bird.x, this.bird.y);
    this.callbacks.onBirdStateChanged?.(this.state, this.bird);
  }

  updateAim(x: number, y: number): PullData | null {
    if (this.state !== SlingshotState.AIMING || !this.bird || !this.pullStartPos) {
      return null;
    }

    this._pointerPos.set(x, y);
    this._pullVector.set(this.birdRestX - x, this.birdRestY - y);

    const rawDistance = this._pullVector.length();
    const normalizedPull = rawDistance / this.config.MAX_PULL;
    const curvedPull =
      Math.pow(normalizedPull, SlingshotPhysicsConfig.powerCurveExponent) * this.config.MAX_PULL;
    let distance = curvedPull;
    distance = Phaser.Math.Clamp(distance, 0, this.config.MAX_PULL);

    const powerRatio = distance / this.config.MAX_PULL;
    const atMaxPower = distance >= this.config.MAX_PULL;

    if (distance < this.config.MIN_PULL) {
      this.bird.setPosition(this.birdRestX, this.birdRestY);
      this.currentPull = null;
      this.drawBands();
      return null;
    }

    this._pullVector.normalize().scale(distance);
    this._newPos.set(this.birdRestX - this._pullVector.x, this.birdRestY - this._pullVector.y);

    this.bird.setPosition(this._newPos.x, this._newPos.y);

    const angle = Phaser.Math.Angle.Between(
      this.birdRestX,
      this.birdRestY,
      this._newPos.x,
      this._newPos.y
    );

    this.currentPull = {
      distance,
      angle,
      vector: this._pullVector.clone(),
      powerRatio,
      atMaxPower,
    };

    this.drawBands();
    this.callbacks.onPullChange?.(this.currentPull);

    return this.currentPull;
  }

  fire(): Phaser.Math.Vector2 | null {
    if (this.state !== SlingshotState.AIMING || !this.bird || !this.currentPull) {
      return null;
    }

    const launchVelocity = this.currentPull.vector
      .clone()
      .normalize()
      .scale(this.currentPull.distance * this.config.VELOCITY_MULTIPLIER);

    const birdPosAtFire = new Phaser.Math.Vector2(this.bird.x, this.bird.y);
    const intensity = this.currentPull.powerRatio;

    this.state = SlingshotState.FIRED;
    this.callbacks.onBirdStateChanged?.(this.state, this.bird);
    this.callbacks.onLaunch?.(launchVelocity);

    this.bird = null;
    this.currentPull = null;
    this.pullStartPos = null;

    this.pouchPhysics.initHybridWhip(
      birdPosAtFire.x,
      birdPosAtFire.y,
      this.birdRestX,
      this.birdRestY,
      intensity
    );

    const impulseX =
      (this.birdRestX - birdPosAtFire.x) *
      SlingshotPhysicsConfig.whip.impulseMultiplier *
      (SlingshotPhysicsConfig.whip.intensityBase +
        intensity * SlingshotPhysicsConfig.whip.intensityRange);
    const impulseY =
      (this.birdRestY - birdPosAtFire.y) *
      SlingshotPhysicsConfig.whip.impulseMultiplier *
      (SlingshotPhysicsConfig.whip.intensityBase +
        intensity * SlingshotPhysicsConfig.whip.intensityRange);
    this.leftVerletBand.applyImpulse(impulseX, impulseY);
    this.rightVerletBand.applyImpulse(impulseX, impulseY);

    const waveIntensity =
      SlingshotPhysicsConfig.wave.intensityBase +
      intensity * SlingshotPhysicsConfig.wave.intensityRange;
    this.scene.time.delayedCall(TimingConfig.slingshot.waveImpulseDelay, () => {
      this.leftVerletBand.applyWaveImpulse(waveIntensity);
      this.rightVerletBand.applyWaveImpulse(waveIntensity);
    });
    this.particles.emitTension(
      birdPosAtFire.x,
      birdPosAtFire.y,
      Math.floor(
        SlingshotPhysicsConfig.particleEmission.baseCount +
          intensity * SlingshotPhysicsConfig.particleEmission.intensityMultiplier
      )
    );
    return launchVelocity;
  }

  private drawBands(): void {
    const pouchPos = this.pouchPhysics.getPosition();
    const renderData: BandRenderData = {
      leftPoints: this.leftVerletBand.getPoints(),
      rightPoints: this.rightVerletBand.getPoints(),
      pouchPos: pouchPos,
      powerRatio: this.currentPull?.powerRatio ?? 0,
      anchorLeft: this.anchorLeft.clone(),
      anchorRight: this.anchorRight.clone(),
    };
    this.bandRenderer.drawBands(renderData);
  }

  cancel(): void {
    if (this.state !== SlingshotState.AIMING) return;

    if (this.bird) {
      this.bird.setPosition(this.birdRestX, this.birdRestY);
    }

    this.leftVerletBand.setEndPoint(this.birdRestX, this.birdRestY);
    this.rightVerletBand.setEndPoint(this.birdRestX, this.birdRestY);

    this.state = SlingshotState.READY;
    this.currentPull = null;
    this.pullStartPos = null;
    this.drawBands();
    this.callbacks.onBirdStateChanged?.(this.state, this.bird ?? undefined);
  }

  reset(): void {
    this.cancel();
    this.state = SlingshotState.IDLE;

    this.leftVerletBand.setEndPoint(this.birdRestX, this.birdRestY);
    this.rightVerletBand.setEndPoint(this.birdRestX, this.birdRestY);
    this.pouchPhysics.reset(this.birdRestX, this.birdRestY);

    this.drawBands();
    this.callbacks.onBirdStateChanged?.(this.state);
  }

  destroy(): void {
    if (this.trajectorySimulator) {
      this.trajectorySimulator.destroy();
      this.trajectorySimulator = null;
    }
    this.container.destroy(true);
    this.containerBase.destroy(true);
    this.frameBase.destroy();
    this.bandRenderer.destroy();
    this.trajectoryRenderer.destroy();
    this.particles.destroy();
  }

  private initTrajectorySimulator(): void {
    const engine = (this.scene as Phaser.Scene & { matter: { world: { engine: Matter.Engine } } })
      .matter.world.engine;

    this.trajectorySimulator = new TrajectorySimulator({
      x: engine.gravity.x,
      y: engine.gravity.y,
      scale: engine.gravity.scale,
    });
  }

  drawTrajectory(pullData: PullData | null): void {
    this.trajectoryRenderer.clear();

    if (!pullData || pullData.distance < this.config.MIN_PULL) {
      return;
    }

    if (!this.trajectorySimulator) {
      return;
    }

    const launchVelocity = pullData.vector
      .clone()
      .normalize()
      .scale(pullData.distance * this.config.VELOCITY_MULTIPLIER);

    const startX = this.bird?.x ?? this.birdRestX;
    const startY = this.bird?.y ?? this.birdRestY;

    const points = this.trajectorySimulator.simulate(
      startX,
      startY,
      launchVelocity.x,
      launchVelocity.y,
      this.birdShape
    );

    this.trajectoryRenderer.draw(points);
  }

  clearTrajectory(): void {
    this.trajectoryRenderer.clear();
  }

  getBird(): Phaser.GameObjects.Image | null {
    return this.bird;
  }

  getState(): SlingshotState {
    return this.state;
  }

  getPosition(): Phaser.Math.Vector2 {
    return this.centerPos.clone();
  }

  getAnchorPoints(): { left: Phaser.Math.Vector2; right: Phaser.Math.Vector2 } {
    return {
      left: this.anchorLeft.clone(),
      right: this.anchorRight.clone(),
    };
  }

  getBirdRestPosition(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(this.birdRestX, this.birdRestY);
  }
}
