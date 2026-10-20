import { clamp, lerp, cubicOut, sineOut, sineInOut } from "../../../utils/RandomHelpers";
import { CameraMode, isFlightCameraMode } from "../CameraMode";
import { FLIGHT_CONFIG, ZOOM_CONFIG } from "../../../config/CameraConfig";
import type { Velocity, Vector2 } from "../../../types/Vector2";
import type { FlightFramingInput, FlightPhaseOutput, FlightOffset } from "../types";

interface TransitionData {
  releaseHoldStartedAt: number;
  releaseHoldZoom: number;
  flightHandoffQueued: boolean;
  flightAcquireStartedAt: number;
  flightStartedAt: number;
  launchVelocity: Velocity | null;
}

interface PhaseInput {
  mode: CameraMode;
  now: number;
  framing: FlightFramingInput;
  transition: TransitionData;
}

interface BeginFlightResult {
  nextMode: CameraMode | null;
}

interface PhaseUpdateResult {
  nextMode: CameraMode | null;
}

export class FlightBehavior {
  private releaseHoldStartedAt = Number.NEGATIVE_INFINITY;
  private releaseHoldZoom: number;
  private flightHandoffQueued = false;
  private flightAcquireStartedAt = Number.NEGATIVE_INFINITY;
  private flightStartedAt = Number.NEGATIVE_INFINITY;
  private launchVelocity: Velocity | null = null;

  constructor(defaultZoom: number = ZOOM_CONFIG.max) {
    this.releaseHoldZoom = defaultZoom;
  }

  reset(defaultZoom: number = ZOOM_CONFIG.max): void {
    this.releaseHoldStartedAt = Number.NEGATIVE_INFINITY;
    this.releaseHoldZoom = defaultZoom;
    this.flightHandoffQueued = false;
    this.flightAcquireStartedAt = Number.NEGATIVE_INFINITY;
    this.flightStartedAt = Number.NEGATIVE_INFINITY;
    this.launchVelocity = null;
  }

  beginReleaseHold(now: number, cameraZoom: number): number {
    this.releaseHoldStartedAt = now;
    this.flightHandoffQueued = false;
    this.flightAcquireStartedAt = Number.NEGATIVE_INFINITY;
    this.flightStartedAt = Number.NEGATIVE_INFINITY;
    this.releaseHoldZoom = clamp(
      Math.min(cameraZoom, ZOOM_CONFIG.aimMin),
      ZOOM_CONFIG.min,
      ZOOM_CONFIG.max
    );
    this.launchVelocity = null;
    return this.releaseHoldZoom;
  }

  beginFlight(
    now: number,
    cameraZoom: number,
    mode: CameraMode,
    launchVelocity?: Velocity
  ): BeginFlightResult {
    this.launchVelocity = launchVelocity ?? null;

    if (isFlightCameraMode(mode)) {
      return { nextMode: null };
    }

    if (mode === CameraMode.ReleaseHold) {
      this.flightHandoffQueued = true;
      return { nextMode: null };
    }

    this.releaseHoldZoom = clamp(cameraZoom, ZOOM_CONFIG.min, ZOOM_CONFIG.max);
    this.enterFlightAcquire(now);
    return { nextMode: CameraMode.FlightAcquire };
  }

  updatePhase(now: number, mode: CameraMode): PhaseUpdateResult {
    if (mode === CameraMode.ReleaseHold) {
      const elapsed = now - this.releaseHoldStartedAt;
      if (elapsed < FLIGHT_CONFIG.releaseHoldDurationMs || !this.flightHandoffQueued) {
        return { nextMode: null };
      }
      this.enterFlightAcquire(now);
      return { nextMode: CameraMode.FlightAcquire };
    }

    if (mode === CameraMode.FlightAcquire) {
      return {
        nextMode:
          now - this.flightAcquireStartedAt >= FLIGHT_CONFIG.acquireDurationMs
            ? CameraMode.FlightCruise
            : null,
      };
    }

    return { nextMode: null };
  }

  resolvePhase(input: PhaseInput): FlightPhaseOutput {
    const cruiseOffset = this.getCruiseOffset(input.framing);

    if (input.mode === CameraMode.ReleaseHold) {
      const holdBlend = clamp(
        (input.now - input.transition.releaseHoldStartedAt) / FLIGHT_CONFIG.releaseHoldDurationMs,
        0,
        1
      );
      const accentOffsetX = -this.computeReleaseAccentOffset(input.transition.launchVelocity);
      return {
        zoomTarget: input.transition.releaseHoldZoom,
        offset: { x: lerp(0, accentOffsetX, cubicOut(holdBlend)), y: 0 },
      };
    }

    if (input.mode === CameraMode.FlightAcquire) {
      const acquireBlend = clamp(
        (input.now - input.transition.flightAcquireStartedAt) / FLIGHT_CONFIG.acquireDurationMs,
        0,
        1
      );
      const easedBlend = sineInOut(acquireBlend);
      const accentOffsetX = -this.computeReleaseAccentOffset(input.transition.launchVelocity);

      return {
        zoomTarget: lerp(
          input.transition.releaseHoldZoom,
          this.getCruisePhaseZoom(
            input.framing,
            input.now,
            input.transition.releaseHoldZoom,
            input.transition.flightStartedAt
          ),
          sineOut(acquireBlend)
        ),
        offset: {
          x: lerp(accentOffsetX, cruiseOffset.x, easedBlend),
          y: lerp(0, cruiseOffset.y, easedBlend),
        },
      };
    }

    if (input.mode === CameraMode.FlightCruise) {
      return {
        zoomTarget: this.getCruisePhaseZoom(
          input.framing,
          input.now,
          input.transition.releaseHoldZoom,
          input.transition.flightStartedAt
        ),
        offset: cruiseOffset,
      };
    }

    return { zoomTarget: null, offset: cruiseOffset };
  }

  getTransitionData(): TransitionData {
    return {
      releaseHoldStartedAt: this.releaseHoldStartedAt,
      releaseHoldZoom: this.releaseHoldZoom,
      flightHandoffQueued: this.flightHandoffQueued,
      flightAcquireStartedAt: this.flightAcquireStartedAt,
      flightStartedAt: this.flightStartedAt,
      launchVelocity: this.launchVelocity,
    };
  }

  getCruiseZoom(input: FlightFramingInput): number {
    const distanceToTargets = Math.max(0, input.furthestTargetX - input.birdPos.x);
    const distanceFromSlingshot = Math.max(0, input.birdPos.x - input.slingshotX);
    const speed = magnitude(input.birdVel);
    const verticalGapToAction = Math.max(0, input.topmostTargetY - input.birdPos.y);
    const speedBlend = clamp(speed / (ZOOM_CONFIG.launchSpeedThreshold * 2.4), 0, 1);
    const travelBlend = clamp(distanceFromSlingshot / ZOOM_CONFIG.farDistance, 0, 1);
    const targetLeadBlend = clamp(
      (distanceToTargets - 140) / (FLIGHT_CONFIG.farTargetThreshold - 140),
      0,
      1
    );
    const highArcBlend = clamp(
      (verticalGapToAction - FLIGHT_CONFIG.highArcStartDistance) /
        (FLIGHT_CONFIG.highArcFullDistance - FLIGHT_CONFIG.highArcStartDistance),
      0,
      1
    );
    const highArcSpeedBlend = clamp(
      Math.max(0, -input.birdVel.y) / FLIGHT_CONFIG.highArcSpeedThreshold,
      0,
      1
    );
    const launchBlend = sineOut(Math.max(speedBlend, travelBlend * 0.72));
    const farBlend = cubicOut(
      Math.max(
        clamp(
          (distanceFromSlingshot - ZOOM_CONFIG.midDistance) /
            (ZOOM_CONFIG.farDistance - ZOOM_CONFIG.midDistance),
          0,
          1
        ),
        targetLeadBlend,
        Math.max(highArcBlend, highArcSpeedBlend * 0.7)
      )
    );

    let targetZoom = lerp(ZOOM_CONFIG.max, ZOOM_CONFIG.launch, launchBlend);
    targetZoom = lerp(targetZoom, ZOOM_CONFIG.far, farBlend);

    const verticalFocusSpan = verticalGapToAction + FLIGHT_CONFIG.highArcFocusPadding;
    const verticalFitZoom = clamp(
      input.viewportHeight / Math.max(input.viewportHeight, verticalFocusSpan),
      ZOOM_CONFIG.min,
      ZOOM_CONFIG.max
    );
    targetZoom = Math.min(targetZoom, verticalFitZoom);

    const arrivalBlend =
      clamp(1 - distanceToTargets / 220, 0, 1) *
      clamp(1 - speed / 10, 0, 1) *
      clamp(distanceFromSlingshot / 280, 0, 1);

    return lerp(targetZoom, ZOOM_CONFIG.arrival, cubicOut(arrivalBlend));
  }

  getCruiseOffset(input: FlightFramingInput): FlightOffset {
    const speed = magnitude(input.birdVel);
    const forwardSpeed = Math.max(0, input.birdVel.x);
    const lookAheadX =
      speed > 0.01
        ? clamp(forwardSpeed * FLIGHT_CONFIG.lookAheadMultiplier, 0, FLIGHT_CONFIG.maxLookAheadX)
        : 0;
    return { x: -lookAheadX, y: 0 };
  }

  private enterFlightAcquire(now: number): void {
    this.releaseHoldStartedAt = Number.NEGATIVE_INFINITY;
    this.flightHandoffQueued = false;
    this.flightAcquireStartedAt = now;
    this.flightStartedAt = now;
  }

  private getCruisePhaseZoom(
    input: FlightFramingInput,
    now: number,
    releaseHoldZoom: number,
    flightStartedAt: number
  ): number {
    const rampedZoom = lerp(
      releaseHoldZoom,
      this.getCruiseZoom(input),
      sineOut(
        clamp(
          (now - flightStartedAt - FLIGHT_CONFIG.zoomRampDelayMs) /
            FLIGHT_CONFIG.zoomRampDurationMs,
          0,
          1
        )
      )
    );
    return clamp(Math.min(rampedZoom, releaseHoldZoom), ZOOM_CONFIG.min, releaseHoldZoom);
  }

  private computeReleaseAccentOffset(launchVelocity: Velocity | null): number {
    if (!launchVelocity) return 0;

    const speed = magnitude(launchVelocity);
    if (speed < FLIGHT_CONFIG.releaseAccentSpeedThreshold) return 0;

    const forwardRatio = clamp(Math.max(launchVelocity.x, 0) / Math.max(speed, 0.001), 0.35, 1);
    const accentBlend = clamp(speed / 18, 0, 1);

    return (
      lerp(
        FLIGHT_CONFIG.releaseAccentMinOffsetX,
        FLIGHT_CONFIG.releaseAccentMaxOffsetX,
        cubicOut(accentBlend)
      ) * forwardRatio
    );
  }
}

function magnitude(vector: Vector2): number {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
}
