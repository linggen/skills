import Matter from "matter-js";

export interface IWakeCascadeManager {
  requestWakeInRadius(x: number, y: number, radius: number): void;
  wakeInRadiusImmediate(x: number, y: number, radius: number): void;
  wakeBodyDirectly(body: Matter.Body): void;
  requestCascadeOnDestruction(x: number, y: number, blockWidth: number): void;
}
