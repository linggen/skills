import type { PhysicsSettleCallbacks } from "../systems/PhysicsSettleDetector";

export interface IPhysicsSettleDetector {
  startMonitoring(callbacks: PhysicsSettleCallbacks): void;
  stopMonitoring(): void;
  reset(): void;
  isActive(): boolean;
  getSettleFrameCount(): number;
}
