import { BlockMaterial } from "../constants/Materials";
import { GRID_UNIT } from "./GameConfig";
import type Phaser from "phaser";

export const LEVEL_ATLAS_KEY = "level" as const;

export type BlockShape = "circle" | "triangle" | "square" | "rectangle";

export interface BlockAssetInfo {
  textureKey: string;
  material: BlockMaterial;
  shape: BlockShape;
  condition: "pristine" | "dented" | "cracked";
  gridW: number;
  gridH: number;
}

export interface DebrisAssetInfo {
  textureKey: string;
  material: BlockMaterial;
}

interface AssetDefinition {
  shape: BlockShape;
  gridW: number;
  gridH: number;
}

export const NINE_SLICE_INSET = 20;
export const MAX_PREGENERATED_SIZE = 5;

export interface CanonicalDimensions {
  w: number;
  h: number;
  rotated: boolean;
}

export function canonicalizeDimensions(gridW: number, gridH: number): CanonicalDimensions {
  if (gridW < gridH) {
    return { w: gridH, h: gridW, rotated: true };
  }
  return { w: gridW, h: gridH, rotated: false };
}

export function isRotated(gridW: number, gridH: number): boolean {
  return gridW < gridH;
}

export function getCanonicalWidth(gridW: number, gridH: number): number {
  return gridW < gridH ? gridH : gridW;
}

export function getCanonicalHeight(gridW: number, gridH: number): number {
  return gridW < gridH ? gridW : gridH;
}

export function needsNineSlice(
  gridW: number,
  gridH: number,
  shape: BlockShape = "rectangle"
): boolean {
  if (shape === "triangle") {
    return getCanonicalWidth(gridW, gridH) > 2;
  }

  return getCanonicalWidth(gridW, gridH) > MAX_PREGENERATED_SIZE;
}

export function getOversizedSizesNeeded(): Array<{ gridW: number; gridH: number }> {
  return [
    { gridW: 6, gridH: 1 },
    { gridW: 7, gridH: 1 },
    { gridW: 9, gridH: 1 },
    { gridW: 11, gridH: 1 },
    { gridW: 13, gridH: 1 },
    { gridW: 15, gridH: 1 },
  ];
}

const RECTANGLE_ASSET_DEFS: AssetDefinition[] = [
  { shape: "rectangle", gridW: 2, gridH: 1 },
  { shape: "rectangle", gridW: 3, gridH: 1 },
  { shape: "rectangle", gridW: 4, gridH: 1 },
  { shape: "rectangle", gridW: 5, gridH: 1 },
  { shape: "rectangle", gridW: 2, gridH: 3 },
  { shape: "rectangle", gridW: 3, gridH: 2 },
];

const RECTANGLE_SIZE_KEYS = new Set(["2x1", "3x1", "4x1", "5x1", "2x3", "3x2"]);

const MATERIAL_ASSETS: Record<BlockMaterial, Record<string, AssetDefinition[]>> = {
  wood: {
    circle: [{ shape: "circle", gridW: 1, gridH: 1 }],
    triangle: [
      { shape: "triangle", gridW: 1, gridH: 1 },
      { shape: "triangle", gridW: 2, gridH: 1 },
    ],
    square: [
      { shape: "square", gridW: 1, gridH: 1 },
      { shape: "square", gridW: 2, gridH: 2 },
    ],
    rectangle: RECTANGLE_ASSET_DEFS,
  },
  stone: {
    circle: [{ shape: "circle", gridW: 1, gridH: 1 }],
    triangle: [
      { shape: "triangle", gridW: 1, gridH: 1 },
      { shape: "triangle", gridW: 2, gridH: 1 },
    ],
    square: [
      { shape: "square", gridW: 1, gridH: 1 },
      { shape: "square", gridW: 2, gridH: 2 },
    ],
    rectangle: RECTANGLE_ASSET_DEFS,
  },
  glass: {
    circle: [{ shape: "circle", gridW: 1, gridH: 1 }],
    triangle: [
      { shape: "triangle", gridW: 1, gridH: 1 },
      { shape: "triangle", gridW: 2, gridH: 1 },
    ],
    square: [
      { shape: "square", gridW: 1, gridH: 1 },
      { shape: "square", gridW: 2, gridH: 2 },
    ],
    rectangle: RECTANGLE_ASSET_DEFS,
  },
  metal: {
    circle: [{ shape: "circle", gridW: 1, gridH: 1 }],
    triangle: [
      { shape: "triangle", gridW: 1, gridH: 1 },
      { shape: "triangle", gridW: 2, gridH: 1 },
    ],
    square: [
      { shape: "square", gridW: 1, gridH: 1 },
      { shape: "square", gridW: 2, gridH: 2 },
    ],
    rectangle: RECTANGLE_ASSET_DEFS,
  },
  explosive: {
    circle: [{ shape: "circle", gridW: 1, gridH: 1 }],
    triangle: [
      { shape: "triangle", gridW: 1, gridH: 1 },
      { shape: "triangle", gridW: 2, gridH: 1 },
    ],
    square: [
      { shape: "square", gridW: 1, gridH: 1 },
      { shape: "square", gridW: 2, gridH: 2 },
    ],
    rectangle: RECTANGLE_ASSET_DEFS,
  },
};

const CONDITIONS = ["pristine", "dented", "cracked"] as const;

const TEXTURE_KEY_CACHE_SIZE = 256;
const TEXTURE_KEY_CACHE = new Map<string, string | null>();

function generateBlockTextureKey(
  material: BlockMaterial,
  shape: BlockShape,
  condition: "pristine" | "dented" | "cracked",
  gridW: number,
  gridH: number
): string {
  return `${material}_${shape}_${condition}_${gridW}x${gridH}`;
}

export const blockAssets: BlockAssetInfo[] = [];
const materialList: BlockMaterial[] = [
  BlockMaterial.WOOD,
  BlockMaterial.STONE,
  BlockMaterial.GLASS,
  BlockMaterial.METAL,
  BlockMaterial.EXPLOSIVE,
];

for (const material of materialList) {
  const shapes = MATERIAL_ASSETS[material];
  for (const shapeStr in shapes) {
    const shape = shapeStr as BlockShape;
    const gridSizes = shapes[shapeStr];
    for (const gridSize of gridSizes) {
      for (const condition of CONDITIONS) {
        blockAssets.push({
          textureKey: generateBlockTextureKey(
            material,
            shape,
            condition,
            gridSize.gridW,
            gridSize.gridH
          ),
          material,
          shape,
          condition,
          gridW: gridSize.gridW,
          gridH: gridSize.gridH,
        });
      }
    }
  }
}

export function getBlockTextureKey(
  material: BlockMaterial,
  shape: BlockShape,
  gridW: number,
  gridH: number,
  condition: "pristine" | "dented" | "cracked" = "pristine"
): string | null {
  const cacheKey = `${material}_${shape}_${gridW}x${gridH}_${condition}`;
  const cached = TEXTURE_KEY_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;

  let result: string;

  if (shape === "rectangle") {
    const sizeKey = `${gridW}x${gridH}`;

    if (RECTANGLE_SIZE_KEYS.has(sizeKey)) {
      result = generateBlockTextureKey(material, shape, condition, gridW, gridH);
    } else if (gridW < gridH && RECTANGLE_SIZE_KEYS.has(`${gridH}x${gridW}`)) {
      result = generateBlockTextureKey(material, shape, condition, gridH, gridW);
    } else {
      result = generateBlockTextureKey(
        material,
        shape,
        condition,
        getCanonicalWidth(gridW, gridH),
        getCanonicalHeight(gridW, gridH)
      );
    }
  } else {
    result = generateBlockTextureKey(material, shape, condition, gridW, gridH);
  }

  if (TEXTURE_KEY_CACHE.size >= TEXTURE_KEY_CACHE_SIZE) {
    const firstKey = TEXTURE_KEY_CACHE.keys().next().value;
    if (firstKey !== undefined) TEXTURE_KEY_CACHE.delete(firstKey);
  }
  TEXTURE_KEY_CACHE.set(cacheKey, result);

  return result;
}

export function getShapeForMaterial(
  material: BlockMaterial,
  gridW: number,
  gridH: number
): BlockShape | null {
  const shapes = MATERIAL_ASSETS[material];
  if (!shapes) return null;

  for (const shapeStr in shapes) {
    const shape = shapeStr as BlockShape;
    const gridSizes = shapes[shapeStr];
    for (const gs of gridSizes) {
      if (gs.gridW === gridW && gs.gridH === gridH) {
        return shape;
      }
    }
  }
  return null;
}

export function getAllBlockTextureKeys(): string[] {
  return blockAssets.map((a) => a.textureKey);
}

const GENERATED_TEXTURES = new Set<string>();
const MATERIALS = Object.values(BlockMaterial) as BlockMaterial[];

export function ensureOversizedTextureExists(scene: Phaser.Scene, textureKey: string): boolean {
  if (scene.textures.exists(textureKey)) return true;
  if (GENERATED_TEXTURES.has(textureKey)) return true;

  const parsed = parseTextureKey(textureKey);
  if (!parsed) return false;

  if (parsed.shape === "rectangle") {
    if (!needsNineSlice(parsed.gridW, parsed.gridH, parsed.shape)) return false;

    const canonicalW = getCanonicalWidth(parsed.gridW, parsed.gridH);
    const canonicalH = getCanonicalHeight(parsed.gridW, parsed.gridH);

    const sourceKey = `${parsed.material}_square_${parsed.condition}_1x1`;

    const success = createNineSliceTexture(scene, sourceKey, textureKey, canonicalW, canonicalH);

    if (success) GENERATED_TEXTURES.add(textureKey);
    return success;
  }

  if (parsed.shape === "triangle") {
    if (!needsNineSlice(parsed.gridW, parsed.gridH, parsed.shape)) return false;

    const canonicalW = getCanonicalWidth(parsed.gridW, parsed.gridH);
    const canonicalH = getCanonicalHeight(parsed.gridW, parsed.gridH);

    const sourceKey = `${parsed.material}_triangle_${parsed.condition}_2x1`;

    const success = createTriangleNineSliceTexture(
      scene,
      sourceKey,
      textureKey,
      canonicalW,
      canonicalH
    );

    if (success) GENERATED_TEXTURES.add(textureKey);
    return success;
  }

  return false;
}

function parseTextureKey(key: string): {
  material: BlockMaterial;
  shape: BlockShape;
  condition: "pristine" | "dented" | "cracked";
  gridW: number;
  gridH: number;
} | null {
  const match = key.match(/^(\w+)_(\w+)_(\w+)_(\d+)x(\d+)$/);
  if (!match) return null;

  const [, material, shape, condition, gridW, gridH] = match;
  if (!MATERIALS.includes(material as BlockMaterial)) return null;
  if (!["circle", "triangle", "square", "rectangle"].includes(shape)) return null;
  if (!["pristine", "dented", "cracked"].includes(condition)) return null;

  return {
    material: material as BlockMaterial,
    shape: shape as BlockShape,
    condition: condition as "pristine" | "dented" | "cracked",
    gridW: parseInt(gridW, 10),
    gridH: parseInt(gridH, 10),
  };
}

function createNineSliceTexture(
  scene: Phaser.Scene,
  sourceKey: string,
  targetKey: string,
  gridW: number,
  gridH: number
): boolean {
  const width = gridW * GRID_UNIT;
  const height = gridH * GRID_UNIT;
  const inset = NINE_SLICE_INSET;

  const atlasTexture = scene.textures.get(LEVEL_ATLAS_KEY);
  if (!atlasTexture) {
    console.warn(`Level atlas not found: ${LEVEL_ATLAS_KEY}`);
    return false;
  }

  const frame = atlasTexture.get(sourceKey);
  if (!frame) {
    console.warn(`Frame not found in ${LEVEL_ATLAS_KEY} atlas: ${sourceKey}`);
    return false;
  }

  const sourceImage = atlasTexture.getSourceImage() as HTMLImageElement;
  if (!sourceImage || !(sourceImage instanceof HTMLImageElement)) {
    console.warn(`Source image not usable for canvas drawing: ${LEVEL_ATLAS_KEY} atlas`);
    return false;
  }

  const srcX = frame.cutX;
  const srcY = frame.cutY;
  const srcW = frame.cutWidth;
  const srcH = frame.cutHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const srcLeft = inset;
  const srcRight = srcW - inset;
  const srcTop = inset;
  const srcBottom = srcH - inset;

  const dstLeft = inset;
  const dstRight = width - inset;
  const dstTop = inset;
  const dstBottom = height - inset;

  const centerSrcW = srcRight - srcLeft;
  const centerSrcH = srcBottom - srcTop;
  const centerDstW = dstRight - dstLeft;
  const centerDstH = dstBottom - dstTop;

  ctx.drawImage(sourceImage, srcX + 0, srcY + 0, inset, inset, 0, 0, inset, inset);
  ctx.drawImage(sourceImage, srcX + srcRight, srcY + 0, inset, inset, dstRight, 0, inset, inset);
  ctx.drawImage(sourceImage, srcX + 0, srcY + srcBottom, inset, inset, 0, dstBottom, inset, inset);
  ctx.drawImage(
    sourceImage,
    srcX + srcRight,
    srcY + srcBottom,
    inset,
    inset,
    dstRight,
    dstBottom,
    inset,
    inset
  );

  ctx.drawImage(
    sourceImage,
    srcX + srcLeft,
    srcY + 0,
    centerSrcW,
    inset,
    dstLeft,
    0,
    centerDstW,
    inset
  );
  ctx.drawImage(
    sourceImage,
    srcX + srcLeft,
    srcY + srcBottom,
    centerSrcW,
    inset,
    dstLeft,
    dstBottom,
    centerDstW,
    inset
  );
  ctx.drawImage(
    sourceImage,
    srcX + 0,
    srcY + srcTop,
    inset,
    centerSrcH,
    0,
    dstTop,
    inset,
    centerDstH
  );
  ctx.drawImage(
    sourceImage,
    srcX + srcRight,
    srcY + srcTop,
    inset,
    centerSrcH,
    dstRight,
    dstTop,
    inset,
    centerDstH
  );

  ctx.drawImage(
    sourceImage,
    srcX + srcLeft,
    srcY + srcTop,
    centerSrcW,
    centerSrcH,
    dstLeft,
    dstTop,
    centerDstW,
    centerDstH
  );

  scene.textures.addCanvas(targetKey, canvas);
  return true;
}

function createTriangleNineSliceTexture(
  scene: Phaser.Scene,
  sourceKey: string,
  targetKey: string,
  gridW: number,
  gridH: number
): boolean {
  const width = gridW * GRID_UNIT;
  const height = gridH * GRID_UNIT;
  const inset = NINE_SLICE_INSET;

  const atlasTexture = scene.textures.get(LEVEL_ATLAS_KEY);
  if (!atlasTexture) {
    console.warn(`Level atlas not found: ${LEVEL_ATLAS_KEY}`);
    return false;
  }

  const frame = atlasTexture.get(sourceKey);
  if (!frame) {
    console.warn(`Frame not found in ${LEVEL_ATLAS_KEY} atlas: ${sourceKey}`);
    return false;
  }

  const sourceImage = atlasTexture.getSourceImage() as HTMLImageElement;
  if (!sourceImage || !(sourceImage instanceof HTMLImageElement)) {
    console.warn(`Source image not usable for canvas drawing: ${LEVEL_ATLAS_KEY} atlas`);
    return false;
  }

  const srcX = frame.cutX;
  const srcY = frame.cutY;
  const srcW = frame.cutWidth;
  const srcH = frame.cutHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const srcLeft = inset;
  const srcRight = srcW - inset;
  const srcMiddle = srcRight - srcLeft;

  const dstLeft = inset;
  const dstRight = width - inset;
  const dstMiddle = dstRight - dstLeft;

  ctx.drawImage(sourceImage, srcX + 0, srcY + 0, srcLeft, srcH, 0, 0, dstLeft, height);

  ctx.drawImage(
    sourceImage,
    srcX + srcLeft,
    srcY + 0,
    srcMiddle,
    srcH,
    dstLeft,
    0,
    dstMiddle,
    height
  );

  ctx.drawImage(sourceImage, srcX + srcRight, srcY + 0, inset, srcH, dstRight, 0, inset, height);

  scene.textures.addCanvas(targetKey, canvas);
  return true;
}

/**
 * Clear the generated textures set. Should be called between level transitions
 * to prevent memory accumulation.
 */
export function clearGeneratedTextures(): void {
  GENERATED_TEXTURES.clear();
}

export { getMaterialHealth } from "./materials";
export { GameConfig } from "./GameConfig";
