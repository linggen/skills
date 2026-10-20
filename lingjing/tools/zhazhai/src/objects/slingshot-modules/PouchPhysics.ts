import Phaser from "phaser";
import { POUCH_PHYSICS_CONFIG } from "../../config/PouchPhysicsConfig";

export interface PouchPhysicsConfig {
  stiffness: number;
  damping: number;
  overshoot: number;
  whipStrength: number;
  snapAcceleration: number;
  snapDeceleration: number;
  overshootPercent: number;
  settleDamping: number;
}

const DEFAULT_CONFIG: PouchPhysicsConfig = {
  stiffness: POUCH_PHYSICS_CONFIG.default.stiffness,
  damping: POUCH_PHYSICS_CONFIG.default.damping,
  overshoot: POUCH_PHYSICS_CONFIG.default.overshoot,
  whipStrength: POUCH_PHYSICS_CONFIG.default.whipStrength,
  snapAcceleration: POUCH_PHYSICS_CONFIG.default.snapAcceleration,
  snapDeceleration: POUCH_PHYSICS_CONFIG.default.snapDeceleration,
  overshootPercent: POUCH_PHYSICS_CONFIG.default.overshootPercent,
  settleDamping: POUCH_PHYSICS_CONFIG.default.settleDamping,
};

type SnapPhase = "idle" | "snap" | "overshoot" | "settle";

export class PouchPhysics {
  private pos: Phaser.Math.Vector2;
  private vel: Phaser.Math.Vector2;
  private bouncing: boolean = false;
  private whipTime: number = 0;
  private config: PouchPhysicsConfig;
  private snapPhase: SnapPhase = "idle";
  private snapTime: number = 0;
  private snapDuration: number = POUCH_PHYSICS_CONFIG.duration.defaultSnap;
  private settleDuration: number = POUCH_PHYSICS_CONFIG.duration.defaultSettle;
  private currentIntensity: number = 0;

  constructor(restX: number, restY: number, config: Partial<PouchPhysicsConfig> = {}) {
    this.pos = new Phaser.Math.Vector2(restX, restY);
    this.vel = new Phaser.Math.Vector2(0, 0);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getPosition(): Phaser.Math.Vector2 {
    return this.pos;
  }

  setPosition(x: number, y: number): void {
    this.pos.set(x, y);
  }

  isBouncing(): boolean {
    return this.bouncing;
  }

  setBouncing(bouncing: boolean): void {
    this.bouncing = bouncing;
  }

  initWhip(startX: number, startY: number, restX: number, restY: number): void {
    this.initHybridWhip(startX, startY, restX, restY, 0.5);
  }

  initHybridWhip(
    startX: number,
    startY: number,
    restX: number,
    restY: number,
    intensity: number
  ): void {
    this.pos.set(startX, startY);
    this.currentIntensity = intensity;

    const dx = restX - startX;
    const dy = restY - startY;

    const snapMultiplier =
      POUCH_PHYSICS_CONFIG.snap.velocityBase +
      intensity * POUCH_PHYSICS_CONFIG.snap.velocityIntensityFactor;
    this.vel.set(dx * snapMultiplier, dy * snapMultiplier);

    this.snapPhase = "snap";
    this.snapTime = 0;
    this.whipTime = 0;

    this.snapDuration =
      POUCH_PHYSICS_CONFIG.duration.snapBase +
      Math.floor(intensity * POUCH_PHYSICS_CONFIG.duration.snapIntensityFactor);
    this.settleDuration =
      POUCH_PHYSICS_CONFIG.duration.settleBase +
      Math.floor(intensity * POUCH_PHYSICS_CONFIG.duration.settleIntensityFactor);
  }

  updateWhip(restX: number, restY: number, dt: number = 1): boolean {
    this.snapTime += dt;
    this.whipTime += dt;

    const dx = restX - this.pos.x;
    const dy = restY - this.pos.y;
    const distToRest = Math.sqrt(dx * dx + dy * dy);
    const speed = Math.sqrt(this.vel.x * this.vel.x + this.vel.y * this.vel.y);

    switch (this.snapPhase) {
      case "snap": {
        const snapForce =
          this.config.snapAcceleration *
          (POUCH_PHYSICS_CONFIG.snap.forceBase +
            this.currentIntensity * POUCH_PHYSICS_CONFIG.snap.forceIntensityFactor);
        this.vel.x += dx * snapForce;
        this.vel.y += dy * snapForce;

        if (
          distToRest < POUCH_PHYSICS_CONFIG.snap.distanceThreshold ||
          this.snapTime > this.snapDuration
        ) {
          this.snapPhase = "overshoot";
          this.snapTime = 0;
        }
        break;
      }

      case "overshoot": {
        const decelFactor = this.config.snapDeceleration;
        const attractForce =
          POUCH_PHYSICS_CONFIG.attract.force *
          (POUCH_PHYSICS_CONFIG.attract.baseMultiplier +
            this.currentIntensity * POUCH_PHYSICS_CONFIG.attract.intensityFactor);
        this.vel.x = (this.vel.x + dx * attractForce) * decelFactor;
        this.vel.y = (this.vel.y + dy * attractForce) * decelFactor;

        if (
          speed < POUCH_PHYSICS_CONFIG.overshootExit.speedThreshold &&
          this.snapTime > POUCH_PHYSICS_CONFIG.overshootExit.minTime
        ) {
          this.snapPhase = "settle";
          this.snapTime = 0;
        }
        break;
      }

      case "settle": {
        const springX = dx * this.config.stiffness * this.config.overshoot;
        const springY = dy * this.config.stiffness * this.config.overshoot;
        this.vel.x = (this.vel.x + springX) * this.config.settleDamping;
        this.vel.y = (this.vel.y + springY) * this.config.settleDamping;

        if (
          distToRest < POUCH_PHYSICS_CONFIG.settle.distanceThreshold &&
          speed < POUCH_PHYSICS_CONFIG.settle.speedThreshold &&
          this.snapTime > this.settleDuration
        ) {
          this.pos.set(restX, restY);
          this.vel.set(0, 0);
          this.snapPhase = "idle";
          return true;
        }
        break;
      }

      default:
        break;
    }

    this.pos.x += this.vel.x;
    this.pos.y += this.vel.y;

    return false;
  }

  reset(restX: number, restY: number): void {
    this.pos.set(restX, restY);
    this.vel.set(0, 0);
    this.whipTime = 0;
    this.bouncing = false;
    this.snapPhase = "idle";
    this.snapTime = 0;
    this.currentIntensity = 0;
  }
}
