import { IJuiceController } from "../interfaces/IJuiceController";
import { ICameraEffects } from "../interfaces/ICameraEffects";
import { DESTRUCTION_JUICE_CONFIG, DestructionScale } from "../config/PhysicsConfig";
import { MISC_TIMING_CONFIG } from "../config/TimingConfig";
import type { Position } from "../types/Vector2";

export interface JuiceControllerDeps {
  cameraEffects: ICameraEffects;
}

export class JuiceController implements IJuiceController {
  private deps: JuiceControllerDeps;

  constructor(deps: JuiceControllerDeps) {
    this.deps = deps;
  }

  calculateScale(destructionCount: number): DestructionScale {
    return DESTRUCTION_JUICE_CONFIG.getScale(destructionCount);
  }

  applyDestructionJuice(scale: DestructionScale, _position: Position): void {
    const config = DESTRUCTION_JUICE_CONFIG.scales[scale];

    if (config.shake > 0) {
      this.deps.cameraEffects.shake(config.shake, MISC_TIMING_CONFIG.juiceShakeDurationMs);
    }

    if (config.hitPause > 0) {
      this.deps.cameraEffects.hitPause(config.hitPause);
    }

    if (config.slowMo) {
      this.deps.cameraEffects.slowMotion(config.slowMo.duration, config.slowMo.scale);
    }
  }
}
