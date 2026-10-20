import Phaser from "phaser";
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT, ThemeType } from "../../config/GameConfig";
import {
  generateAtmosphereGlowTexture,
  getAtmosphereGlowKey,
} from "./utils/AtmosphereGlowTextureFactory";
import { type ThemeColors, getThemeColors } from "./config/ThemeColors";
import { type LayerConfig, getLayerConfigs } from "./config/LayerConfigs";
import { SkyGradientRenderer } from "./utils/SkyGradientRenderer";
import { PerformanceManager } from "../../systems/PerformanceManager";
import { getMobileSafeBlendMode } from "../../utils/MobileBlendMode";
import { MobileManager } from "../../systems/mobile/MobileManager";
import {
  PARALLAX_POSITION_CONFIG,
  PARALLAX_SCROLL_CONFIG,
  PARALLAX_SMOOTHING_CONFIG,
  PARALLAX_CLOUD_CONFIG,
  PARALLAX_LAYER_RESPONSE_CONFIG,
  PARALLAX_ATMOSPHERE_CONFIG,
  ATMOSPHERE_GLOW_EFFECT_CONFIG,
  getAtmosphereGlowPositionConfig,
} from "./config/ParallaxConfig";

interface ParallaxLayer {
  sprite: Phaser.GameObjects.TileSprite | Phaser.GameObjects.Image;
  scrollFactor: number;
  scrollFactorY: number;
  type: "tile" | "static";
  screenX: number;
  screenY: number;
  baseX: number;
  baseY: number;
  currentTileX: number;
  currentY: number;
  smoothingFactor: number;
  driftOffset: number;
}

interface CloudAnimation {
  sprite: Phaser.GameObjects.TileSprite;
  baseY: number;
  driftSpeed: number;
  bobAmplitude: number;
  bobSpeed: number;
  phase: number;
}

export class ParallaxManager {
  private scene: Phaser.Scene;
  private theme: ThemeType = "forest";
  private layers: ParallaxLayer[] = [];
  private skyRenderer: SkyGradientRenderer;
  private cloudAnimations: CloudAnimation[] = [];
  private atmosphereGlow: Phaser.GameObjects.Image | null = null;
  private isDestroyed: boolean = false;
  private updateFrameCounter: number = 0;

  private readonly TILE_WIDTH: number;
  private readonly TILE_HEIGHT: number;
  private readonly TILE_CENTER_X: number;
  private readonly SKY_START_Y = PARALLAX_POSITION_CONFIG.skyStartY;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.TILE_WIDTH = VIEWPORT_WIDTH + PARALLAX_POSITION_CONFIG.tileWidthPadding;
    this.TILE_HEIGHT = VIEWPORT_HEIGHT + PARALLAX_POSITION_CONFIG.tileHeightPadding;
    this.TILE_CENTER_X = VIEWPORT_WIDTH / 2;

    this.skyRenderer = new SkyGradientRenderer(
      this.scene,
      this.TILE_WIDTH,
      this.TILE_CENTER_X,
      this.SKY_START_Y
    );
  }

  setTheme(theme: ThemeType): void {
    this.theme = theme;
    this.recreateLayers();
  }

  getTheme(): ThemeType {
    return this.theme;
  }

  initialize(scrollX: number, scrollY: number): void {
    for (const layer of this.layers) {
      layer.currentTileX =
        layer.baseX +
        scrollX *
          this.TILE_WIDTH *
          layer.scrollFactor *
          PARALLAX_SCROLL_CONFIG.scrollFactorForTarget;
      layer.currentY = layer.baseY - scrollY * layer.scrollFactorY;
      layer.driftOffset = 0;

      if (layer.type === "tile") {
        const tileSprite = layer.sprite as Phaser.GameObjects.TileSprite;
        tileSprite.tilePositionX = Math.round(layer.currentTileX);
        tileSprite.y = Math.round(layer.currentY);
      }
    }
  }

  create(): void {
    this.isDestroyed = false;
    this.createSkyGradient();
    this.createAtmosphereGlow();
    this.createParallaxLayers();
  }

  private createSkyGradient(): void {
    const colors = getThemeColors(this.theme);
    this.skyRenderer.create(colors, this.TILE_HEIGHT);
  }

  private createAtmosphereGlow(): void {
    const glowConfig = getAtmosphereGlowPositionConfig(this.theme, this.TILE_CENTER_X);
    const colors = getThemeColors(this.theme);
    const textureKey = getAtmosphereGlowKey(this.theme);

    if (!this.scene.textures.exists(textureKey)) {
      generateAtmosphereGlowTexture(this.scene, textureKey, {
        color: colors.ambientGlow,
        radius: glowConfig.radius,
        intensity: glowConfig.intensity,
      });
    }

    const glowSprite = this.scene.add.image(glowConfig.x, glowConfig.y, textureKey);
    glowSprite.setScrollFactor(0);
    glowSprite.setDepth(glowConfig.depth);
    glowSprite.setBlendMode(
      getMobileSafeBlendMode(
        PerformanceManager.getQualityMultiplier(this.scene),
        MobileManager.getInstance().isMobile()
      )
    );
    glowSprite.setOrigin(0.5, 0.5);

    this.atmosphereGlow = glowSprite;
  }

  private createParallaxLayers(): void {
    const configs = getLayerConfigs(this.theme);
    const colors = getThemeColors(this.theme);

    for (const config of configs) {
      const baseTint = colors[config.tintKey as keyof ThemeColors];
      const tint = this.applyEnhancedAtmosphericPerspective(
        baseTint,
        config.atmosphericBlend,
        colors
      );

      this.createTileLayer(config, tint);
    }
  }

  private createTileLayer(config: LayerConfig, tint: number): void {
    const texture = this.scene.textures.get("backgrounds");
    if (!texture || texture.key === "__MISSING") return;

    const frame = texture.get(config.asset);
    const textureHeight = frame.height;
    const screenX = config.screenX ?? 0;

    const tileSprite = this.scene.add.tileSprite(
      this.TILE_CENTER_X,
      config.screenY,
      this.TILE_WIDTH,
      textureHeight,
      "backgrounds",
      config.asset
    );

    tileSprite.setOrigin(0.5, 0);
    tileSprite.setScrollFactor(0);
    tileSprite.setDepth(config.depth);
    tileSprite.setAlpha(config.opacity);
    tileSprite.setTint(tint);
    tileSprite.tilePositionX = screenX;

    const scrollFactorY =
      config.scrollFactor *
      (PARALLAX_SCROLL_CONFIG.scrollFactorYBase +
        config.scrollFactor * PARALLAX_SCROLL_CONFIG.scrollFactorYMultiplier);
    const isForegroundLayer =
      config.scrollFactor >= PARALLAX_LAYER_RESPONSE_CONFIG.foregroundScrollFactor;
    const smoothingFactor = isForegroundLayer
      ? PARALLAX_SMOOTHING_CONFIG.smoothingFactor1
      : PARALLAX_SMOOTHING_CONFIG.smoothingFactor2 +
        config.scrollFactor * PARALLAX_SMOOTHING_CONFIG.smoothingFactor3;

    this.layers.push({
      sprite: tileSprite,
      scrollFactor: config.scrollFactor,
      scrollFactorY,
      type: "tile",
      screenX,
      screenY: config.screenY,
      baseX: screenX,
      baseY: config.screenY,
      currentTileX: screenX,
      currentY: config.screenY,
      smoothingFactor,
      driftOffset: 0,
    });

    if (config.tintKey === "cloud") {
      this.cloudAnimations.push({
        sprite: tileSprite,
        baseY: config.screenY,
        driftSpeed:
          PARALLAX_CLOUD_CONFIG.bobAmplitude + Math.random() * PARALLAX_CLOUD_CONFIG.bobFrequency,
        bobAmplitude:
          PARALLAX_CLOUD_CONFIG.bobOffset + Math.random() * PARALLAX_CLOUD_CONFIG.driftY * 400,
        bobSpeed:
          PARALLAX_CLOUD_CONFIG.bobAmplitude + Math.random() * PARALLAX_CLOUD_CONFIG.bobAmplitude,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private applyEnhancedAtmosphericPerspective(
    baseColor: number,
    atmosphericBlend: number,
    colors: ThemeColors
  ): number {
    const baseRgb = Phaser.Display.Color.ValueToColor(baseColor);

    let atmosphereColor: number;
    if (atmosphericBlend > 0.5) {
      atmosphereColor = colors.atmosphereFar;
    } else if (atmosphericBlend > 0.2) {
      atmosphereColor = colors.atmosphereMid;
    } else {
      atmosphereColor = colors.atmosphereNear;
    }

    const atmRgb = Phaser.Display.Color.ValueToColor(atmosphereColor);

    const saturationReduction = atmosphericBlend * PARALLAX_ATMOSPHERE_CONFIG.saturationReduction;
    const gray = (baseRgb.red + baseRgb.green + baseRgb.blue) / 3;
    const r = Math.floor(Phaser.Math.Linear(baseRgb.red, gray, saturationReduction));
    const g = Math.floor(Phaser.Math.Linear(baseRgb.green, gray, saturationReduction));
    const b = Math.floor(Phaser.Math.Linear(baseRgb.blue, gray, saturationReduction));

    const finalR = Math.floor(Phaser.Math.Linear(r, atmRgb.red, atmosphericBlend));
    const finalG = Math.floor(Phaser.Math.Linear(g, atmRgb.green, atmosphericBlend));
    const finalB = Math.floor(Phaser.Math.Linear(b, atmRgb.blue, atmosphericBlend));

    return (finalR << 16) | (finalG << 8) | finalB;
  }

  update(scrollX: number, scrollY: number, _zoom: number, time: number, delta: number): void {
    this.updateFrameCounter++;
    const qualityMultiplier = PerformanceManager.getQualityMultiplier(this.scene);

    const skipLayerUpdate =
      qualityMultiplier < 0.5
        ? this.updateFrameCounter % 3 !== 0
        : this.updateFrameCounter % 2 !== 0;

    for (const layer of this.layers) {
      if (layer.type === "tile") {
        if (!skipLayerUpdate || layer.scrollFactor >= 0.8) {
          const targetTileX =
            layer.baseX +
            scrollX *
              this.TILE_WIDTH *
              layer.scrollFactor *
              PARALLAX_SCROLL_CONFIG.scrollFactorForTarget +
            layer.driftOffset;
          const targetY = layer.baseY - scrollY * layer.scrollFactorY;

          const t =
            1 -
            Math.exp(
              -layer.smoothingFactor * (delta / PARALLAX_SMOOTHING_CONFIG.deltaNormalization)
            );
          layer.currentTileX = Phaser.Math.Linear(layer.currentTileX, targetTileX, t);
          layer.currentY = Phaser.Math.Linear(layer.currentY, targetY, t);

          const tileSprite = layer.sprite as Phaser.GameObjects.TileSprite;
          tileSprite.tilePositionX = Math.round(layer.currentTileX);
          tileSprite.y = Math.round(layer.currentY);
        }
      }
    }

    this.updateCloudAnimations(time, delta, qualityMultiplier);
    if (qualityMultiplier >= 0.5) {
      this.updateAtmosphereGlow(time);
    }
  }

  private updateAtmosphereGlow(time: number): void {
    if (!this.atmosphereGlow) return;

    const slowPulse =
      ATMOSPHERE_GLOW_EFFECT_CONFIG.slowPulseBase +
      ATMOSPHERE_GLOW_EFFECT_CONFIG.slowPulseAmplitude *
        Math.sin(time * ATMOSPHERE_GLOW_EFFECT_CONFIG.slowPulseFrequency);
    const mediumPulse =
      ATMOSPHERE_GLOW_EFFECT_CONFIG.mediumPulseBase +
      ATMOSPHERE_GLOW_EFFECT_CONFIG.mediumPulseAmplitude *
        Math.sin(time * ATMOSPHERE_GLOW_EFFECT_CONFIG.mediumPulseFrequency);
    const fastGlimmer =
      ATMOSPHERE_GLOW_EFFECT_CONFIG.fastGlimmerBase +
      ATMOSPHERE_GLOW_EFFECT_CONFIG.fastGlimmerAmplitude *
        Math.sin(time * ATMOSPHERE_GLOW_EFFECT_CONFIG.fastGlimmerFrequency);

    const combinedPulse = slowPulse * mediumPulse * fastGlimmer;

    this.atmosphereGlow.setAlpha(combinedPulse);

    const breathe =
      ATMOSPHERE_GLOW_EFFECT_CONFIG.breatheBase +
      Math.sin(time * ATMOSPHERE_GLOW_EFFECT_CONFIG.breatheFrequency) *
        ATMOSPHERE_GLOW_EFFECT_CONFIG.breatheAmplitude;
    this.atmosphereGlow.setScale(breathe);
  }

  private updateCloudAnimations(time: number, delta: number, qualityMultiplier: number): void {
    const skipBob = qualityMultiplier < 0.5;

    for (const anim of this.cloudAnimations) {
      const layer = this.layers.find((l) => l.sprite === anim.sprite);
      if (layer) {
        layer.driftOffset += anim.driftSpeed * delta;

        if (!skipBob) {
          const bob = anim.bobAmplitude * Math.sin(time * anim.bobSpeed + anim.phase);
          anim.sprite.y = Math.round(layer.currentY + bob);
        }
      }
    }
  }

  private recreateLayers(): void {
    this.destroy();
    this.create();
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.skyRenderer.destroy();

    for (const layer of this.layers) {
      layer.sprite.destroy();
    }
    this.layers = [];

    if (this.atmosphereGlow) {
      this.atmosphereGlow.destroy();
      this.atmosphereGlow = null;
    }

    const glowKey = getAtmosphereGlowKey(this.theme);
    if (this.scene.textures.exists(glowKey)) {
      this.scene.textures.remove(glowKey);
    }

    this.cloudAnimations = [];
  }
}
