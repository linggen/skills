export type { MaterialVFXProfile } from "../../config/registries/MaterialConfigRegistry";
export { materialRegistry } from "../../config/registries/MaterialConfigRegistry";

export { ParticleEmitterService } from "./ParticleEmitterService";

export { ImpactEffects } from "./ImpactEffects";

export { ShockwaveEffects } from "./ShockwaveEffects";

export { ExplosionEffects } from "./ExplosionEffects";

export { PigDeathEffects } from "./PigDeathEffects";

export { AbilityVFXManager } from "./AbilityVFXManager";

import { materialRegistry } from "../../config/registries/MaterialConfigRegistry";
import type { BlockMaterial } from "../../constants/Materials";

export function getMaterialColor(material: BlockMaterial): number {
  return materialRegistry.getColor(material);
}
