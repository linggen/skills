import Phaser from "phaser";
import { PolygonClipper } from "./PolygonClipper";
import type { Vector2 } from "../../types/Vector2";
import { FRAGMENT_BODY_CONFIG, VORONOI_GENERATOR_CONFIG } from "../../config/PhysicsConfig";
import { BlockMaterial } from "../../constants/Materials";
import { materialRegistry } from "../../config/registries/MaterialConfigRegistry";

export interface FragmentShape {
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

export interface VoronoiCell {
  vertices: Vector2[];
}

export class VoronoiGenerator {
  private static readonly HIGH_QUALITY_VERTEX_LIMIT = FRAGMENT_BODY_CONFIG.vertexLimits.high;
  private static readonly LOW_QUALITY_VERTEX_LIMIT = FRAGMENT_BODY_CONFIG.vertexLimits.low;
  private static readonly MIN_AREA_COVERAGE = FRAGMENT_BODY_CONFIG.minAreaCoverage;
  private static readonly MAX_CACHE_SIZE = VORONOI_GENERATOR_CONFIG.templateCacheMaxSize;

  private static readonly templateCache: Map<string, FragmentShape[]> = new Map();
  private static readonly preGeneratedKeys: Set<string> = new Set();

  static generatePoints(count: number, width: number, height: number, margin: number): Vector2[] {
    const points: Vector2[] = [];
    for (let i = 0; i < count; i++) {
      points.push({
        x: Phaser.Math.Between(margin, width - margin),
        y: Phaser.Math.Between(margin, height - margin),
      });
    }
    return points;
  }

  static applyLloydRelaxation(
    points: Vector2[],
    width: number,
    height: number,
    iterations: number = 3
  ): void {
    for (let iter = 0; iter < iterations; iter++) {
      const cells = PolygonClipper.computeVoronoiCells(points, width, height);
      for (let i = 0; i < points.length && i < cells.length; i++) {
        const cell = cells[i];
        if (cell.vertices.length >= 3) {
          let cx = 0;
          let cy = 0;

          cell.vertices.forEach((v) => {
            cx += v.x;
            cy += v.y;
          });
          cx /= cell.vertices.length;
          cy /= cell.vertices.length;
          points[i].x =
            points[i].x * (1 - VORONOI_GENERATOR_CONFIG.lloydRelaxationBlend) +
            cx * VORONOI_GENERATOR_CONFIG.lloydRelaxationBlend;
          points[i].y =
            points[i].y * (1 - VORONOI_GENERATOR_CONFIG.lloydRelaxationBlend) +
            cy * VORONOI_GENERATOR_CONFIG.lloydRelaxationBlend;
        }
      }
    }
  }

  static generateFragments(
    width: number,
    height: number,
    count: number,
    relaxationIterations: number = 2
  ): FragmentShape[] {
    const margin = Math.min(width, height) * VORONOI_GENERATOR_CONFIG.marginRatio;
    const points = this.generatePoints(count, width, height, margin);
    this.applyLloydRelaxation(points, width, height, relaxationIterations);
    const cells = PolygonClipper.computeVoronoiCells(points, width, height);

    return cells.map((cell) => {
      const vertices = cell.vertices;
      const centerX = vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length;
      const centerY = vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length;
      const bounds = VoronoiGenerator.calculateBounds(vertices);
      const area = VoronoiGenerator.calculatePolygonArea(vertices);

      const fragWidth = bounds.maxX - bounds.minX;
      const fragHeight = bounds.maxY - bounds.minY;
      const originX = fragWidth > 0 ? (centerX - bounds.minX) / fragWidth : 0.5;
      const originY = fragHeight > 0 ? (centerY - bounds.minY) / fragHeight : 0.5;

      const simplifiedVerticesHigh = VoronoiGenerator.simplifyVertices(
        vertices,
        this.HIGH_QUALITY_VERTEX_LIMIT,
        this.MIN_AREA_COVERAGE,
        { x: centerX, y: centerY }
      );

      const simplifiedVerticesLow = VoronoiGenerator.simplifyVertices(
        vertices,
        this.LOW_QUALITY_VERTEX_LIMIT,
        this.MIN_AREA_COVERAGE,
        { x: centerX, y: centerY }
      );

      const vertexStringHigh = VoronoiGenerator.buildVertexString(simplifiedVerticesHigh, {
        x: centerX,
        y: centerY,
      });
      const vertexStringLow = VoronoiGenerator.buildVertexString(simplifiedVerticesLow, {
        x: centerX,
        y: centerY,
      });

      return {
        vertices,
        centerX,
        centerY,
        bounds,
        area,
        originX,
        originY,
        simplifiedVerticesHigh,
        simplifiedVerticesLow,
        vertexStringHigh,
        vertexStringLow,
      };
    });
  }

  static buildVertexString(vertices: Vector2[], center: { x: number; y: number }): string {
    return vertices
      .map((v) => `${(v.x - center.x).toFixed(2)} ${(v.y - center.y).toFixed(2)}`)
      .join(" ");
  }

  static calculateBounds(vertices: Vector2[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    vertices.forEach((v) => {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    });
    return { minX, minY, maxX, maxY };
  }

  static calculatePolygonArea(vertices: Vector2[]): number {
    if (vertices.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    return Math.abs(area) / 2;
  }

  static simplifyVertices(
    vertices: Vector2[],
    maxVertices: number,
    minAreaCoverage: number = 0.9,
    centroid?: Vector2
  ): Vector2[] {
    if (vertices.length <= maxVertices) {
      return [...vertices];
    }

    const originalArea = VoronoiGenerator.calculatePolygonArea(vertices);
    if (originalArea < 1) {
      return [...vertices];
    }

    const center = centroid ?? {
      x: vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length,
      y: vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length,
    };

    const extremeIndices = new Set<number>();
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    let minXIdx = 0,
      maxXIdx = 0,
      minYIdx = 0,
      maxYIdx = 0;

    vertices.forEach((v, i) => {
      if (v.x < minX) {
        minX = v.x;
        minXIdx = i;
      }
      if (v.x > maxX) {
        maxX = v.x;
        maxXIdx = i;
      }
      if (v.y < minY) {
        minY = v.y;
        minYIdx = i;
      }
      if (v.y > maxY) {
        maxY = v.y;
        maxYIdx = i;
      }
    });

    extremeIndices.add(minXIdx);
    extremeIndices.add(maxXIdx);
    extremeIndices.add(minYIdx);
    extremeIndices.add(maxYIdx);

    const verticesWithDistance = vertices
      .map((v, i) => ({
        index: i,
        distance: Math.sqrt((v.x - center.x) ** 2 + (v.y - center.y) ** 2),
        angle: Math.atan2(v.y - center.y, v.x - center.x),
      }))
      .filter((item) => !extremeIndices.has(item.index))
      .sort((a, b) => b.distance - a.distance);

    const selectedIndices = new Set<number>(extremeIndices);
    const angleBins = 8;
    const binUsage: number[] = new Array(angleBins).fill(0);

    for (const item of verticesWithDistance) {
      if (selectedIndices.size >= maxVertices) break;

      const bin = Math.floor(((item.angle + Math.PI) / (2 * Math.PI)) * angleBins) % angleBins;
      if (binUsage[bin] < 2) {
        selectedIndices.add(item.index);
        binUsage[bin]++;
      }
    }

    for (const item of verticesWithDistance) {
      if (selectedIndices.size >= maxVertices) break;
      selectedIndices.add(item.index);
    }

    const selectedVertices = Array.from(selectedIndices).map((i) => vertices[i]);
    const sortedVertices = VoronoiGenerator.sortVerticesByAngle(selectedVertices, center);

    const simplifiedArea = VoronoiGenerator.calculatePolygonArea(sortedVertices);
    if (simplifiedArea >= originalArea * minAreaCoverage) {
      return sortedVertices;
    }

    return VoronoiGenerator.addVerticesToReachCoverage(
      vertices,
      sortedVertices,
      center,
      maxVertices,
      originalArea,
      minAreaCoverage
    );
  }

  private static sortVerticesByAngle(vertices: Vector2[], centroid: Vector2): Vector2[] {
    return [...vertices].sort((a, b) => {
      const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
      const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
      return angleB - angleA;
    });
  }

  private static addVerticesToReachCoverage(
    originalVertices: Vector2[],
    currentVertices: Vector2[],
    centroid: Vector2,
    maxVertices: number,
    originalArea: number,
    minAreaCoverage: number
  ): Vector2[] {
    const selected = new Set(currentVertices);
    const targetArea = originalArea * minAreaCoverage;

    const candidates = originalVertices
      .filter((v) => !selected.has(v))
      .map((v) => ({
        vertex: v,
        distance: Math.sqrt((v.x - centroid.x) ** 2 + (v.y - centroid.y) ** 2),
      }))
      .sort((a, b) => b.distance - a.distance);

    let result = [...currentVertices];

    for (const candidate of candidates) {
      if (result.length >= maxVertices) break;

      const testVertices = VoronoiGenerator.sortVerticesByAngle(
        [...result, candidate.vertex],
        centroid
      );
      const testArea = VoronoiGenerator.calculatePolygonArea(testVertices);

      if (testArea >= targetArea) {
        return testVertices;
      }

      result = testVertices;
    }

    return result;
  }

  static preGenerateTemplates(sizes: { width: number; height: number }[]): void {
    const materials = [
      BlockMaterial.GLASS,
      BlockMaterial.WOOD,
      BlockMaterial.STONE,
      BlockMaterial.METAL,
      BlockMaterial.EXPLOSIVE,
    ];

    for (const material of materials) {
      const fragmentConfig = materialRegistry.getFragment(material);
      if (!fragmentConfig) continue;

      const baseCount = fragmentConfig.count;
      const relaxationIterations = fragmentConfig.voronoiRelaxation ?? 2;

      for (const { width, height } of sizes) {
        const cacheKey = `${width}x${height}_${material}_${baseCount}_r${relaxationIterations}`;

        if (this.templateCache.has(cacheKey)) continue;

        const fragments = this.generateFragments(width, height, baseCount, relaxationIterations);
        this.templateCache.set(cacheKey, fragments);
        this.preGeneratedKeys.add(cacheKey);
      }
    }
  }

  static getTemplate(
    width: number,
    height: number,
    material: string,
    fragmentCount: number,
    relaxationIterations: number
  ): FragmentShape[] | undefined {
    const cacheKey = `${width}x${height}_${material}_${fragmentCount}_r${relaxationIterations}`;
    return this.templateCache.get(cacheKey);
  }

  static hasTemplate(
    width: number,
    height: number,
    material: string,
    fragmentCount: number,
    relaxationIterations: number
  ): boolean {
    const cacheKey = `${width}x${height}_${material}_${fragmentCount}_r${relaxationIterations}`;
    return this.templateCache.has(cacheKey);
  }

  static getOrGenerate(
    width: number,
    height: number,
    material: string,
    fragmentCount: number,
    relaxationIterations: number
  ): FragmentShape[] {
    const cacheKey = `${width}x${height}_${material}_${fragmentCount}_r${relaxationIterations}`;

    let fragments = this.templateCache.get(cacheKey);
    if (!fragments) {
      if (this.templateCache.size >= this.MAX_CACHE_SIZE) {
        const keysToDelete = Array.from(this.templateCache.keys()).slice(
          0,
          Math.floor(this.MAX_CACHE_SIZE / 2)
        );
        for (const key of keysToDelete) {
          this.templateCache.delete(key);
          this.preGeneratedKeys.delete(key);
        }
      }
      fragments = this.generateFragments(width, height, fragmentCount, relaxationIterations);
      this.templateCache.set(cacheKey, fragments);
    }

    return fragments;
  }

  static getPreGeneratedCount(): number {
    return this.preGeneratedKeys.size;
  }

  static clearCache(): void {
    this.templateCache.clear();
    this.preGeneratedKeys.clear();
  }
}
