export interface CameraFollowConfig {
  lerp: number;
  lerpY: number;
  deadzoneWidth: number;
  deadzoneHeight: number;
  initialSlingshotScreenX: number;
  manualFollowViewportRatio: number;
  offsetBlendRelease: number;
  offsetBlendDefault: number;
}

export interface CameraZoomConfig {
  min: number;
  max: number;
  aimMin: number;
  launch: number;
  far: number;
  arrival: number;
  launchSpeedThreshold: number;
  midDistance: number;
  farDistance: number;
  outSmoothingMs: number;
  inSmoothingMs: number;
  defaultDurationMs: number;
}

export interface CameraFlightConfig {
  farTargetThreshold: number;
  highArcStartDistance: number;
  highArcFullDistance: number;
  highArcFocusPadding: number;
  highArcSpeedThreshold: number;
  lookAheadMultiplier: number;
  maxLookAheadX: number;
  maxLookAheadY: number;
  releaseHoldDurationMs: number;
  acquireDurationMs: number;
  zoomRampDelayMs: number;
  zoomRampDurationMs: number;
  releaseAccentMinOffsetX: number;
  releaseAccentMaxOffsetX: number;
  releaseAccentSpeedThreshold: number;
}

export interface CameraImpactConfig {
  maxZoomOut: number;
  clusterPadding: number;
  screenX: number;
  followLerp: number;
  leadFactor: number;
  maxLead: number;
  minRightLead: number;
  forwardPadding: number;
  baseLookAhead: number;
  maxLookAhead: number;
  impactSpeedNormalization: number;
  zoomCompensation: number;
  showcaseZoomDeltas: Record<string, number>;
}

export interface CameraSequenceConfig {
  resetDurationMs: number;
  resetEase: string;
  introPanDurationMs: number;
  introPanEase: string;
  introPanTargetPadding: number;
}

export interface CameraDragConfig {
  inertia: number;
  inertiaThreshold: number;
}

export interface CameraShakeConfig {
  birdLandIntensity: number;
}

export interface CameraParallaxConfig {
  scrollThreshold: number;
  zoomThreshold: number;
}

export interface GroupedCameraConfig {
  follow: CameraFollowConfig;
  zoom: CameraZoomConfig;
  flight: CameraFlightConfig;
  impact: CameraImpactConfig;
  sequence: CameraSequenceConfig;
  drag: CameraDragConfig;
  shake: CameraShakeConfig;
  parallax: CameraParallaxConfig;
}

export const CAMERA_CONFIG: GroupedCameraConfig = {
  follow: {
    lerp: 0.15,
    lerpY: 0.1,
    deadzoneWidth: 120,
    deadzoneHeight: 80,
    initialSlingshotScreenX: 0.3,
    manualFollowViewportRatio: 0.5,
    offsetBlendRelease: 0.28,
    offsetBlendDefault: 0.18,
  },

  zoom: {
    min: 0.6,
    max: 1.0,
    aimMin: 0.8,
    launch: 0.75,
    far: 0.6,
    arrival: 0.8,
    launchSpeedThreshold: 5,
    midDistance: 120,
    farDistance: 640,
    outSmoothingMs: 0.2,
    inSmoothingMs: 0.2,
    defaultDurationMs: 400,
  },

  flight: {
    farTargetThreshold: 720,
    highArcStartDistance: 180,
    highArcFullDistance: 960,
    highArcFocusPadding: 420,
    highArcSpeedThreshold: 6,
    lookAheadMultiplier: 0.25,
    maxLookAheadX: 450,
    maxLookAheadY: 150,
    releaseHoldDurationMs: 120,
    acquireDurationMs: 140,
    zoomRampDelayMs: 15,
    zoomRampDurationMs: 220,
    releaseAccentMinOffsetX: 26,
    releaseAccentMaxOffsetX: 72,
    releaseAccentSpeedThreshold: 6,
  },

  impact: {
    maxZoomOut: 0.6,
    clusterPadding: 220,
    screenX: 0.5,
    followLerp: 0.12,
    leadFactor: 0.5,
    maxLead: 420,
    minRightLead: 450,
    forwardPadding: 160,
    baseLookAhead: 140,
    maxLookAhead: 600,
    impactSpeedNormalization: 18,
    zoomCompensation: 1.15,
    showcaseZoomDeltas: {
      minimal: 0,
      mild: 0.04,
      moderate: 0.08,
      dramatic: 0.14,
    },
  },

  sequence: {
    resetDurationMs: 1100,
    resetEase: "Cubic.InOut",
    introPanDurationMs: 2000,
    introPanEase: "Cubic.InOut",
    introPanTargetPadding: 200,
  },

  drag: {
    inertia: 0.85,
    inertiaThreshold: 0.3,
  },

  shake: {
    birdLandIntensity: 5,
  },

  parallax: {
    scrollThreshold: 32,
    zoomThreshold: 0.25,
  },
} as const;

export const {
  follow: FOLLOW_CONFIG,
  zoom: ZOOM_CONFIG,
  flight: FLIGHT_CONFIG,
  impact: IMPACT_CONFIG,
  sequence: SEQUENCE_CONFIG,
  drag: DRAG_CONFIG,
  shake: SHAKE_CONFIG,
  parallax: PARALLAX_CAMERA_CONFIG,
} = CAMERA_CONFIG;
