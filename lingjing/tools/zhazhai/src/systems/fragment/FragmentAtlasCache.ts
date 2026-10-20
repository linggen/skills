import Phaser from "phaser";
import type { FragmentShape } from "./VoronoiGenerator";
import { FragmentWorkerClient } from "../../workers/fragmentWorkerClient";
import { PerformanceManager } from "../PerformanceManager";
import { materialRegistry } from "../../config/registries/MaterialConfigRegistry";
import { LEVEL_ATLAS_KEY } from "../../config/assetManifest";
import type { BlockMaterial } from "../../constants/Materials";

interface FragmentAtlas {
  atlasKey: string;
  frameNames: string[];
  lastAccessed: number;
}

const MAX_ATLAS_CACHE_SIZE = 50;
const CANVAS_POOL_SIZE = 5;

interface PooledCanvas {
  canvas: HTMLCanvasElement;
  inUse: boolean;
}

export interface BlockPreWarmConfig {
  material: BlockMaterial;
  textureKey: string;
  width: number;
  height: number;
}

export class FragmentAtlasCache {
  private scene: Phaser.Scene;
  private atlases: Map<string, FragmentAtlas> = new Map();
  private workerClient: FragmentWorkerClient;
  private canvasPool: PooledCanvas[] = [];
  private canvasPoolWarmed: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.workerClient = FragmentWorkerClient.getInstance();
  }

  private warmCanvasPool(): void {
    if (this.canvasPoolWarmed) return;
    this.canvasPoolWarmed = true;

    for (let i = 0; i < CANVAS_POOL_SIZE; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      this.canvasPool.push({ canvas, inUse: false });
    }
  }

  private acquireCanvas(minWidth: number, minHeight: number): HTMLCanvasElement {
    this.warmCanvasPool();

    for (const pooled of this.canvasPool) {
      if (!pooled.inUse && pooled.canvas.width >= minWidth && pooled.canvas.height >= minHeight) {
        pooled.inUse = true;
        return pooled.canvas;
      }
    }

    for (const pooled of this.canvasPool) {
      if (!pooled.inUse) {
        pooled.inUse = true;
        pooled.canvas.width = Math.max(pooled.canvas.width, minWidth);
        pooled.canvas.height = Math.max(pooled.canvas.height, minHeight);
        return pooled.canvas;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = minWidth;
    canvas.height = minHeight;
    return canvas;
  }

  private releaseCanvas(canvas: HTMLCanvasElement): void {
    for (const pooled of this.canvasPool) {
      if (pooled.canvas === canvas) {
        pooled.inUse = false;
        return;
      }
    }
  }

  public async getOrCreateAsync(
    atlasKey: string,
    textureKey: string,
    fragments: FragmentShape[],
    width: number,
    height: number,
    material: string
  ): Promise<FragmentAtlas | null> {
    const cacheKey = `${material}_${textureKey}_${width}x${height}_${fragments.length}`;

    const cached = this.atlases.get(cacheKey);
    if (cached) {
      cached.lastAccessed = Date.now();
      return cached;
    }

    if (this.workerClient.supportsAtlasGeneration()) {
      let sourceTexture: Phaser.Textures.Texture;
      let frame: Phaser.Textures.Frame;
      let srcX: number;
      let srcY: number;
      let srcW: number;
      let srcH: number;
      let drawableSource: CanvasImageSource | undefined;

      if (this.scene.textures.exists(textureKey)) {
        // Standalone texture (e.g., 9-slice) - use directly
        // NOTE: Standalone textures take precedence over atlas frames with the same name.
        // This is intentional: 9-slice textures are generated for oversized blocks
        // and must be used instead of any similarly-named atlas frame.
        sourceTexture = this.scene.textures.get(textureKey)!;
        frame = sourceTexture.get()!;
        srcX = 0;
        srcY = 0;
        srcW = frame.cutWidth;
        srcH = frame.cutHeight;
        const sourceImage = sourceTexture.getSourceImage() as
          | CanvasImageSource
          | CanvasImageSource[]
          | undefined;
        drawableSource = Array.isArray(sourceImage) ? sourceImage[0] : sourceImage;
      } else {
        // Look in atlas
        sourceTexture = this.scene.textures.get(atlasKey);
        if (!sourceTexture) {
          return this.createAtlasFromFragments(
            atlasKey,
            textureKey,
            fragments,
            width,
            height,
            cacheKey
          );
        }

        const atlasFrame = sourceTexture.get(textureKey);
        if (!atlasFrame) {
          return this.createAtlasFromFragments(
            atlasKey,
            textureKey,
            fragments,
            width,
            height,
            cacheKey
          );
        }
        frame = atlasFrame;

        const sourceImage = sourceTexture.getSourceImage() as
          | CanvasImageSource
          | CanvasImageSource[]
          | undefined;
        drawableSource = Array.isArray(sourceImage) ? sourceImage[0] : sourceImage;

        if (!drawableSource) {
          return this.createAtlasFromFragments(
            atlasKey,
            textureKey,
            fragments,
            width,
            height,
            cacheKey
          );
        }

        srcX = frame.cutX;
        srcY = frame.cutY;
        srcW = frame.cutWidth;
        srcH = frame.cutHeight;
      }

      if (!drawableSource) {
        return this.createAtlasFromFragments(
          atlasKey,
          textureKey,
          fragments,
          width,
          height,
          cacheKey
        );
      }

      // Extract frame region from atlas to a temporary canvas
      // This ensures the worker only sees the frame pixels, not the whole atlas
      const frameCanvas = document.createElement("canvas");
      frameCanvas.width = srcW;
      frameCanvas.height = srcH;
      const frameCtx = frameCanvas.getContext("2d");
      if (!frameCtx) {
        return this.createAtlasFromFragments(
          atlasKey,
          textureKey,
          fragments,
          width,
          height,
          cacheKey
        );
      }
      frameCtx.drawImage(drawableSource, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

      const workerResult = await this.workerClient.generateAtlas(
        frameCanvas,
        fragments,
        width,
        height,
        material
      );

      if (workerResult) {
        return this.registerAtlasFromBitmap(
          workerResult.atlasBitmap,
          workerResult.frameData,
          workerResult.atlasWidth,
          workerResult.atlasHeight,
          cacheKey
        );
      }
    }

    return this.createAtlasFromFragments(atlasKey, textureKey, fragments, width, height, cacheKey);
  }

  private registerAtlasFromBitmap(
    atlasBitmap: ImageBitmap,
    frameData: {
      index: number;
      frameX: number;
      frameY: number;
      frameWidth: number;
      frameHeight: number;
    }[],
    _atlasWidth: number,
    _atlasHeight: number,
    cacheKey: string
  ): FragmentAtlas | null {
    const generatedAtlasKey = `fragment_atlas_${cacheKey}_${Date.now()}`;

    // Use addImage directly with ImageBitmap - avoids canvas creation entirely
    // ImageBitmap is already GPU-ready and can be uploaded directly to VRAM
    const atlasTexture = this.scene.textures.addImage(
      generatedAtlasKey,
      atlasBitmap as unknown as HTMLImageElement
    );

    if (!atlasTexture) {
      atlasBitmap.close();
      return null;
    }

    const frameNames: string[] = [];
    for (const frame of frameData) {
      atlasTexture.add(
        String(frame.index),
        0,
        frame.frameX,
        frame.frameY,
        frame.frameWidth,
        frame.frameHeight
      );
      frameNames.push(String(frame.index));
    }

    const atlas = { atlasKey: generatedAtlasKey, frameNames, lastAccessed: Date.now() };
    this.atlases.set(cacheKey, atlas);
    this.evictOldestIfNeeded();

    // Note: We don't close atlasBitmap here because Phaser's texture system
    // takes ownership of it. The texture will be cleaned up when removed.
    return atlas;
  }

  private async createAtlasFromFragments(
    atlasKey: string,
    textureKey: string,
    fragments: FragmentShape[],
    width: number,
    height: number,
    cacheKey: string
  ): Promise<FragmentAtlas | null> {
    let sourceTexture: Phaser.Textures.Texture;
    let frame: Phaser.Textures.Frame;
    let srcX: number;
    let srcY: number;
    let srcW: number;
    let srcH: number;
    let drawableSource: CanvasImageSource | undefined;

    if (this.scene.textures.exists(textureKey)) {
      sourceTexture = this.scene.textures.get(textureKey)!;
      frame = sourceTexture.get()!;
      srcX = 0;
      srcY = 0;
      srcW = frame.cutWidth;
      srcH = frame.cutHeight;
      const sourceImage = sourceTexture.getSourceImage() as
        | CanvasImageSource
        | CanvasImageSource[]
        | undefined;
      drawableSource = Array.isArray(sourceImage) ? sourceImage[0] : sourceImage;
    } else {
      sourceTexture = this.scene.textures.get(atlasKey);
      if (!sourceTexture) {
        console.warn(`Atlas "${atlasKey}" not found`);
        return null;
      }

      const atlasFrame = sourceTexture.get(textureKey);
      if (!atlasFrame) {
        console.warn(`Frame "${textureKey}" not found in atlas "${atlasKey}"`);
        return null;
      }
      frame = atlasFrame;

      const sourceImage = sourceTexture.getSourceImage() as
        | CanvasImageSource
        | CanvasImageSource[]
        | undefined;
      drawableSource = Array.isArray(sourceImage) ? sourceImage[0] : sourceImage;

      if (!drawableSource) return null;

      srcX = frame.cutX;
      srcY = frame.cutY;
      srcW = frame.cutWidth;
      srcH = frame.cutHeight;
    }

    if (!drawableSource) return null;

    const padding = 2;
    const maxFragmentWidth = Math.max(
      4,
      ...fragments.map((f) => Math.ceil(f.bounds.maxX - f.bounds.minX))
    );
    const maxFragmentHeight = Math.max(
      4,
      ...fragments.map((f) => Math.ceil(f.bounds.maxY - f.bounds.minY))
    );

    const cellWidth = maxFragmentWidth + padding * 2;
    const cellHeight = maxFragmentHeight + padding * 2;
    const columns = Math.max(1, Math.ceil(Math.sqrt(fragments.length)));
    const rows = Math.ceil(fragments.length / columns);

    const atlasWidth = columns * cellWidth;
    const atlasHeight = rows * cellHeight;
    const atlasCanvas = this.acquireCanvas(atlasWidth, atlasHeight);

    const ctx = atlasCanvas.getContext("2d");
    if (!ctx) {
      this.releaseCanvas(atlasCanvas);
      return null;
    }

    const frameNames: string[] = [];
    const frameData: {
      index: number;
      frameX: number;
      frameY: number;
      frameWidth: number;
      frameHeight: number;
    }[] = [];

    fragments.forEach((fragment, index) => {
      const bounds = fragment.bounds;
      const fragWidth = Math.max(4, Math.ceil(bounds.maxX - bounds.minX));
      const fragHeight = Math.max(4, Math.ceil(bounds.maxY - bounds.minY));
      const column = index % columns;
      const row = Math.floor(index / columns);
      const frameX = column * cellWidth + Math.floor((cellWidth - fragWidth) / 2);
      const frameY = row * cellHeight + Math.floor((cellHeight - fragHeight) / 2);

      ctx.save();
      ctx.beginPath();

      const shiftedVertices = fragment.vertices.map((vertex) => ({
        x: frameX + vertex.x - bounds.minX,
        y: frameY + vertex.y - bounds.minY,
      }));

      ctx.moveTo(shiftedVertices[0].x, shiftedVertices[0].y);
      for (let i = 1; i < shiftedVertices.length; i++) {
        ctx.lineTo(shiftedVertices[i].x, shiftedVertices[i].y);
      }
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(
        drawableSource,
        srcX,
        srcY,
        srcW,
        srcH,
        frameX - bounds.minX,
        frameY - bounds.minY,
        width,
        height
      );
      ctx.restore();

      frameNames.push(String(index));
      frameData.push({ index, frameX, frameY, frameWidth: fragWidth, frameHeight: fragHeight });
    });

    try {
      const atlasBitmap = await createImageBitmap(atlasCanvas);
      this.releaseCanvas(atlasCanvas);

      return this.registerAtlasFromBitmap(
        atlasBitmap,
        frameData,
        atlasWidth,
        atlasHeight,
        cacheKey
      );
    } catch (e) {
      console.warn("Failed to create ImageBitmap, falling back to addCanvas:", e);
      this.releaseCanvas(atlasCanvas);

      const generatedAtlasKey = `fragment_atlas_${cacheKey}_${Date.now()}`;
      const atlasTexture = this.scene.textures.addCanvas(generatedAtlasKey, atlasCanvas);
      if (!atlasTexture) return null;

      for (const fd of frameData) {
        atlasTexture.add(String(fd.index), 0, fd.frameX, fd.frameY, fd.frameWidth, fd.frameHeight);
      }

      const atlas = { atlasKey: generatedAtlasKey, frameNames, lastAccessed: Date.now() };
      this.atlases.set(cacheKey, atlas);
      this.evictOldestIfNeeded();

      return atlas;
    }
  }

  private evictOldestIfNeeded(): void {
    if (this.atlases.size <= MAX_ATLAS_CACHE_SIZE) return;

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, atlas] of this.atlases) {
      if (atlas.lastAccessed < oldestTime) {
        oldestTime = atlas.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const oldest = this.atlases.get(oldestKey);
      if (oldest && this.scene.textures.exists(oldest.atlasKey)) {
        this.scene.textures.remove(oldest.atlasKey);
      }
      this.atlases.delete(oldestKey);
    }
  }

  public getAtlas(cacheKey: string): FragmentAtlas | undefined {
    const atlas = this.atlases.get(cacheKey);
    if (atlas) {
      atlas.lastAccessed = Date.now();
    }

    return atlas;
  }

  public hasAtlas(
    textureKey: string,
    width: number,
    height: number,
    fragmentCount: number,
    material: string
  ): boolean {
    const cacheKey = `${material}_${textureKey}_${width}x${height}_${fragmentCount}`;
    return this.atlases.has(cacheKey);
  }

  /**
   * Pre-warm fragment atlases for the given block configurations.
   * This should be called during scene loading to avoid frame spikes during gameplay.
   */
  public async preWarmForLevel(configs: BlockPreWarmConfig[]): Promise<void> {
    if (!configs.length) return;

    const promises = configs.map(async (config) => {
      const fragmentConfig = materialRegistry.getFragment(config.material);
      if (!fragmentConfig) return;

      const baseCount = fragmentConfig.count;
      const fragmentCount = PerformanceManager.getScaledCount(this.scene, baseCount, 1);
      const relaxationIterations = fragmentConfig.voronoiRelaxation;

      // Check if already cached
      const cacheKey = `${config.material}_${config.textureKey}_${config.width}x${config.height}_${fragmentCount}`;
      if (this.atlases.has(cacheKey)) return;

      try {
        // Generate fragment shapes
        const fragments = await this.workerClient.getOrGenerate(
          config.width,
          config.height,
          config.material,
          fragmentCount,
          relaxationIterations
        );

        // Generate and cache the atlas
        await this.getOrCreateAsync(
          LEVEL_ATLAS_KEY,
          config.textureKey,
          fragments,
          config.width,
          config.height,
          config.material
        );
      } catch (e) {
        // Silently ignore pre-warm failures - atlases will be generated on-demand if needed
        console.debug(`FragmentAtlasCache: Pre-warm failed for ${cacheKey}`, e);
      }
    });

    await Promise.all(promises);
  }

  public destroy(): void {
    for (const atlas of this.atlases.values()) {
      if (this.scene.textures.exists(atlas.atlasKey)) {
        this.scene.textures.remove(atlas.atlasKey);
      }
    }

    this.atlases.clear();
  }
}
