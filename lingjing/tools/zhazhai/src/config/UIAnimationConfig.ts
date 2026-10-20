export interface ButtonAnimationConfig {
  strokeThickness: number;
  disabledAlpha: number;
}

export interface PanelAnimationConfig {
  titleStrokeThickness: number;
  animatedInitialScale: number;
}

export interface ModalConfig {
  overlayAlpha: number;
  closeButtonOffset: number;
  closeScale: number;
}

export interface OverlayConfig {
  backgroundAlpha: number;
}

export interface ArrowConfig {
  hoverScale: number;
  pressScale: number;
  releaseScale: number;
  hitAreaSize: number;
}

export interface UIAnimationConfigType {
  button: ButtonAnimationConfig;
  panel: PanelAnimationConfig;
  modal: ModalConfig;
  overlay: OverlayConfig;
  arrow: ArrowConfig;
}

export const UI_ANIMATION_CONFIG: UIAnimationConfigType = {
  button: {
    strokeThickness: 3,
    disabledAlpha: 0.5,
  },
  panel: {
    titleStrokeThickness: 4,
    animatedInitialScale: 0.8,
  },
  modal: {
    overlayAlpha: 0.75,
    closeButtonOffset: 30,
    closeScale: 0.8,
  },
  overlay: {
    backgroundAlpha: 0.9,
  },
  arrow: {
    hoverScale: 1.1,
    pressScale: 0.92,
    releaseScale: 1.05,
    hitAreaSize: 72,
  },
} as const;
