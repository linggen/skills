export { MATERIAL_PHYSICS, getMaterialPhysics, getMaterialHealth } from "../PhysicsConfig";
export type { MaterialPhysicsConfig } from "../PhysicsConfig";

export interface MaterialProperties {
  density: number;
  restitution: number;
  friction: number;
}
