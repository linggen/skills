import { DesignTokens as T } from "../config/DesignTokens";

export const TweenPresets = {
  buttonHover: {
    scale: T.button.hoverScale,
    duration: T.duration.fast,
    ease: "Sine.Out",
  },

  buttonPress: {
    scale: T.button.pressScale,
    duration: T.duration.instant,
    ease: "Quad.Out",
  },

  buttonRelease: {
    scale: T.button.hoverScale,
    duration: T.duration.normal,
    ease: "Back.Out",
  },

  buttonReset: {
    scale: 1,
    duration: T.duration.fast,
    ease: "Sine.Out",
  },

  touchRipple: {
    scale: T.mobile.rippleScale,
    alpha: T.mobile.rippleAlpha,
    duration: T.duration.normal,
    ease: "Quad.Out",
  },
} as const;
