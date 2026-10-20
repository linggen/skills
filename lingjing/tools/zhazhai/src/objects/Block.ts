import Phaser from "phaser";
import Matter from "matter-js";
import { CollisionCategory } from "../constants";
import {
  FRAGMENT_WEIGHT_MULTIPLIERS,
  MATERIAL_PHYSICS,
  ExplosionTier,
  MIN_IMPACT_THRESHOLD_SQ,
  BLOCK_WEAKPOINT_CONFIG,
  BLOCK_DAMAGE_CONFIG,
} from "../config/PhysicsConfig";
import {
  getBlockTextureKey as getBlockTexKey,
  BlockShape,
  ensureOversizedTextureExists,
  LEVEL_ATLAS_KEY,
} from "../config/assetManifest";
import { GameConfig, GRID_UNIT } from "../config/GameConfig";
import { getMaterialHealth } from "../config/materials";
import { DesignTokens } from "../config/DesignTokens";
import { PhysicsEntity } from "../entities/PhysicsEntity";
import { blockShapeFactory, type BlockBodyConfig } from "../factories";
import { BodyLabelHelpers } from "../constants/BodyLabels";
import { BlockMaterial } from "../constants/Materials";
import { generateUniqueId } from "../utils/IdGenerator";
import { TimeScaleCompensator } from "../utils/TimeScaleCompensator";
import { DamageCalculator } from "../systems/DamageCalculator";
import { BirdType } from "../types/BirdType";
import type { IWakeCascadeManager } from "../interfaces/IWakeCascadeManager";

export { BlockMaterial };

interface CollisionNormal {
  x: number;
  y: number;
}

interface CollisionData {
  normal: CollisionNormal;
  supports?: { x: number; y: number }[];
}

interface MatterCollisionEvent extends Phaser.Types.Physics.Matter.MatterCollisionData {
  collision?: CollisionData;
}

export interface BlockCallbacks {
  onDestroyed?: (
    block: Block,
    impactSpeed: number,
    impactAngle: number,
    impactX?: number,
    impactY?: number
  ) => void;
  onDamage?: (
    block: Block,
    damage: number,
    currentHealth: number,
    impactSpeed: number,
    impactAngle: number,
    impactX?: number,
    impactY?: number
  ) => void;
  onExplode?: (block: Block, gridSize: number) => void;
  onSpriteSwap?: (block: Block, newTexture: string) => void;
}

const getBlockShape = (textureKey: string): BlockShape => {
  if (textureKey.includes("_circle_")) return "circle";
  if (textureKey.includes("_triangle_")) return "triangle";
  if (textureKey.includes("_square_")) return "square";
  return "rectangle";
};

const getConditionFromHealth = (healthPercent: number): "pristine" | "dented" | "cracked" => {
  if (healthPercent > GameConfig.healthThresholds.dented) return "pristine";
  if (healthPercent > GameConfig.healthThresholds.cracked) return "dented";
  return "cracked";
};

const getGridSizeFromTexture = (textureKey: string): { w: number; h: number } => {
  const match = textureKey.match(/(\d+)x(\d+)/);
  if (match) {
    return { w: parseInt(match[1], 10), h: parseInt(match[2], 10) };
  }
  return { w: 1, h: 1 };
};

// Calculate pixel dimensions from grid units
const getPixelSizeFromGrid = (gridW: number, gridH: number): { width: number; height: number } => {
  return {
    width: gridW * GRID_UNIT,
    height: gridH * GRID_UNIT,
  };
};

export class Block extends PhysicsEntity {
  public readonly material: BlockMaterial;
  public readonly shape: BlockShape;
  public readonly gridW: number;
  public readonly gridH: number;

  public callbacks: BlockCallbacks = {};
  private readonly minImpactSpeed: number = GameConfig.damage.minImpactSpeed;
  private lastImpactSpeed: number = 0;
  private lastImpactAngle: number = Math.PI / 2;
  private currentTexture: string = "";
  private currentCondition: "pristine" | "dented" | "cracked" = "pristine";
  private boundHandleCollision: (event: MatterCollisionEvent) => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    material: BlockMaterial = BlockMaterial.WOOD,
    rotation: number = 0,
    id?: string,
    elementIndex?: string,
    wakeManager?: IWakeCascadeManager
  ) {
    // Calculate grid dimensions first to determine scaled health
    const gridDims = getGridSizeFromTexture(elementIndex || "");
    const gridW = gridDims.w > 0 ? gridDims.w : Math.round(width / 70);
    const gridH = gridDims.h > 0 ? gridDims.h : Math.round(height / 70);

    // Scale health by block volume (area in 2D)
    const volumeMultiplier = gridW * gridH;
    const baseHealth = getMaterialHealth(material);
    const scaledHealth = Math.floor(baseHealth * volumeMultiplier);

    const blockId = id ?? generateUniqueId("block");
    super(scene, blockId, scaledHealth, wakeManager);

    this.material = material;
    this.gridW = gridW;
    this.gridH = gridH;

    // Determine shape from elementIndex if provided, otherwise default to rectangle
    const defaultShape: BlockShape = "rectangle";
    this.shape = elementIndex ? getBlockShape(elementIndex) : defaultShape;

    const textureKey =
      getBlockTexture(this.scene, material, this.shape, this.gridW, this.gridH, "pristine") ||
      `${material}_${this.shape}_pristine_1x1`;

    this.currentTexture = textureKey;

    this.boundHandleCollision = this.handleCollision.bind(this);
    this.createPhysicsBody(x, y, width, height, rotation, textureKey);
  }

  private createPhysicsBody(
    x: number,
    y: number,
    _width: number,
    _height: number,
    rotation: number,
    textureKey: string
  ): void {
    const materialConfig = MATERIAL_PHYSICS[this.material];
    const { width, height } = getPixelSizeFromGrid(this.gridW, this.gridH);

    let isAtlasFrame = false;
    let atlasFrame: Phaser.Textures.Frame | null = null;

    // Not a standalone texture - check atlas
    if (!this.scene.textures.exists(textureKey)) {
      const atlasTexture = this.scene.textures.get(LEVEL_ATLAS_KEY);
      atlasFrame = atlasTexture?.get(textureKey) ?? null;
      isAtlasFrame = atlasFrame !== null && atlasFrame.name === textureKey;
    }

    // Create the image - use atlas if frame exists, otherwise standalone texture
    if (isAtlasFrame) {
      this.matterImage = this.scene.matter.add.image(x, y, LEVEL_ATLAS_KEY, textureKey);
    } else {
      this.matterImage = this.scene.matter.add.image(x, y, textureKey);
    }

    // Get source dimensions - from atlas frame or standalone texture
    let sourceWidth: number;
    let sourceHeight: number;

    if (isAtlasFrame && atlasFrame) {
      sourceWidth = atlasFrame.cutWidth;
      sourceHeight = atlasFrame.cutHeight;
    } else {
      const texture = this.matterImage.texture;
      sourceWidth = texture.source[0].width;
      sourceHeight = texture.source[0].height;
    }

    // Calculate scale to match grid-based dimensions
    const scaleX = width / sourceWidth;
    const scaleY = height / sourceHeight;
    this.matterImage.setScale(scaleX, scaleY);

    const bodyConfig: BlockBodyConfig = {
      width,
      height,
      density: materialConfig.density,
      restitution: materialConfig.restitution,
      friction: materialConfig.friction,
      label: `block-${this.material}`,
    };
    blockShapeFactory.applyBody(this.shape, this.matterImage, bodyConfig);

    this.matterImage.setCollisionCategory(CollisionCategory.BLOCK);
    this.matterImage.setRotation(Phaser.Math.DegToRad(rotation));
    this.matterImage.setDepth(DesignTokens.depth.block);
    this.matterImage.setOnCollide(this.boundHandleCollision);
  }

  private handleCollision(event: MatterCollisionEvent): void {
    if (this.destroyed) return;

    const bodyA = event.bodyA;
    const bodyB = event.bodyB;

    const dvx = bodyA.velocity.x - bodyB.velocity.x;
    const dvy = bodyA.velocity.y - bodyB.velocity.y;
    const speedSquared = dvx * dvx + dvy * dvy;

    if (speedSquared < MIN_IMPACT_THRESHOLD_SQ) return;

    const isFragmentCollision =
      BodyLabelHelpers.isFragment(bodyA.label) || BodyLabelHelpers.isFragment(bodyB.label);

    const birdBody = BodyLabelHelpers.isBird(bodyA.label)
      ? bodyA
      : BodyLabelHelpers.isBird(bodyB.label)
        ? bodyB
        : null;

    const rawImpactSpeed = Math.sqrt(speedSquared);
    const impactSpeed = TimeScaleCompensator.compensateImpactSpeed(rawImpactSpeed, this.scene);

    let impactAngle = Math.atan2(dvy, dvx);

    const collisionData = event.collision;
    if (collisionData && collisionData.normal) {
      impactAngle = Math.atan2(collisionData.normal.y, collisionData.normal.x);
    }

    const impactPoint = collisionData?.supports?.[0];
    const impactX = impactPoint?.x;
    const impactY = impactPoint?.y;

    let weakpointMultiplier = 1.0;
    const normalizedAngle = Math.abs(impactAngle) % (Math.PI / 2);
    const isNearCorner =
      normalizedAngle < BLOCK_WEAKPOINT_CONFIG.cornerAngleMin ||
      normalizedAngle > BLOCK_WEAKPOINT_CONFIG.cornerAngleMax;
    if (isNearCorner) {
      weakpointMultiplier = BLOCK_WEAKPOINT_CONFIG.damageMultiplier;
    }

    if (impactSpeed >= this.minImpactSpeed) {
      this.lastImpactSpeed = impactSpeed;
      this.lastImpactAngle = impactAngle;

      let damage: number;
      if (isFragmentCollision) {
        // damage = Math.max(1, Math.floor(impactSpeed * 0.5));
        // damage = Math.min(damage, 1);

        damage = 1; // Fragments always deal 1 damage on collision, regardless of speed
      } else if (birdBody && birdBody.label) {
        const birdTypeStr = birdBody.label.startsWith("bird-")
          ? (birdBody.label.slice(5) as BirdType)
          : (birdBody.label as BirdType);
        const baseDamage = Math.floor(impactSpeed * BLOCK_DAMAGE_CONFIG.birdImpactMultiplier);

        if (
          DamageCalculator.shouldOneShot(
            birdTypeStr,
            this.material,
            impactSpeed,
            this.currentHealth
          )
        ) {
          damage = this.currentHealth; // Ensure instant kill
        } else {
          damage = DamageCalculator.calculateDamage(birdTypeStr, this.material, baseDamage);
          damage = Math.floor(damage * weakpointMultiplier);
        }
      } else {
        const effectiveWeight = FRAGMENT_WEIGHT_MULTIPLIERS[this.material];
        damage = Math.floor(
          impactSpeed * BLOCK_DAMAGE_CONFIG.fallingBlockMultiplier * effectiveWeight
        );
      }

      this.takeDamage(damage, impactSpeed, impactAngle, impactX, impactY);
      this.wakeNearbyBodies(150);
    }
  }

  public takeDamage(
    amount: number,
    impactSpeed: number = 0,
    impactAngle: number = Math.PI / 2,
    impactX?: number,
    impactY?: number
  ): void {
    if (this.destroyed) return;

    const oldCondition = this.currentCondition;
    this.currentHealth -= amount;

    // Skip intermediate texture states on one-shot kills (pristine → destroyed)
    if (this.currentHealth <= 0) {
      this.callbacks.onDamage?.(
        this,
        amount,
        this.currentHealth,
        impactSpeed || this.lastImpactSpeed,
        impactAngle,
        impactX,
        impactY
      );

      this.destroy(impactSpeed || this.lastImpactSpeed, impactAngle, impactX, impactY);
      return;
    }

    const healthPercent = this.getHealthPercent();
    const newCondition = getConditionFromHealth(healthPercent);

    if (newCondition !== oldCondition) {
      this.currentCondition = newCondition;
      this.updateSprite();
    }

    this.callbacks.onDamage?.(
      this,
      amount,
      this.currentHealth,
      impactSpeed || this.lastImpactSpeed,
      impactAngle,
      impactX,
      impactY
    );

    // if (this.currentHealth <= 0) {
    //   this.destroy(impactSpeed || this.lastImpactSpeed, impactAngle);
    // }
  }

  private updateSprite(): void {
    const newTexture = getBlockTexture(
      this.scene,
      this.material,
      this.shape,
      this.gridW,
      this.gridH,
      this.currentCondition
    );

    if (newTexture && newTexture !== this.currentTexture && this.matterImage) {
      this.currentTexture = newTexture;

      // Check if texture exists as standalone texture (9-slice) first, then atlas frame
      let isAtlasFrame = false;
      let atlasFrame: Phaser.Textures.Frame | null = null;

      if (!this.scene.textures.exists(newTexture)) {
        // Not a standalone texture - check atlas
        const atlasTexture = this.scene.textures.get(LEVEL_ATLAS_KEY);
        atlasFrame = atlasTexture?.get(newTexture) ?? null;
        isAtlasFrame = atlasFrame !== null && atlasFrame.name === newTexture;
      }

      // Set texture - use atlas if frame exists, otherwise standalone texture
      if (isAtlasFrame) {
        this.matterImage.setTexture(LEVEL_ATLAS_KEY, newTexture);
      } else {
        this.matterImage.setTexture(newTexture);
      }

      // Reapply scale - get dimensions from atlas frame or standalone texture
      const { width, height } = getPixelSizeFromGrid(this.gridW, this.gridH);
      let sourceWidth: number;
      let sourceHeight: number;

      if (isAtlasFrame && atlasFrame) {
        sourceWidth = atlasFrame.cutWidth;
        sourceHeight = atlasFrame.cutHeight;
      } else {
        const texture = this.matterImage.texture;
        sourceWidth = texture.source[0].width;
        sourceHeight = texture.source[0].height;
      }

      const scaleX = width / sourceWidth;
      const scaleY = height / sourceHeight;
      this.matterImage.setScale(scaleX, scaleY);

      this.callbacks.onSpriteSwap?.(this, newTexture);
    }
  }

  public destroy(
    impactSpeed: number = 0,
    impactAngle: number = Math.PI / 2,
    impactX?: number,
    impactY?: number
  ): void {
    if (this.destroyed) return;

    this.markDestroyed();

    this.wakeCascadeOnDestruction(this.getWidth());

    this.callbacks.onDestroyed?.(this, impactSpeed, impactAngle, impactX, impactY);

    // Clean up collision callback to prevent memory leak in Matter.js
    if (this.matterImage?.body) {
      this.matterImage.setOnCollide(() => {});
    }

    this.destroyPhysicsBody();
    this.callbacks = null as unknown as BlockCallbacks;
  }

  public getLastImpactSpeed(): number {
    return this.lastImpactSpeed;
  }

  public getLastImpactAngle(): number {
    return this.lastImpactAngle;
  }

  public getTextureKey(): string {
    return this.currentTexture;
  }

  public getMaterial(): BlockMaterial {
    return this.material;
  }

  public getWidth(): number {
    return this.gridW * GRID_UNIT;
  }

  public getHeight(): number {
    return this.gridH * GRID_UNIT;
  }

  public explode(): void {
    if (this.destroyed) return;
    this.markDestroyed();

    const largestDimension = Math.max(this.gridW, this.gridH);
    this.callbacks.onExplode?.(this, largestDimension);

    this.destroyPhysicsBody();
  }

  public isExplosive(): boolean {
    return this.material === BlockMaterial.EXPLOSIVE;
  }

  public setStatic(isStatic: boolean): void {
    if (this.matterImage && !this.destroyed) {
      this.matterImage.setStatic(isStatic);
    }
  }

  public sleep(): void {
    if (this.matterImage?.body && !this.destroyed) {
      const body = this.matterImage.body as Matter.Body;
      if (!body.isStatic && !body.isSleeping) {
        Matter.Sleeping.set(body, true);
      }
    }
  }

  public getExplosionTier(): ExplosionTier {
    const largestDimension = Math.max(this.gridW, this.gridH);
    if (largestDimension >= 2) {
      return "tntLarge";
    } else if (largestDimension >= 1.5 || this.gridW * this.gridH >= 2) {
      return "tntMedium";
    }
    return "tntSmall";
  }

  public getChainDelay(): number {
    return BLOCK_DAMAGE_CONFIG.chainReactionDelay;
  }
}

function getBlockTexture(
  scene: Phaser.Scene,
  material: BlockMaterial,
  shape: BlockShape,
  gridW: number,
  gridH: number,
  condition: "pristine" | "dented" | "cracked" = "pristine"
): string {
  const texture = getBlockTexKey(material, shape, gridW, gridH, condition);
  const result =
    texture ||
    getBlockTexKey(material, shape, 1, 1, "pristine") ||
    `${material}_${shape}_pristine_1x1`;

  ensureOversizedTextureExists(scene, result);
  return result;
}
