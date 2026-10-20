import Phaser from "phaser";
import { BlockMaterial } from "../constants/Materials";
import type { IExplosionShaderManager } from "../interfaces/IExplosionShaderManager";
import { materialRegistry } from "../config/registries/MaterialConfigRegistry";
import { DesignTokens } from "../config/DesignTokens";
import { EXPLOSION_SHADER_VFX_CONFIG } from "../config/VFXConfig";
import { MobileManager } from "./mobile/MobileManager";

export class ExplosionShaderManager implements IExplosionShaderManager {
  private scene: Phaser.Scene;
  private shader: Phaser.GameObjects.Shader | null = null;
  private isActive: boolean = false;
  private activeTime: number = 0;
  private duration: number = EXPLOSION_SHADER_VFX_CONFIG.defaultDuration;
  private isLowEndDevice: boolean;
  private baseQuadSize: number;
  private currentQuadSize: number = EXPLOSION_SHADER_VFX_CONFIG.defaultQuadSize;
  private currentRadius: number = EXPLOSION_SHADER_VFX_CONFIG.defaultRadius;
  private currentColor: number[] = [...EXPLOSION_SHADER_VFX_CONFIG.defaultColor];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.isLowEndDevice = MobileManager.getInstance().isMobile();
    this.baseQuadSize = this.isLowEndDevice
      ? EXPLOSION_SHADER_VFX_CONFIG.lowEndQuadSize
      : EXPLOSION_SHADER_VFX_CONFIG.normalQuadSize;
    this.currentQuadSize = this.baseQuadSize;
  }

  public init(): void {
    this.createShader();
  }

  private createShader(): void {
    try {
      this.shader = this.scene.add.shader(
        "ExplosionShader",
        0,
        0,
        this.baseQuadSize,
        this.baseQuadSize
      );
      this.shader.setVisible(false);
      this.shader.setDepth(DesignTokens.depth.explosionShader);
      this.shader.setOrigin(EXPLOSION_SHADER_VFX_CONFIG.shaderOrigin);
      this.setUniformsBatch(0, this.currentRadius, 1.0, this.baseQuadSize, this.currentColor);
    } catch (e) {
      console.warn("Failed to create explosion shader:", e);
    }
  }

  private setUniformsBatch(
    time: number,
    radius: number,
    intensity: number,
    quadSize: number,
    color: number[]
  ): void {
    if (!this.shader) return;
    this.shader.setUniform("uParams", [time, radius, intensity, quadSize]);
    this.shader.setUniform("uColor", color);
  }

  public triggerExplosion(
    x: number,
    y: number,
    radius: number,
    material: string = BlockMaterial.EXPLOSIVE
  ): void {
    if (!this.shader) return;

    const mat = material as BlockMaterial;
    const explosionConfig = materialRegistry.getExplosion(mat);
    const color = explosionConfig?.colorNormal ?? [...EXPLOSION_SHADER_VFX_CONFIG.defaultColor];

    const quadSize = Math.min(
      this.baseQuadSize,
      Math.ceil(radius * EXPLOSION_SHADER_VFX_CONFIG.quadSizeRadiusMultiplier)
    );
    const clampedQuadSize = Math.max(
      EXPLOSION_SHADER_VFX_CONFIG.quadSizeMin,
      Math.min(EXPLOSION_SHADER_VFX_CONFIG.quadSizeMax, quadSize)
    );

    this.currentQuadSize = clampedQuadSize;
    this.currentRadius = EXPLOSION_SHADER_VFX_CONFIG.defaultRadius;
    this.currentColor = color;

    this.shader.setPosition(x, y);
    this.shader.setSize(clampedQuadSize, clampedQuadSize);
    this.setUniformsBatch(
      0,
      EXPLOSION_SHADER_VFX_CONFIG.defaultRadius,
      1.0,
      clampedQuadSize,
      color
    );
    this.shader.setVisible(true);

    this.isActive = true;
    this.activeTime = 0;
  }

  public update(delta: number): void {
    if (!this.isActive || !this.shader) return;

    this.activeTime += delta;
    const progress = this.activeTime / this.duration;

    if (progress >= 1) {
      this.shader.setVisible(false);
      this.isActive = false;
      return;
    }

    const intensity = 1.0 - progress;
    const time = this.activeTime / 1000;

    this.setUniformsBatch(
      time,
      this.currentRadius,
      intensity,
      this.currentQuadSize,
      this.currentColor
    );
  }

  public isExploding(): boolean {
    return this.isActive;
  }

  public destroy(): void {
    if (this.shader) {
      this.shader.destroy();
      this.shader = null;
    }
  }
}

export default ExplosionShaderManager;
