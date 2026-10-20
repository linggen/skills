/**
 * Verlet-based rope/band physics simulation
 *
 * Models a band as a series of particles connected by distance constraints.
 * Uses Verlet integration for stable, realistic physics.
 *
 */
import Phaser from "phaser";
import type { Position } from "../types/Vector2";
import {
  VERLET_BAND_DEFAULTS,
  VERLET_BAND_PHYSICS,
  VERLET_BAND_WAVE,
} from "../config/VerletBandConfig";

interface VerletParticle {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
  pinned: boolean;
}

export interface VerletBandConfig {
  segments?: number;
  damping?: number;
  gravity?: number;
  constraintIterations?: number;
  restLengthMultiplier?: number;
  waveSpeed?: number;
  waveDecay?: number;
  oscillationDecay?: number;
}

const DEFAULT_CONFIG: Required<VerletBandConfig> = {
  segments: VERLET_BAND_DEFAULTS.segments,
  damping: VERLET_BAND_DEFAULTS.damping,
  gravity: VERLET_BAND_DEFAULTS.gravity,
  constraintIterations: VERLET_BAND_DEFAULTS.constraintIterations,
  restLengthMultiplier: VERLET_BAND_DEFAULTS.restLengthMultiplier,
  waveSpeed: VERLET_BAND_DEFAULTS.waveSpeed,
  waveDecay: VERLET_BAND_DEFAULTS.waveDecay,
  oscillationDecay: VERLET_BAND_DEFAULTS.oscillationDecay,
};

export class VerletBand {
  private particles: VerletParticle[] = [];
  private restLength: number;
  private config: Required<VerletBandConfig>;

  private currentEndX: number;
  private currentEndY: number;

  private wavePhase: number = 0;
  private waveIntensity: number = 0;
  private oscillationPhase: number = 0;
  private oscillationAmplitude: number = 0;
  private variationSeed: number = 0;

  private anchorX: number;
  private anchorY: number;

  private cachedPoints: Phaser.Math.Vector2[] = [];

  constructor(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    config: VerletBandConfig = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentEndX = endX;
    this.currentEndY = endY;
    this.anchorX = startX;
    this.anchorY = startY;
    this.variationSeed = Math.random();

    this.particles = [];

    for (let i = 0; i <= this.config.segments; i++) {
      const t = i / this.config.segments;
      const x = Phaser.Math.Linear(startX, endX, t);
      const y = Phaser.Math.Linear(startY, endY, t);

      this.particles.push({
        x,
        y,
        oldX: x,
        oldY: y,
        pinned: i === 0,
      });
    }

    const totalLength = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);

    this.restLength = (totalLength / this.config.segments) * this.config.restLengthMultiplier;

    for (let i = 0; i <= this.config.segments; i++) {
      this.cachedPoints.push(new Phaser.Math.Vector2(0, 0));
    }
  }

  setGravity(gravity: number): void {
    this.config.gravity = gravity;
  }

  getEndPoint(): Position {
    return { x: this.currentEndX, y: this.currentEndY };
  }

  getPoints(): Phaser.Math.Vector2[] {
    for (let i = 0; i < this.particles.length; i++) {
      this.cachedPoints[i].set(this.particles[i].x, this.particles[i].y);
    }
    return this.cachedPoints;
  }

  setEndPoint(x: number, y: number, taut: boolean = false): void {
    const last = this.particles[this.particles.length - 1];
    if (!last) return;

    const vx = x - last.x;
    const vy = y - last.y;

    this.currentEndX = x;
    this.currentEndY = y;
    last.x = x;
    last.y = y;

    // When taut (aiming), pull middle particles toward the straight line
    // This makes the band respond instantly to aiming movements
    if (taut) {
      const first = this.particles[0];
      for (let i = 1; i < this.particles.length - 1; i++) {
        const p = this.particles[i];
        const t = i / this.config.segments;

        const targetX = Phaser.Math.Linear(first.x, x, t);
        const targetY = Phaser.Math.Linear(first.y, y, t);

        // Blend toward target (lerp factor controls responsiveness)
        const lerpFactor = VERLET_BAND_PHYSICS.tautModeLerpFactor;
        p.x = Phaser.Math.Linear(p.x, targetX, lerpFactor);
        p.y = Phaser.Math.Linear(p.y, targetY, lerpFactor);

        // Also update old position to prevent overshoot
        p.oldX = Phaser.Math.Linear(
          p.oldX,
          p.x,
          lerpFactor * VERLET_BAND_PHYSICS.oldPositionLerpFactor
        );
        p.oldY = Phaser.Math.Linear(
          p.oldY,
          p.y,
          lerpFactor * VERLET_BAND_PHYSICS.oldPositionLerpFactor
        );
      }
    } else {
      // Give middle particles some velocity to follow the endpoint
      // This makes the band more responsive during snap-back
      for (let i = 1; i < this.particles.length - 1; i++) {
        const p = this.particles[i];
        const t = i / this.config.segments;
        // Particles closer to endpoint get more velocity
        const velocityFactor = t * VERLET_BAND_PHYSICS.velocityFactorForSnapBack;
        p.oldX = p.x - vx * velocityFactor;
        p.oldY = p.y - vy * velocityFactor;
      }
    }
  }

  update(): void {
    if (this.waveIntensity > VERLET_BAND_PHYSICS.waveThreshold) {
      this.wavePhase += this.config.waveSpeed;
      this.waveIntensity *= this.config.waveDecay;
    } else {
      this.waveIntensity = 0;
      this.wavePhase = 0;
    }

    if (this.oscillationAmplitude > VERLET_BAND_PHYSICS.oscillationThreshold) {
      this.oscillationPhase +=
        VERLET_BAND_PHYSICS.oscillationPhaseIncrement +
        this.variationSeed * VERLET_BAND_PHYSICS.oscillationPhaseVariation;
      this.oscillationAmplitude *= this.config.oscillationDecay;
    } else {
      this.oscillationAmplitude = 0;
    }

    const dx = this.currentEndX - this.anchorX;
    const dy = this.currentEndY - this.anchorY;
    const bandLength = Math.sqrt(dx * dx + dy * dy);
    const perpX = bandLength > VERLET_BAND_PHYSICS.bandLengthThreshold ? -dy / bandLength : 0;
    const perpY = bandLength > VERLET_BAND_PHYSICS.bandLengthThreshold ? dx / bandLength : 0;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.pinned || i === this.particles.length - 1) continue;

      const vx = (p.x - p.oldX) * this.config.damping;
      const vy = (p.y - p.oldY) * this.config.damping;

      p.oldX = p.x;
      p.oldY = p.y;

      const t = i / (this.particles.length - 1);
      const middleFactor = Math.sin(t * Math.PI);

      const wavePos = this.wavePhase;
      const distFromWave = Math.abs(t - wavePos);
      const waveEnvelope = Math.exp(
        -distFromWave * distFromWave * VERLET_BAND_WAVE.envelopeExponent
      );
      const travelingWave =
        Math.sin((t - this.wavePhase) * Math.PI * 2) *
        this.waveIntensity *
        middleFactor *
        waveEnvelope *
        VERLET_BAND_WAVE.travelingWaveAmplitude;

      const standingWave =
        Math.sin(t * Math.PI * 2 + this.oscillationPhase + this.variationSeed * Math.PI * 2) *
        this.oscillationAmplitude *
        middleFactor *
        VERLET_BAND_WAVE.standingWaveAmplitude;

      p.x += vx + (travelingWave + standingWave) * perpX;
      p.y += vy + this.config.gravity + (travelingWave + standingWave) * perpY;
    }

    for (let iter = 0; iter < this.config.constraintIterations; iter++) {
      this.solveConstraints();
    }
  }

  /**
   * Solve distance constraints between adjacent particles
   * Keeps particles at their rest distance, creating spring-like behavior
   */
  private solveConstraints(): void {
    for (let i = 0; i < this.particles.length - 1; i++) {
      const p1 = this.particles[i];
      const p2 = this.particles[i + 1];

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < VERLET_BAND_PHYSICS.distanceThresholdForConstraints) continue;
      const diff =
        ((dist - this.restLength) / dist) * VERLET_BAND_PHYSICS.constraintCorrectionFactor;

      if (!p1.pinned) {
        p1.x += dx * diff;
        p1.y += dy * diff;
      }

      // Don't move the last particle (it's pinned to bird)
      if (!p2.pinned && i + 1 !== this.particles.length - 1) {
        p2.x -= dx * diff;
        p2.y -= dy * diff;
      }
    }
  }

  getTension(): number {
    let actualLength = 0;

    for (let i = 0; i < this.particles.length - 1; i++) {
      const p1 = this.particles[i];
      const p2 = this.particles[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      actualLength += Math.sqrt(dx * dx + dy * dy);
    }

    const restTotalLength = this.restLength * this.config.segments;
    const stretch = actualLength / restTotalLength;

    return Math.max(0, Math.min(1, (stretch - 1) * VERLET_BAND_WAVE.tensionStretchMultiplier));
  }

  applyImpulse(vx: number, vy: number): void {
    for (let i = 1; i < this.particles.length - 1; i++) {
      const p = this.particles[i];
      const t = i / (this.particles.length - 1);
      const middleBoost = Math.sin(t * Math.PI) * VERLET_BAND_WAVE.middleBoostFactor;

      p.oldX = p.x - vx * (1 + middleBoost);
      p.oldY = p.y - vy * (1 + middleBoost);
    }
  }

  applyWaveImpulse(intensity: number): void {
    this.wavePhase = VERLET_BAND_WAVE.initialWavePhase;
    this.waveIntensity = intensity * VERLET_BAND_WAVE.waveIntensityMultiplier;
    this.oscillationAmplitude = intensity * VERLET_BAND_WAVE.oscillationAmplitudeMultiplier;
    this.oscillationPhase = 0;
  }

  setVariationSeed(seed: number): void {
    this.variationSeed = seed;
  }

  snapTaut(): void {
    const first = this.particles[0];
    const last = this.particles[this.particles.length - 1];

    for (let i = 1; i < this.particles.length - 1; i++) {
      const t = i / (this.particles.length - 1);
      const p = this.particles[i];
      p.x = Phaser.Math.Linear(first.x, last.x, t);
      p.y = Phaser.Math.Linear(first.y, last.y, t);
      p.oldX = p.x;
      p.oldY = p.y;
    }
  }

  reset(startX: number, startY: number, endX: number, endY: number): void {
    this.currentEndX = endX;
    this.currentEndY = endY;
    this.anchorX = startX;
    this.anchorY = startY;
    this.wavePhase = 0;
    this.waveIntensity = 0;
    this.oscillationPhase = 0;
    this.oscillationAmplitude = 0;

    for (let i = 0; i <= this.config.segments; i++) {
      const t = i / this.config.segments;
      const x = Phaser.Math.Linear(startX, endX, t);
      const y = Phaser.Math.Linear(startY, endY, t);

      const p = this.particles[i];
      if (p) {
        p.x = x;
        p.y = y;
        p.oldX = x;
        p.oldY = y;
        p.pinned = i === 0;
      }
    }
  }
}
