import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from "../config/GameConfig";
import type { Position } from "../types/Vector2";

export interface SafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export type AnchorType =
  | "center"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight"
  | "topCenter"
  | "bottomCenter"
  | "leftCenter"
  | "rightCenter";

export class LayoutManager {
  static readonly VIEWPORT_WIDTH = VIEWPORT_WIDTH;
  static readonly VIEWPORT_HEIGHT = VIEWPORT_HEIGHT;
  static readonly CENTER_X = VIEWPORT_WIDTH / 2;
  static readonly CENTER_Y = VIEWPORT_HEIGHT / 2;
  static readonly GRID_SIZE = 16;

  static readonly SAFE_AREA: SafeArea = {
    top: 32,
    bottom: 32,
    left: 32,
    right: 32,
  };

  static getAnchorPosition(anchor: AnchorType, offsetX: number = 0, offsetY: number = 0): Position {
    const positions: Record<AnchorType, Position> = {
      center: { x: this.CENTER_X, y: this.CENTER_Y },
      topLeft: { x: this.SAFE_AREA.left, y: this.SAFE_AREA.top },
      topRight: { x: this.VIEWPORT_WIDTH - this.SAFE_AREA.right, y: this.SAFE_AREA.top },
      bottomLeft: { x: this.SAFE_AREA.left, y: this.VIEWPORT_HEIGHT - this.SAFE_AREA.bottom },
      bottomRight: {
        x: this.VIEWPORT_WIDTH - this.SAFE_AREA.right,
        y: this.VIEWPORT_HEIGHT - this.SAFE_AREA.bottom,
      },
      topCenter: { x: this.CENTER_X, y: this.SAFE_AREA.top },
      bottomCenter: { x: this.CENTER_X, y: this.VIEWPORT_HEIGHT - this.SAFE_AREA.bottom },
      leftCenter: { x: this.SAFE_AREA.left, y: this.CENTER_Y },
      rightCenter: { x: this.VIEWPORT_WIDTH - this.SAFE_AREA.right, y: this.CENTER_Y },
    };

    return {
      x: positions[anchor].x + offsetX,
      y: positions[anchor].y + offsetY,
    };
  }
}
