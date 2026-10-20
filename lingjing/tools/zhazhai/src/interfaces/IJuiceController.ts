import { DestructionScale } from "../config/PhysicsConfig";
import type { Position } from "../types/Vector2";

export interface IJuiceController {
  applyDestructionJuice(scale: DestructionScale, position: Position): void;
  calculateScale(destructionCount: number): DestructionScale;
}
