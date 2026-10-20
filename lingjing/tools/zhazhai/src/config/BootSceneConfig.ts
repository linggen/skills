export interface ProgressBarConfig {
  width: number;
  height: number;
  radius: number;
  y: number;
}

export interface GridConfig {
  lineSpacing: number;
  lineWidth: number;
  lineColor: number;
}

export interface ProgressColorsConfig {
  background: number;
  border: number;
  innerBg: number;
  fill: number;
  highlight: number;
  highlightAlpha: number;
}

export interface BootSceneStyleConfig {
  backgroundColor: number;
  grid: GridConfig;
  loadingTextY: number;
  tipTextY: number;
  wordWrapPadding: number;
  tipRotationDelay: number;
  progressColors: ProgressColorsConfig;
  borderPadding: number;
  borderRadius: number;
  borderLineWidth: number;
  fadeOutDuration: number;
}

export const BOOT_SCENE_CONFIG: BootSceneStyleConfig = {
  backgroundColor: 0x1a1a2e,
  grid: {
    lineSpacing: 32,
    lineWidth: 2,
    lineColor: 0x2a2a4e,
  },
  loadingTextY: 58,
  tipTextY: 148,
  wordWrapPadding: 128,
  tipRotationDelay: 3000,
  progressColors: {
    background: 0x0a0a1e,
    border: 0x3a3a5e,
    innerBg: 0x1a1a3e,
    fill: 0x4caf50,
    highlight: 0x81c784,
    highlightAlpha: 0.5,
  },
  borderPadding: 4,
  borderRadius: 8,
  borderLineWidth: 2,
  fadeOutDuration: 500,
} as const;

export const BOOT_PROGRESS_BAR_CONFIG: ProgressBarConfig = {
  width: 400,
  height: 24,
  radius: 12,
  y: 0,
} as const;

export const BOOT_SCENE_TEXT_CONFIG = {
  loadingStrokeThickness: 3,
  tipStrokeThickness: 2,
} as const;
