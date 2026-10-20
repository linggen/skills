import { BlockMaterial } from "../../constants/Materials";
import { materialRegistry } from "../../config/registries/MaterialConfigRegistry";
import { ParticleEmitterService } from "./ParticleEmitterService";
import { IMPACT_VFX_CONFIG } from "../../config/VFXConfig";

export class ImpactEffects {
  constructor(private particleEmitter: ParticleEmitterService) {}

  spawnImpactEffect(
    x: number,
    y: number,
    impactSpeed: number,
    material: BlockMaterial,
    impactAngle: number = Math.PI / 2
  ): void {
    const profile = materialRegistry.getVFX(material);
    if (!profile) return;

    const intensity = Math.min(impactSpeed / IMPACT_VFX_CONFIG.impactSpeedNormalization, 1);

    const emitAngle = impactAngle + Math.PI;

    const blendedAngle =
      emitAngle * (1 - profile.downwardBias * 0.5) + (Math.PI / 2) * (profile.downwardBias * 0.5);

    const count = Math.floor(
      IMPACT_VFX_CONFIG.particleCountBase + IMPACT_VFX_CONFIG.particleCountMultiplier * intensity
    );

    this.particleEmitter.emitMaterialParticles(
      material,
      x,
      y,
      blendedAngle,
      profile.spreadCone * IMPACT_VFX_CONFIG.spreadConeMultiplier,
      count
    );
  }
}
