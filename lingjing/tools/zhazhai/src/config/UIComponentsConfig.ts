export interface ToggleSwitchConfig {
  trackWidth: number;
  trackHeight: number;
  thumbSize: number;
  offPosition: number;
  onPosition: number;
  insets: number;
  disabledTint: number;
}

export interface VolumeSliderConfig {
  width: number;
  height: number;
  handleSize: number;
  trackPadding: number;
  insets: number;
  trackTint: number;
  disabledAlpha: number;
}

export interface ScorePanelConfig {
  width: number;
  height: number;
  starIconX: number;
  starIconScale: number;
  starTint: number;
  scoreTextX: number;
  scoreTextY: number;
  levelTextX: number;
}

export interface LevelCardConfig {
  starScale: number;
  lockScale: number;
  hexagonScaleX: number;
  hexagonScaleY: number;
  hitAreaRadius: number;
  lockedAlpha: number;
  lockIconAlpha: number;
  hoverScale: number;
}

export interface LevelGridConfig {
  cardSpacingY: number;
  paddingTop: number;
  cardWidth: number;
  cardSpacingXMultiplier: number;
  scrollContainerXMultiplier: number;
  maskX: number;
  maskY: number;
  cardYOffset: number;
  wheelScrollMultiplier: number;
  velocityThreshold: number;
  velocityMultiplier: number;
  momentumDuration: number;
}

export interface LevelCardAnimationConfig {
  lockedXOffset: number;
  lockedDuration: number;
  lockedRepeat: number;
}

export interface HUDLayoutConfig {
  scorePanelOffsetX: number;
  pauseButtonOffsetX: number;
  pauseButtonOffsetY: number;
  helpButtonOffsetX: number;
  helpButtonOffsetY: number;
}

export interface ButtonComponentConfig {
  textStrokeThickness: number;
  disabledAlpha: number;
}

export interface PanelComponentConfig {
  shadowTint: number;
  titleStrokeThickness: number;
  animation: {
    initialScale: number;
    targetScale: number;
    targetAlpha: number;
  };
}

export interface ModalComponentConfig {
  overlayColor: number;
  overlayInitialAlpha: number;
  overlayTargetAlpha: number;
  closeButtonOffsetX: number;
  closeButtonOffsetY: number;
  closeAnimationScale: number;
  closeEase: string;
}

export interface UIComponentsConfigType {
  toggle: ToggleSwitchConfig;
  slider: VolumeSliderConfig;
  scorePanel: ScorePanelConfig;
  levelCard: LevelCardConfig;
  levelGrid: LevelGridConfig;
  levelCardAnimation: LevelCardAnimationConfig;
  hud: HUDLayoutConfig;
  button: ButtonComponentConfig;
  panel: PanelComponentConfig;
  modal: ModalComponentConfig;
}

export const UI_COMPONENTS_CONFIG: UIComponentsConfigType = {
  toggle: {
    trackWidth: 50,
    trackHeight: 36,
    thumbSize: 32,
    offPosition: -12.5,
    onPosition: 12.5,
    insets: 4,
    disabledTint: 0x888888,
  },
  slider: {
    width: 320,
    height: 32,
    handleSize: 48,
    trackPadding: 8,
    insets: 8,
    trackTint: 0x444444,
    disabledAlpha: 0.5,
  },
  scorePanel: {
    width: 220,
    height: 64,
    starIconX: 32,
    starIconScale: 0.6,
    starTint: 0xffd700,
    scoreTextX: 52,
    scoreTextY: 2,
    levelTextX: -128,
  },
  levelCard: {
    starScale: 0.65,
    lockScale: 0.75,
    hexagonScaleX: 2.25,
    hexagonScaleY: 2,
    hitAreaRadius: 55,
    lockedAlpha: 0.6,
    lockIconAlpha: 0.7,
    hoverScale: 1.1,
  },
  levelGrid: {
    cardSpacingY: 200,
    paddingTop: 30,
    cardWidth: 91,
    cardSpacingXMultiplier: 0.75,
    scrollContainerXMultiplier: 0.115,
    maskX: 40,
    maskY: 180,
    cardYOffset: 60,
    wheelScrollMultiplier: 0.5,
    velocityThreshold: 2,
    velocityMultiplier: 8,
    momentumDuration: 200,
  },
  levelCardAnimation: {
    lockedXOffset: 5,
    lockedDuration: 50,
    lockedRepeat: 5,
  },
  hud: {
    scorePanelOffsetX: 104,
    pauseButtonOffsetX: -30,
    pauseButtonOffsetY: 30,
    helpButtonOffsetX: -100,
    helpButtonOffsetY: 30,
  },
  button: {
    textStrokeThickness: 3,
    disabledAlpha: 0.5,
  },
  panel: {
    shadowTint: 0x000000,
    titleStrokeThickness: 4,
    animation: {
      initialScale: 0.8,
      targetScale: 1,
      targetAlpha: 1,
    },
  },
  modal: {
    overlayColor: 0x000000,
    overlayInitialAlpha: 0,
    overlayTargetAlpha: 0.75,
    closeButtonOffsetX: 30,
    closeButtonOffsetY: 30,
    closeAnimationScale: 0.8,
    closeEase: "Quad.In",
  },
} as const;
