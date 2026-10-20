export { ParallaxSystem, normalizeScrollX } from "./ParallaxSystem";
export type {
  ParallaxScrollEvent,
  ParallaxThemeEvent,
  ParallaxSceneInitData,
} from "./ParallaxSystem";

export { ParallaxManager } from "./ParallaxManager";
export { ParallaxEffects } from "./ParallaxEffects";
export { BackgroundParticles } from "./BackgroundParticles";

export { SkyGradientRenderer } from "./utils/SkyGradientRenderer";
export {
  generateAtmosphereGlowTexture,
  getAtmosphereGlowKey,
} from "./utils/AtmosphereGlowTextureFactory";
export type { AtmosphereGlowConfig } from "./utils/AtmosphereGlowTextureFactory";

export { THEME_COLORS, getThemeColors } from "./config/ThemeColors";
export type { ThemeColors } from "./config/ThemeColors";

export { THEME_LAYERS, getLayerConfigs } from "./config/LayerConfigs";
export type { LayerConfig } from "./config/LayerConfigs";

export {
  PARALLAX_POSITION_CONFIG,
  PARALLAX_SCROLL_CONFIG,
  PARALLAX_SMOOTHING_CONFIG,
  PARALLAX_CLOUD_CONFIG,
  PARALLAX_MENU_DRIFT_CONFIG,
  PARALLAX_EFFECTS_CONFIG,
  PARALLAX_ATMOSPHERE_CONFIG,
  PARALLAX_LAYER_RESPONSE_CONFIG,
  ATMOSPHERE_GLOW_EFFECT_CONFIG,
  ATMOSPHERE_GLOW_POSITION_CONFIGS,
  getAtmosphereGlowPositionConfig,
} from "./config/ParallaxConfig";
export type { AtmosphereGlowPositionConfig } from "./config/ParallaxConfig";
