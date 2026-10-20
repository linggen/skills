import type { Vector2 } from "./Vector2";

export interface FragmentWorkerRequest {
  id: string;
  width: number;
  height: number;
  fragmentCount: number;
  relaxationIterations: number;
}

export interface FragmentWorkerResponse {
  id: string;
  fragments: SerializedFragmentShape[];
}

export interface SerializedFragmentShape {
  vertices: Vector2[];
  centerX: number;
  centerY: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  area: number;
  originX: number;
  originY: number;
  simplifiedVerticesHigh: Vector2[];
  simplifiedVerticesLow: Vector2[];
  vertexStringHigh: string;
  vertexStringLow: string;
}

export interface AtlasFrameData {
  index: number;
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
}

export interface AtlasFragmentData {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  vertices: { x: number; y: number }[];
}

export interface AtlasGenerateRequest {
  type: "generateAtlas";
  id: string;
  textureBitmap: ImageBitmap;
  fragments: AtlasFragmentData[];
  width: number;
  height: number;
  material: string;
}

export interface AtlasGenerateResponse {
  type: "atlas";
  id: string;
  atlasBitmap: ImageBitmap;
  frameData: AtlasFrameData[];
  atlasWidth: number;
  atlasHeight: number;
}

export type FragmentWorkerMessage = FragmentWorkerRequest | AtlasGenerateRequest;
export type FragmentWorkerResult = FragmentWorkerResponse | AtlasGenerateResponse;
