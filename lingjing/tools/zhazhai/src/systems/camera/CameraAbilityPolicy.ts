import { BirdType } from "../../types/BirdType";
import {
  PROJECTILE_CAMERA_HANDOFF_POLICIES,
  type ProjectileCameraHandoffPolicy,
} from "./ProjectileCameraHandoffPolicy";

export interface CameraAbilityFeedback {
  hitPauseMs: number;
  shake?: {
    intensity: number;
    durationMs: number;
  };
}

export interface ICameraAbilityPolicy {
  getProjectileHandoffPolicy(abilityType: "split" | "eggDrop"): ProjectileCameraHandoffPolicy;
  getAbilityFeedback(birdType: BirdType): CameraAbilityFeedback;
}

export class DefaultCameraAbilityPolicy implements ICameraAbilityPolicy {
  getProjectileHandoffPolicy(abilityType: "split" | "eggDrop"): ProjectileCameraHandoffPolicy {
    if (abilityType === "split") {
      return PROJECTILE_CAMERA_HANDOFF_POLICIES.splitProjectile;
    }

    return PROJECTILE_CAMERA_HANDOFF_POLICIES.eggDropProjectile;
  }

  getAbilityFeedback(birdType: BirdType): CameraAbilityFeedback {
    switch (birdType) {
      case BirdType.YELLOW:
        return {
          hitPauseMs: 40,
          shake: {
            intensity: 0.02,
            durationMs: 60,
          },
        };
      case BirdType.BLUE:
        return {
          hitPauseMs: 40,
          shake: {
            intensity: 0.012,
            durationMs: 50,
          },
        };
      default:
        return {
          hitPauseMs: 40,
        };
    }
  }
}

export const defaultCameraAbilityPolicy = new DefaultCameraAbilityPolicy();
