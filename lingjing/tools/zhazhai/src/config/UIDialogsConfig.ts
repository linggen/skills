export interface ResultsDialogLayoutConfig {
  width: number;
  height: number;
  buttonGap: number;
  titleY: number;
  starsX: number;
  starsY: number;
  starRevealDelay: number;
  levelTextY: number;
  scoreBreakdownY: number;
  scoreBreakdownDelay: number;
  buttonContainerY: number;
  buttonY: number;
  buttonOffsetDivisor: number;
  homeButtonYWon: number;
  homeButtonYLost: number;
}

export const RESULTS_DIALOG_CONFIG: ResultsDialogLayoutConfig = {
  width: 550,
  height: 625,
  buttonGap: 120,
  titleY: 64,
  starsX: -4,
  starsY: 156,
  starRevealDelay: 200,
  levelTextY: 212,
  scoreBreakdownY: -64,
  scoreBreakdownDelay: 1100,
  buttonContainerY: 95,
  buttonY: -48,
  buttonOffsetDivisor: 8,
  homeButtonYWon: 72,
  homeButtonYLost: 80,
} as const;

export interface SettingsDialogLayoutConfig {
  arrowScale: number;
  controlGap: number;
  width: number;
  height: number;
  titleY: number;
  performanceStartY: number;
  performanceLabelX: number;
  performanceControlCenterX: number;
  performanceHintY: number;
  performanceHintWordWrap: number;
  effectsStartY: number;
  effectsRowGap: number;
  musicStartY: number;
  sfxStartY: number;
  sliderX: number;
  sliderYOffset: number;
}

export const SETTINGS_DIALOG_CONFIG: SettingsDialogLayoutConfig = {
  arrowScale: 0.7,
  controlGap: 88,
  width: 600,
  height: 880,
  titleY: -400,
  performanceStartY: -280,
  performanceLabelX: -184,
  performanceControlCenterX: 172,
  performanceHintY: 56,
  performanceHintWordWrap: 420,
  effectsStartY: -112,
  effectsRowGap: 56,
  musicStartY: 164,
  sfxStartY: 280,
  sliderX: -28,
  sliderYOffset: 58,
} as const;

export interface ConfirmDialogLayoutConfig {
  titleY: number;
  titleStrokeThickness: number;
  messageY: number;
  messageStrokeThickness: number;
  wordWrapWidth: number;
  buttonGap: number;
  buttonY: number;
}

export const CONFIRM_DIALOG_CONFIG: ConfirmDialogLayoutConfig = {
  titleY: -80,
  titleStrokeThickness: 4,
  messageY: -20,
  messageStrokeThickness: 2,
  wordWrapWidth: 380,
  buttonGap: 80,
  buttonY: 70,
} as const;

export interface ScoreBreakdownLayoutConfig {
  lineHeight: number;
  valueOffset: number;
  totalYOffset: number;
  dividerHeight: number;
}

export const SCORE_BREAKDOWN_CONFIG: ScoreBreakdownLayoutConfig = {
  lineHeight: 35,
  valueOffset: 150,
  totalYOffset: 10,
  dividerHeight: 2,
} as const;

export interface HUDLayoutConfigType {
  scorePanelX: number;
  pauseButtonX: number;
  pauseButtonY: number;
}

export const HUD_LAYOUT_CONFIG: HUDLayoutConfigType = {
  scorePanelX: 104,
  pauseButtonX: -30,
  pauseButtonY: 30,
} as const;

export interface OrientationOverlayLayoutConfig {
  backgroundAlpha: number;
  iconY: number;
  iconSize: string;
  animationDuration: number;
  messageY: number;
  subMessageY: number;
}

export const ORIENTATION_OVERLAY_CONFIG: OrientationOverlayLayoutConfig = {
  backgroundAlpha: 0.9,
  iconY: -60,
  iconSize: "80px",
  animationDuration: 1000,
  messageY: 40,
  subMessageY: 90,
} as const;

export interface PauseMenuLayoutConfig {
  overlayAlpha: number;
  panelWidth: number;
  panelHeight: number;
  titleY: number;
  buttonStartY: number;
  buttonGap: number;
}

export const PAUSE_MENU_CONFIG: PauseMenuLayoutConfig = {
  overlayAlpha: 0.75,
  panelWidth: 350,
  panelHeight: 444,
  titleY: -200,
  buttonStartY: -72,
  buttonGap: 80,
} as const;
