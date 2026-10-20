/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  FragmentWorkerRequest,
  FragmentWorkerResponse,
  SerializedFragmentShape,
  AtlasFragmentData,
  AtlasGenerateRequest,
  AtlasGenerateResponse,
  AtlasFrameData,
  FragmentWorkerMessage,
} from "../types/workerMessages";

interface Vector2 {
  x: number;
  y: number;
}

interface VoronoiCell {
  vertices: Vector2[];
}

interface SpatialGrid {
  cells: Map<number, number[]>;
  cellSize: number;
  cols: number;
}

const HIGH_QUALITY_VERTEX_LIMIT = 6;
const LOW_QUALITY_VERTEX_LIMIT = 4;
const MIN_AREA_COVERAGE = 0.9;
const MIN_POLYGON_AREA = 4;

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePoints(count: number, width: number, height: number, margin: number): Vector2[] {
  const points: Vector2[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      x: randomBetween(margin, width - margin),
      y: randomBetween(margin, height - margin),
    });
  }
  return points;
}

function clipPolygonByBisector(polygon: Vector2[], p1: Vector2, p2: Vector2): Vector2[] {
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

function calculatePolygonArea(vertices: Vector2[]): number {
  if (vertices.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

function buildSpatialGrid(points: Vector2[], width: number, height: number): SpatialGrid {
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

function getNearbyPoints(
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

function computeVoronoiCells(points: Vector2[], width: number, height: number): VoronoiCell[] {
  if (points.length < 16) {
    return computeVoronoiCellsDirect(points, width, height);
  }
  return computeVoronoiCellsOptimized(points, width, height);
}

function computeVoronoiCellsDirect(
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
      polygon = clipPolygonByBisector(polygon, points[i], points[j]);
      if (polygon.length < 3) break;
    }

    if (polygon.length >= 3 && calculatePolygonArea(polygon) >= MIN_POLYGON_AREA) {
      cells.push({ vertices: polygon });
    }
  }

  return cells;
}

function computeVoronoiCellsOptimized(
  points: Vector2[],
  width: number,
  height: number
): VoronoiCell[] {
  const grid = buildSpatialGrid(points, width, height);
  const cells: VoronoiCell[] = [];

  for (let i = 0; i < points.length; i++) {
    let polygon: Vector2[] = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ];

    const nearbyPoints = getNearbyPoints(points, i, grid, width, height);

    for (const j of nearbyPoints) {
      if (i === j) continue;
      polygon = clipPolygonByBisector(polygon, points[i], points[j]);
      if (polygon.length < 3) break;
    }

    if (polygon.length >= 3 && calculatePolygonArea(polygon) >= MIN_POLYGON_AREA) {
      cells.push({ vertices: polygon });
    }
  }

  return cells;
}

function applyLloydRelaxation(
  points: Vector2[],
  width: number,
  height: number,
  iterations: number
): void {
  for (let iter = 0; iter < iterations; iter++) {
    const cells = computeVoronoiCells(points, width, height);
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
        points[i].x = points[i].x * 0.5 + cx * 0.5;
        points[i].y = points[i].y * 0.5 + cy * 0.5;
      }
    }
  }
}

function calculateBounds(vertices: Vector2[]): {
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

function sortVerticesByAngle(vertices: Vector2[], centroid: Vector2): Vector2[] {
  return [...vertices].sort((a, b) => {
    const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
    const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
    return angleB - angleA;
  });
}

function addVerticesToReachCoverage(
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

    const testVertices = sortVerticesByAngle([...result, candidate.vertex], centroid);
    const testArea = calculatePolygonArea(testVertices);

    if (testArea >= targetArea) {
      return testVertices;
    }

    result = testVertices;
  }

  return result;
}

function simplifyVertices(
  vertices: Vector2[],
  maxVertices: number,
  minAreaCoverage: number = 0.9,
  centroid?: Vector2
): Vector2[] {
  if (vertices.length <= maxVertices) {
    return [...vertices];
  }

  const originalArea = calculatePolygonArea(vertices);
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
  const sortedVertices = sortVerticesByAngle(selectedVertices, center);

  const simplifiedArea = calculatePolygonArea(sortedVertices);
  if (simplifiedArea >= originalArea * minAreaCoverage) {
    return sortedVertices;
  }

  return addVerticesToReachCoverage(
    vertices,
    sortedVertices,
    center,
    maxVertices,
    originalArea,
    minAreaCoverage
  );
}

function buildVertexString(vertices: Vector2[], center: { x: number; y: number }): string {
  return vertices
    .map((v) => `${(v.x - center.x).toFixed(2)} ${(v.y - center.y).toFixed(2)}`)
    .join(" ");
}

function generateFragments(
  width: number,
  height: number,
  count: number,
  relaxationIterations: number
): SerializedFragmentShape[] {
  const margin = Math.min(width, height) * 0.1;
  const points = generatePoints(count, width, height, margin);
  applyLloydRelaxation(points, width, height, relaxationIterations);
  const cells = computeVoronoiCells(points, width, height);

  return cells.map((cell) => {
    const vertices = cell.vertices;
    const centerX = vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length;
    const centerY = vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length;
    const bounds = calculateBounds(vertices);
    const area = calculatePolygonArea(vertices);

    const fragWidth = bounds.maxX - bounds.minX;
    const fragHeight = bounds.maxY - bounds.minY;
    const originX = fragWidth > 0 ? (centerX - bounds.minX) / fragWidth : 0.5;
    const originY = fragHeight > 0 ? (centerY - bounds.minY) / fragHeight : 0.5;

    const simplifiedVerticesHigh = simplifyVertices(
      vertices,
      HIGH_QUALITY_VERTEX_LIMIT,
      MIN_AREA_COVERAGE,
      {
        x: centerX,
        y: centerY,
      }
    );

    const simplifiedVerticesLow = simplifyVertices(
      vertices,
      LOW_QUALITY_VERTEX_LIMIT,
      MIN_AREA_COVERAGE,
      {
        x: centerX,
        y: centerY,
      }
    );

    const vertexStringHigh = buildVertexString(simplifiedVerticesHigh, { x: centerX, y: centerY });
    const vertexStringLow = buildVertexString(simplifiedVerticesLow, { x: centerX, y: centerY });

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

function generateAtlas(
  textureBitmap: ImageBitmap,
  fragments: AtlasFragmentData[],
  width: number,
  height: number
): {
  atlasBitmap: ImageBitmap;
  frameData: AtlasFrameData[];
  atlasWidth: number;
  atlasHeight: number;
} | null {
  if (typeof OffscreenCanvas === "undefined") {
    return null;
  }

  const padding = 2;
  let maxFragmentWidth = 4;
  for (let i = 0; i < fragments.length; i++) {
    const w = Math.ceil(fragments[i].bounds.maxX - fragments[i].bounds.minX);
    if (w > maxFragmentWidth) maxFragmentWidth = w;
  }
  let maxFragmentHeight = 4;
  for (let i = 0; i < fragments.length; i++) {
    const h = Math.ceil(fragments[i].bounds.maxY - fragments[i].bounds.minY);
    if (h > maxFragmentHeight) maxFragmentHeight = h;
  }

  const cellWidth = maxFragmentWidth + padding * 2;
  const cellHeight = maxFragmentHeight + padding * 2;
  const columns = Math.max(1, Math.ceil(Math.sqrt(fragments.length)));
  const rows = Math.ceil(fragments.length / columns);

  const atlasWidth = columns * cellWidth;
  const atlasHeight = rows * cellHeight;

  const atlasCanvas = new OffscreenCanvas(atlasWidth, atlasHeight);
  const ctx = atlasCanvas.getContext("2d");
  if (!ctx) return null;

  const frameData: AtlasFrameData[] = [];

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
    ctx.drawImage(textureBitmap, frameX - bounds.minX, frameY - bounds.minY, width, height);
    ctx.restore();

    frameData.push({
      index,
      frameX,
      frameY,
      frameWidth: fragWidth,
      frameHeight: fragHeight,
    });
  });

  const atlasBitmap = atlasCanvas.transferToImageBitmap();

  return { atlasBitmap, frameData, atlasWidth, atlasHeight };
}

function handleFragmentRequest(request: FragmentWorkerRequest): FragmentWorkerResponse {
  const { id, width, height, fragmentCount, relaxationIterations } = request;
  const fragments = generateFragments(width, height, fragmentCount, relaxationIterations);
  return { id, fragments };
}

function handleAtlasRequest(request: AtlasGenerateRequest): AtlasGenerateResponse | null {
  const { id, textureBitmap, fragments, width, height } = request;

  const result = generateAtlas(textureBitmap, fragments, width, height);
  if (!result) return null;

  textureBitmap.close();

  return {
    type: "atlas",
    id,
    atlasBitmap: result.atlasBitmap,
    frameData: result.frameData,
    atlasWidth: result.atlasWidth,
    atlasHeight: result.atlasHeight,
  };
}

const workerCtx: Worker = self as any;

workerCtx.onmessage = (event: MessageEvent<FragmentWorkerMessage>) => {
  const message = event.data;

  if ("type" in message && message.type === "generateAtlas") {
    const result = handleAtlasRequest(message as AtlasGenerateRequest);
    if (result) {
      (self as any).postMessage(result, [result.atlasBitmap]);
    } else {
      workerCtx.postMessage({
        type: "atlas",
        id: message.id,
        error: "OffscreenCanvas not available",
      });
    }
  } else {
    const request = message as FragmentWorkerRequest;
    const response = handleFragmentRequest(request);
    workerCtx.postMessage(response);
  }
};

export {};
