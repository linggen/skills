import type {
  FragmentWorkerRequest,
  FragmentWorkerResponse,
  SerializedFragmentShape,
  AtlasGenerateResponse,
  AtlasFrameData,
} from "../types/workerMessages";
import type { FragmentShape } from "../systems/fragment/VoronoiGenerator";
import { VoronoiGenerator } from "../systems/fragment/VoronoiGenerator";

interface PendingRequest {
  resolve: (fragments: FragmentShape[]) => void;
  reject: (error: Error) => void;
}

interface PendingAtlasRequest {
  resolve: (
    result: {
      atlasBitmap: ImageBitmap;
      frameData: AtlasFrameData[];
      atlasWidth: number;
      atlasHeight: number;
    } | null
  ) => void;
  reject: (error: Error) => void;
}

const ID_DELIMITER = "::";
const MAX_CACHE_SIZE = 300;

export class FragmentWorkerClient {
  private static instance: FragmentWorkerClient | null = null;
  private worker: Worker | null = null;
  private pendingRequests: Map<string, PendingRequest[]> = new Map();
  private pendingAtlasRequests: Map<string, PendingAtlasRequest> = new Map();
  private templateCache: Map<string, FragmentShape[]> = new Map();
  private requestCounter: number = 0;
  private useWorker: boolean;
  private supportsOffscreenCanvas: boolean;

  private constructor() {
    this.useWorker = typeof Worker !== "undefined";
    this.supportsOffscreenCanvas = typeof OffscreenCanvas !== "undefined";

    if (this.useWorker) {
      try {
        this.worker = new Worker(new URL("./fragment-worker.min.mjs", import.meta.url), {
          type: "module",
        });
        this.worker.onmessage = this.handleWorkerMessage.bind(this);
        this.worker.onerror = this.handleWorkerError.bind(this);
      } catch {
        console.warn("FragmentWorkerClient: Failed to create worker, falling back to main thread");
        this.useWorker = false;
        this.worker = null;
      }
    }
  }

  static getInstance(): FragmentWorkerClient {
    if (!FragmentWorkerClient.instance) {
      FragmentWorkerClient.instance = new FragmentWorkerClient();
    }
    return FragmentWorkerClient.instance;
  }

  private handleWorkerMessage(
    event: MessageEvent<FragmentWorkerResponse | AtlasGenerateResponse>
  ): void {
    const data = event.data;

    if ("type" in data && data.type === "atlas") {
      this.handleAtlasResponse(data as AtlasGenerateResponse);
    } else {
      this.handleFragmentResponse(data as FragmentWorkerResponse);
    }
  }

  private handleFragmentResponse(response: FragmentWorkerResponse): void {
    const { id, fragments } = response;

    const delimiterIndex = id.lastIndexOf(ID_DELIMITER);
    const cacheKey = delimiterIndex >= 0 ? id.substring(0, delimiterIndex) : id;
    const pendingArray = this.pendingRequests.get(cacheKey);

    if (pendingArray) {
      this.pendingRequests.delete(cacheKey);
      const convertedFragments = this.convertToFragments(fragments);
      for (const pending of pendingArray) {
        pending.resolve(convertedFragments);
      }
    }
  }

  private handleAtlasResponse(response: AtlasGenerateResponse): void {
    const { id, atlasBitmap, frameData, atlasWidth, atlasHeight } = response;
    const pending = this.pendingAtlasRequests.get(id);

    if (pending) {
      this.pendingAtlasRequests.delete(id);
      if (atlasBitmap) {
        pending.resolve({ atlasBitmap, frameData, atlasWidth, atlasHeight });
      } else {
        pending.resolve(null);
      }
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    console.error("FragmentWorkerClient: Worker error", error);

    for (const [cacheKey, pendingArray] of this.pendingRequests) {
      this.pendingRequests.delete(cacheKey);
      for (const pending of pendingArray) {
        pending.reject(new Error(`Worker error: ${error.message}`));
      }
    }

    for (const [id, pending] of this.pendingAtlasRequests) {
      this.pendingAtlasRequests.delete(id);
      pending.reject(new Error(`Worker error: ${error.message}`));
    }
  }

  private convertToFragments(serialized: SerializedFragmentShape[]): FragmentShape[] {
    return serialized.map((f) => ({
      vertices: f.vertices,
      centerX: f.centerX,
      centerY: f.centerY,
      bounds: f.bounds,
      area: f.area,
      originX: f.originX,
      originY: f.originY,
      simplifiedVerticesHigh: f.simplifiedVerticesHigh,
      simplifiedVerticesLow: f.simplifiedVerticesLow,
      vertexStringHigh: f.vertexStringHigh,
      vertexStringLow: f.vertexStringLow,
    }));
  }

  private generateCacheKey(
    width: number,
    height: number,
    material: string,
    fragmentCount: number,
    relaxationIterations: number
  ): string {
    return `${width}x${height}_${material}_${fragmentCount}_r${relaxationIterations}`;
  }

  async getOrGenerate(
    width: number,
    height: number,
    material: string,
    fragmentCount: number,
    relaxationIterations: number
  ): Promise<FragmentShape[]> {
    const cacheKey = this.generateCacheKey(
      width,
      height,
      material,
      fragmentCount,
      relaxationIterations
    );

    const cached = this.templateCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (this.pendingRequests.has(cacheKey)) {
      return new Promise((resolve, reject) => {
        this.pendingRequests.get(cacheKey)!.push({ resolve, reject });
      });
    }

    let fragments: FragmentShape[];

    if (this.useWorker && this.worker) {
      fragments = await this.requestFromWorker(
        cacheKey,
        width,
        height,
        fragmentCount,
        relaxationIterations
      );
    } else {
      fragments = await new Promise<FragmentShape[]>((resolve) => {
        const run = () => {
          resolve(
            VoronoiGenerator.generateFragments(width, height, fragmentCount, relaxationIterations)
          );
        };
        if (typeof requestIdleCallback !== "undefined") {
          requestIdleCallback(run, { timeout: 16 });
        } else {
          setTimeout(run, 0);
        }
      });
    }

    if (this.templateCache.size >= MAX_CACHE_SIZE) {
      const keysToDelete = Array.from(this.templateCache.keys()).slice(
        0,
        Math.floor(MAX_CACHE_SIZE / 2)
      );
      for (const key of keysToDelete) {
        this.templateCache.delete(key);
      }
    }

    this.templateCache.set(cacheKey, fragments);
    return fragments;
  }

  async generateAtlas(
    textureSource: CanvasImageSource,
    fragments: FragmentShape[],
    width: number,
    height: number,
    material: string
  ): Promise<{
    atlasBitmap: ImageBitmap;
    frameData: AtlasFrameData[];
    atlasWidth: number;
    atlasHeight: number;
  } | null> {
    if (!this.useWorker || !this.worker || !this.supportsOffscreenCanvas) {
      return null;
    }

    let textureBitmap: ImageBitmap;
    try {
      textureBitmap = await createImageBitmap(textureSource);
    } catch (e) {
      console.warn("FragmentWorkerClient: Failed to create ImageBitmap from texture", e);
      return null;
    }

    const id = `atlas_${material}_${width}x${height}_${++this.requestCounter}`;

    return new Promise((resolve, reject) => {
      this.pendingAtlasRequests.set(id, { resolve, reject });

      const request = {
        type: "generateAtlas" as const,
        id,
        textureBitmap,
        fragments: fragments.map((f) => ({ bounds: f.bounds, vertices: f.vertices })),
        width,
        height,
        material,
      };

      this.worker!.postMessage(request, [textureBitmap]);
    });
  }

  private requestFromWorker(
    cacheKey: string,
    width: number,
    height: number,
    fragmentCount: number,
    relaxationIterations: number
  ): Promise<FragmentShape[]> {
    return new Promise((resolve, reject) => {
      const id = `${cacheKey}${ID_DELIMITER}${++this.requestCounter}`;

      this.pendingRequests.set(cacheKey, [{ resolve, reject }]);

      const request: FragmentWorkerRequest = {
        id,
        width,
        height,
        fragmentCount,
        relaxationIterations,
      };

      this.worker!.postMessage(request);
    });
  }

  getCacheSize(): number {
    return this.templateCache.size;
  }

  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  isUsingWorker(): boolean {
    return this.useWorker;
  }

  supportsAtlasGeneration(): boolean {
    return this.useWorker && this.supportsOffscreenCanvas;
  }

  clearCache(): void {
    this.templateCache.clear();
    VoronoiGenerator.clearCache();
  }

  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
    this.pendingAtlasRequests.clear();
    this.templateCache.clear();
    VoronoiGenerator.clearCache();
    FragmentWorkerClient.instance = null;
  }
}
