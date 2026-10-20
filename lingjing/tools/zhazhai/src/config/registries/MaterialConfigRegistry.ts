import { BlockMaterial } from "../../constants/Materials";
import { GameConfig } from "../GameConfig";
import { MobileManager } from "../../systems/mobile/MobileManager";
import { PerformanceManager } from "../../systems/PerformanceManager";

const _pmode = PerformanceManager.getPerformanceMode();
const _fpsEst = _pmode === "high" ? 1.0 : _pmode === "medium" ? 0.6 : _pmode === "low" ? 0.25 : 0.5;
const _mobileBlendStr = MobileManager.getInstance().isMobile() && _fpsEst < 0.7 ? "NORMAL" : "ADD";

export const VFX_ATLAS_KEY = "vfx" as const;

export interface MaterialVFXProfile {
  atlasKey?: string;
  particleTexture: string;
  particleCount: number;
  particleSpeed: { min: number; max: number };
  particleLifespan: number;
  particleGravity: number;
  particleScale: { start: number; end: number };
  particleAlpha: { start: number; end: number };
  particleTint: number[];
  particleBlendMode: string;
  spreadCone: number;
  downwardBias: number;
  stages: {
    primary: number;
    secondary: number;
    settling: number;
  };
  secondaryTexture?: string;
  secondaryCount?: number;
  settlingTexture?: string;
  settlingTint?: number[];
}

export interface MaterialCameraConfig {
  shakeMultiplier: number;
  flashColor: number;
  hitPauseDuration: number;
}

export interface MaterialSoundConfig {
  impactSounds: string[];
  destroySound: string;
}

export interface MaterialExplosionConfig {
  colorRGB: [number, number, number];
  colorNormal: [number, number, number];
}

export interface MaterialFragmentConfig {
  density: number;
  restitution: number;
  friction: number;
  angularVelocity: number;
  blendFactor: number;
  count: number;
  voronoiRelaxation: number;
}

export interface MaterialConfig {
  vfx: MaterialVFXProfile;
  camera: MaterialCameraConfig;
  sound: MaterialSoundConfig;
  explosion: MaterialExplosionConfig;
  fragment: MaterialFragmentConfig;
  health: number;
  color: number;
}

export class MaterialConfigRegistry {
  private configs: Map<BlockMaterial, MaterialConfig> = new Map();

  register(material: BlockMaterial, config: MaterialConfig): void {
    this.configs.set(material, config);
  }

  get(material: BlockMaterial): MaterialConfig | undefined {
    return this.configs.get(material);
  }

  getVFX(material: BlockMaterial): MaterialVFXProfile | undefined {
    return this.configs.get(material)?.vfx;
  }

  getCamera(material: BlockMaterial): MaterialCameraConfig | undefined {
    return this.configs.get(material)?.camera;
  }

  getSound(material: BlockMaterial): MaterialSoundConfig | undefined {
    return this.configs.get(material)?.sound;
  }

  getExplosion(material: BlockMaterial): MaterialExplosionConfig | undefined {
    return this.configs.get(material)?.explosion;
  }

  getFragment(material: BlockMaterial): MaterialFragmentConfig | undefined {
    return this.configs.get(material)?.fragment;
  }

  getHealth(material: BlockMaterial): number {
    return this.configs.get(material)?.health ?? 100;
  }

  getColor(material: BlockMaterial): number {
    return this.configs.get(material)?.color ?? 0xffffff;
  }

  has(material: BlockMaterial): boolean {
    return this.configs.has(material);
  }

  getMaterials(): BlockMaterial[] {
    return Array.from(this.configs.keys());
  }
}

function createDefaultMaterialRegistry(): MaterialConfigRegistry {
  const registry = new MaterialConfigRegistry();

  registry.register(BlockMaterial.GLASS, {
    health: GameConfig.materials[BlockMaterial.GLASS].health,
    color: 0x88ccff,
    vfx: {
      atlasKey: VFX_ATLAS_KEY,
      particleTexture: "twirl_01",
      particleCount: 7,
      particleSpeed: { min: 60, max: 120 },
      particleLifespan: 500,
      particleGravity: 100,
      particleScale: { start: 0.25, end: 0 },
      particleAlpha: { start: 0.7, end: 0 },
      particleTint: [0x88ccff, 0xaaddff, 0xffffff, 0xccffff],
      particleBlendMode: _mobileBlendStr,
      spreadCone: 0.4,
      downwardBias: 0.5,
      stages: { primary: 0, secondary: 50, settling: 150 },
      secondaryTexture: "light_01",
      secondaryCount: 4,
    },
    camera: {
      shakeMultiplier: 0.2,
      flashColor: 0x88ccff,
      hitPauseDuration: 20,
    },
    sound: {
      impactSounds: ["impact_glass_light", "impact_glass_medium", "impact_glass_heavy"],
      destroySound: "impact_glass_heavy",
    },
    explosion: {
      colorRGB: [136, 204, 255],
      colorNormal: [0.53, 0.8, 1.0],
    },
    fragment: {
      density: 0.0015,
      restitution: 0.4,
      friction: 0.1,
      angularVelocity: 1,
      blendFactor: 0.3,
      count: 16,
      voronoiRelaxation: 1,
    },
  });

  registry.register(BlockMaterial.WOOD, {
    health: GameConfig.materials[BlockMaterial.WOOD].health,
    color: 0xddaa77,
    vfx: {
      atlasKey: VFX_ATLAS_KEY,
      particleTexture: "smoke_02",
      particleCount: 6,
      particleSpeed: { min: 30, max: 60 },
      particleLifespan: 600,
      particleGravity: 150,
      particleScale: { start: 0.4, end: 0 },
      particleAlpha: { start: 0.8, end: 0 },
      particleTint: [0xddaa77, 0xccbb88, 0xaa9966, 0xbb9966],
      particleBlendMode: "NORMAL",
      spreadCone: 0.5,
      downwardBias: 0.6,
      stages: { primary: 0, secondary: 100, settling: 200 },
      secondaryTexture: "smoke_01",
      secondaryCount: 2,
      settlingTexture: "smoke_01",
      settlingTint: [0xddaa77, 0xccbb88],
    },
    camera: {
      shakeMultiplier: 0.3,
      flashColor: 0xddaa77,
      hitPauseDuration: 35,
    },
    sound: {
      impactSounds: ["impact_wood_light", "impact_wood_medium", "impact_wood_heavy"],
      destroySound: "impact_wood_heavy",
    },
    explosion: {
      colorRGB: [221, 170, 119],
      colorNormal: [0.87, 0.67, 0.47],
    },
    fragment: {
      density: 0.003,
      restitution: 0.3,
      friction: 0.5,
      angularVelocity: 0.75,
      blendFactor: 0.5,
      count: 8,
      voronoiRelaxation: 2,
    },
  });

  registry.register(BlockMaterial.STONE, {
    health: GameConfig.materials[BlockMaterial.STONE].health,
    color: 0x888888,
    vfx: {
      atlasKey: VFX_ATLAS_KEY,
      particleTexture: "dirt_02",
      particleCount: 4,
      particleSpeed: { min: 15, max: 35 },
      particleLifespan: 700,
      particleGravity: 300,
      particleScale: { start: 0.5, end: 0 },
      particleAlpha: { start: 0.6, end: 0 },
      particleTint: [0x888888, 0x777777, 0x666666, 0x999999],
      particleBlendMode: "NORMAL",
      spreadCone: 0.15,
      downwardBias: 0.9,
      stages: { primary: 0, secondary: 150, settling: 300 },
      secondaryTexture: "dirt_01",
      secondaryCount: 1,
      settlingTexture: "dirt_01",
      settlingTint: [0x888888, 0x777777],
    },
    camera: {
      shakeMultiplier: 0.4,
      flashColor: 0xaaaaaa,
      hitPauseDuration: 50,
    },
    sound: {
      impactSounds: ["impact_stone_light", "impact_stone_medium", "impact_stone_heavy"],
      destroySound: "impact_stone_heavy",
    },
    explosion: {
      colorRGB: [136, 136, 136],
      colorNormal: [0.53, 0.53, 0.53],
    },
    fragment: {
      density: 0.006,
      restitution: 0.2,
      friction: 0.7,
      angularVelocity: 0.25,
      blendFactor: 0.1,
      count: 6,
      voronoiRelaxation: 3,
    },
  });

  registry.register(BlockMaterial.METAL, {
    health: GameConfig.materials[BlockMaterial.METAL].health,
    color: 0xaaaaaa,
    vfx: {
      atlasKey: VFX_ATLAS_KEY,
      particleTexture: "spark_02",
      particleCount: 4,
      particleSpeed: { min: 80, max: 150 },
      particleLifespan: 300,
      particleGravity: 200,
      particleScale: { start: 0.2, end: 0 },
      particleAlpha: { start: 0.9, end: 0 },
      particleTint: [0xffffcc, 0xffff99, 0xffffff, 0xffcc66],
      particleBlendMode: _mobileBlendStr,
      spreadCone: 0.3,
      downwardBias: 0.4,
      stages: { primary: 0, secondary: 50, settling: 100 },
      secondaryTexture: "spark_03",
      secondaryCount: 2,
    },
    camera: {
      shakeMultiplier: 0.35,
      flashColor: 0xaaaaaa,
      hitPauseDuration: 65,
    },
    sound: {
      impactSounds: ["impact_metal_light", "impact_metal_medium", "impact_metal_heavy"],
      destroySound: "impact_metal_heavy",
    },
    explosion: {
      colorRGB: [204, 204, 204],
      colorNormal: [0.8, 0.8, 0.8],
    },
    fragment: {
      density: 0.009,
      restitution: 0.15,
      friction: 0.4,
      angularVelocity: 0.25,
      blendFactor: 0.2,
      count: 6,
      voronoiRelaxation: 3,
    },
  });

  registry.register(BlockMaterial.EXPLOSIVE, {
    health: GameConfig.materials[BlockMaterial.EXPLOSIVE].health,
    color: 0xff6600,
    vfx: {
      atlasKey: VFX_ATLAS_KEY,
      particleTexture: "fire_01",
      particleCount: 8,
      particleSpeed: { min: 100, max: 200 },
      particleLifespan: 400,
      particleGravity: -50,
      particleScale: { start: 0.4, end: 0 },
      particleAlpha: { start: 0.9, end: 0 },
      particleTint: [0xff6600, 0xff9900, 0xffcc00, 0xff3300],
      particleBlendMode: _mobileBlendStr,
      spreadCone: Math.PI,
      downwardBias: 0.0,
      stages: { primary: 0, secondary: 100, settling: 300 },
      secondaryTexture: "flame_03",
      secondaryCount: 4,
    },
    camera: {
      shakeMultiplier: 1.3,
      flashColor: 0xff6600,
      hitPauseDuration: 100,
    },
    sound: {
      impactSounds: ["impact_wood_heavy", "impact_wood_heavy", "impact_wood_heavy"],
      destroySound: "explosion",
    },
    explosion: {
      colorRGB: [255, 102, 0],
      colorNormal: [1.0, 0.4, 0.0],
    },
    fragment: {
      density: 0.0025,
      restitution: 0.4,
      friction: 0.3,
      angularVelocity: 1,
      blendFactor: 0.7,
      count: 12,
      voronoiRelaxation: 0,
    },
  });

  return registry;
}

export const materialRegistry = createDefaultMaterialRegistry();
