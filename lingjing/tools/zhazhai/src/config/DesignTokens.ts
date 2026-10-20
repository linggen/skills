export const DesignTokens = {
  colors: {
    primary: {
      brown: "#8B6F47",
      brownDark: "#6B5A35",
      beige: "#F5EFD6",
      cream: "#E8D5B7",
    },
    accent: {
      gold: "#FFD700",
      green: "#4CAF50",
      blue: "#4A90E2",
      red: "#C25B56",
    },
    neutral: {
      white: "#FFFFFF",
      black: "#000000",
      grey: "#8B9CB8",
      greyDark: "#6B7280",
      disabled: "#888888",
    },
    feedback: {
      success: "#4a9c6d",
      fail: "#e74c3c",
      overlay: "rgba(0,0,0,0.75)",
    },
    text: {
      onCream: "#895103",
      onDark: "#F5EFD6",
      gold: "#FFD700",
    },
  },

  fonts: {
    family: "Kenney Bold",
    sizes: {
      display: 72,
      title: 48,
      subtitle: 32,
      button: 24,
      label: 18,
      caption: 12,
    },
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
  },

  duration: {
    instant: 50,
    fast: 100,
    normal: 150,
    medium: 300,
    slow: 500,
    verySlow: 1000,
  },

  easing: {
    bounce: "Back.Out",
    snap: "Quad.Out",
    smooth: "Sine.Out",
    press: "Quad.Out",
    linear: "Linear",
  },

  depth: {
    background: -10,
    game: 0,
    slingshotBase: 0,
    block: 10,
    pig: 20,
    slingshot: 24,
    bird: 30,
    slingshotParticles: 46,
    trajectory: 50,
    explosionShader: 51,
    hud: 100,
    hudElements: 101,
    panels: 150,
    pauseMenu: 200,
    dialogs: 250,
    overlay: 254,
    toast: 300,
  },

  button: {
    sizes: {
      primary: { width: 280, height: 64 },
      secondary: { width: 200, height: 64 },
      small: { width: 140, height: 48 },
      icon: { width: 60, height: 60 },
    },
    width: 280,
    height: 64,
    hoverScale: 1.05,
    pressScale: 0.95,
    touchBuffer: 20,
    iconSize: 48,
  },

  panel: {
    padding: 24,
    borderRadius: 16,
    shadowOffset: 4,
    shadowAlpha: 0.3,
  },

  star: {
    size: 70,
    spacing: 80,
    revealDelay: 300,
    revealDuration: 300,
    particleScale: 0.15,
  },

  touch: {
    minSize: 44,
    recommendedSize: 48,
    buffer: 20,
  },

  mobile: {
    aimHitboxRadius: 120,
    cameraDragTwoFingerTimeout: 200,
    touchFeedbackDuration: 100,
    hapticEnabled: true,
    orientationChangeDebounce: 300,
    fullscreenPromptDelay: 1000,
    gestureDragThreshold: 30,
    rippleScale: { from: 0.5, to: 2 },
    rippleAlpha: { from: 0.6, to: 0 },
    swipeThresholdPx: 50,
    horizontalSwipeRatio: 0.5,
    scaleRefreshDelay: 100,
    minFirePowerRatio: 0.1,
    ripplePoolSize: 5,
    rippleRadius: 20,
    desktopAimHitboxRadius: 80,
    haptic: {
      light: 10,
      medium: 25,
      heavy: 50,
      success: [30, 20, 30],
      ui: {
        buttonPress: 12,
        buttonRelease: 8,
        toggle: 15,
        slider: 10,
        cardSelect: 15,
        cardLocked: [20, 10, 20],
      },
      slingshot: {
        pullLight: 8,
        pullMedium: 15,
        pullHeavy: 25,
        pullMax: 35,
        fire: 40,
        pullThresholds: {
          max: 1,
          heavy: 0.7,
          medium: 0.4,
          light: 0.1,
        },
      },
      impact: {
        light: 15,
        medium: 30,
        heavy: 50,
        critical: 80,
        speedThresholds: {
          critical: 25,
          heavy: 15,
          medium: 8,
        },
      },
      destruction: {
        block: [40, 20],
        pig: [30, 15, 30],
        debris: 12,
      },
      fragment: {
        light: 6,
        medium: 10,
        heavy: 18,
        speedNormalization: 400,
        lightMaterialFactor: 0.7,
        intensityThresholds: {
          medium: 0.3,
          heavy: 0.6,
        },
      },
      explosion: {
        small: [50, 30, 20],
        medium: [80, 50, 30, 20],
        large: [120, 80, 50, 30, 20],
        tnt: [150, 100, 70, 50, 30],
        radiusThresholds: {
          tnt: 200,
          large: 150,
          medium: 100,
        },
      },
      ability: {
        speedBoost: [20, 40],
        split: [15, 15, 15],
        eggDrop: 30,
        explosion: 100,
      },
      game: {
        win: [50, 30, 50, 30, 80],
        lose: [100, 50, 30],
        starReveal: [20, 30, 40],
        levelComplete: [30, 20, 30, 50, 80],
        starRevealDelays: {
          first: 300,
          second: 600,
        },
      },
    },
    hapticCooldowns: {
      slingshotPull: 80,
      impact: 50,
      destruction: 30,
      explosion: 200,
      fragment: 40,
      ui: 100,
    },
  },
} as const;

export const BUTTON_INSETS = {
  left: 10,
  right: 10,
  top: 10,
  bottom: 10,
} as const;

export const PANEL_INSETS = {
  left: 16,
  right: 16,
  top: 16,
  bottom: 16,
} as const;
