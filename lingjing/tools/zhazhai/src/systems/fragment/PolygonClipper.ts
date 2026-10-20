import type { VoronoiCell } from "./VoronoiGenerator";
import type { Vector2 } from "../../types/Vector2";

interface SpatialGrid {
  cells: Map<number, number[]>;
  cellSize: number;
  cols: number;
}

export class PolygonClipper {
  private static readonly MIN_POLYGON_AREA = 4;

  static clipPolygonByBisector(polygon: Vector2[], p1: Vector2, p2: Vector2): Vector2[] {
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    const result: Vector2[] = [];

    for (let i = 0; i < polygon.length; i++) {
      const curr = polygon[i];
      const next = polygon[(i + 1) % polygon.length];

      const currSide = (curr.x - midX) * dx + (curr.y - midY) * dy;
      const nextSide = (next.x - midX) * dx + (next.y - midY) * dy;

      if (currSide <= 0) {
        result.push({ x: curr.x, y: curr.y });
      }

      if (currSide <= 0 !== nextSide <= 0) {
        const t = currSide / (currSide - nextSide);
        result.push({
          x: curr.x + t * (next.x - curr.x),
          y: curr.y + t * (next.y - curr.y),
        });
      }
    }

    return result;
  }

  static computeVoronoiCells(points: Vector2[], width: number, height: number): VoronoiCell[] {
    if (points.length <= 16) {
      return this.computeVoronoiCellsDirect(points, width, height);
    }
    return this.computeVoronoiCellsOptimized(points, width, height);
  }

  private static computeVoronoiCellsDirect(
    points: Vector2[],
    width: number,
    height: number
  ): VoronoiCell[] {
    const cells: VoronoiCell[] = [];

    for (let i = 0; i < points.length; i++) {
      let polygon: Vector2[] = [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ];

      for (let j = 0; j < points.length; j++) {
        if (i === j) continue;
        polygon = this.clipPolygonByBisector(polygon, points[i], points[j]);
        if (polygon.length < 3) break;
      }

      if (polygon.length >= 3 && this.calculatePolygonArea(polygon) >= this.MIN_POLYGON_AREA) {
        cells.push({ vertices: polygon });
      }
    }

    return cells;
  }

  private static computeVoronoiCellsOptimized(
    points: Vector2[],
    width: number,
    height: number
  ): VoronoiCell[] {
    const grid = this.buildSpatialGrid(points, width, height);
    const cells: VoronoiCell[] = [];

    for (let i = 0; i < points.length; i++) {
      let polygon: Vector2[] = [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ];

      const nearbyPoints = this.getNearbyPoints(points, i, grid, width, height);

      for (const j of nearbyPoints) {
        if (i === j) continue;
        polygon = this.clipPolygonByBisector(polygon, points[i], points[j]);
        if (polygon.length < 3) break;
      }

      if (polygon.length >= 3 && this.calculatePolygonArea(polygon) >= this.MIN_POLYGON_AREA) {
        cells.push({ vertices: polygon });
      }
    }

    return cells;
  }

  private static buildSpatialGrid(points: Vector2[], width: number, height: number): SpatialGrid {
    const cellSize = Math.max(width, height) / Math.ceil(Math.sqrt(points.length));
    const cols = Math.ceil(width / cellSize);
    const cells = new Map<number, number[]>();

    for (let i = 0; i < points.length; i++) {
      const col = Math.floor(points[i].x / cellSize);
      const row = Math.floor(points[i].y / cellSize);
      const key = row * cols + col;

      if (!cells.has(key)) {
        cells.set(key, []);
      }
      cells.get(key)!.push(i);
    }

    return { cells, cellSize, cols };
  }

  private static getNearbyPoints(
    points: Vector2[],
    pointIndex: number,
    grid: SpatialGrid,
    width: number,
    height: number
  ): number[] {
    const point = points[pointIndex];
    const col = Math.floor(point.x / grid.cellSize);
    const row = Math.floor(point.y / grid.cellSize);
    const nearbyIndices: number[] = [];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const checkCol = col + dc;
        const checkRow = row + dr;

        if (checkCol < 0 || checkRow < 0) continue;
        if (checkCol * grid.cellSize > width || checkRow * grid.cellSize > height) continue;

        const key = checkRow * grid.cols + checkCol;
        const cellPoints = grid.cells.get(key);
        if (cellPoints) {
          nearbyIndices.push(...cellPoints);
        }
      }
    }

    const maxDistance = grid.cellSize * 3;
    return nearbyIndices.filter((j) => {
      if (j === pointIndex) return true;
      const other = points[j];
      const dx = other.x - point.x;
      const dy = other.y - point.y;
      return dx * dx + dy * dy <= maxDistance * maxDistance;
    });
  }

  private static calculatePolygonArea(vertices: Vector2[]): number {
    if (vertices.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    return Math.abs(area) / 2;
  }
}
