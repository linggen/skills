export interface ProjectileCameraHandoffPolicy {
  preserveFlightFraming: boolean;
  canInterruptImpactFocus: boolean;
}

export const PROJECTILE_CAMERA_HANDOFF_POLICIES = {
  splitProjectile: {
    preserveFlightFraming: false,
    canInterruptImpactFocus: true,
  },
  eggDropProjectile: {
    preserveFlightFraming: false,
    canInterruptImpactFocus: true,
  },
} as const satisfies Record<string, ProjectileCameraHandoffPolicy>;
