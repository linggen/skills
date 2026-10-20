import type { Block } from "../../objects/Block";
import type { Pig } from "../../objects/Pig";
import type { IScoringSystem } from "../../systems/scoring/IScoringSystem";
import type { IVFXManager } from "../../interfaces/IVFXManager";
import type { ICameraEffects } from "../../interfaces/ICameraEffects";
import type { ISFXPlayer } from "../../interfaces/audio";
import type { IScorePopupManager } from "../../interfaces/IScorePopupManager";
import type { IExplosionSystem } from "../../systems/explosion/IExplosionSystem";
import type { ComboTracker } from "../../systems/ComboTracker";
import type { IJuiceController } from "../../interfaces/IJuiceController";
import type { GameHapticsManager } from "../../systems/mobile/GameHapticsManager";

export interface DestructionHandlerDeps {
  scoringSystem: IScoringSystem;
  vfxManager: IVFXManager;
  cameraEffects: ICameraEffects;
  sfx: ISFXPlayer;
  scorePopupManager: IScorePopupManager;
  explosionSystem: IExplosionSystem;
  comboTracker: ComboTracker;
  juiceController: IJuiceController;
  hapticsManager?: GameHapticsManager;
}

export class DestructionHandler {
  constructor(private deps: DestructionHandlerDeps) {}

  handlePigDestroyed(pig: Pig): void {
    const pos = pig.getPosition();
    const points = this.deps.scoringSystem.calculatePigPoints();

    this.deps.scoringSystem.addPigPoints();
    this.deps.comboTracker.onDestruction(pos.x, pos.y, points);
    this.deps.scorePopupManager.show(pos.x, pos.y, points);
    this.deps.sfx.playPigDestroy();
    this.deps.hapticsManager?.onBlockDestroyed?.("pig");
  }

  handleBlockDestroyed(
    block: Block,
    impactSpeed: number,
    impactAngle: number,
    _impactX?: number,
    _impactY?: number
  ): void {
    const pos = block.getPosition();
    const rotation = block.getRotation();

    if (block.isExplosive()) {
      this.deps.explosionSystem.triggerBlockExplosion(block);
    } else {
      this.deps.vfxManager.spawnSpriteFragments(
        pos.x,
        pos.y,
        block.getTextureKey(),
        block.getWidth(),
        block.getHeight(),
        block.material,
        impactSpeed,
        impactAngle,
        rotation
      );
    }

    this.deps.sfx.playDestroy(block.material);
    this.deps.cameraEffects.shakeFromImpact(impactSpeed, block.material);
    this.deps.cameraEffects.flashFromImpact(impactSpeed, block.material);
    this.deps.hapticsManager?.onBlockDestroyed?.(block.material);

    const points = this.deps.scoringSystem.calculateBlockPoints(block.material);

    this.deps.scoringSystem.addBlockPoints(block.material);
    this.deps.comboTracker.onDestruction(pos.x, pos.y, points);

    const destructionCount = this.deps.comboTracker.getCurrentCombo();
    const scale = this.deps.juiceController.calculateScale(destructionCount);
    this.deps.juiceController.applyDestructionJuice(scale, pos);

    this.deps.scorePopupManager.show(pos.x, pos.y, points);
  }

  handleBlockDamaged(
    block: Block,
    impactSpeed: number,
    impactAngle: number,
    impactX?: number,
    impactY?: number
  ): void {
    const blockPos = block.getPosition();
    const vfxX = impactX ?? blockPos.x;
    const vfxY = impactY ?? blockPos.y;
    this.deps.vfxManager.spawnImpactEffect(vfxX, vfxY, impactSpeed, block.material, impactAngle);
    this.deps.sfx.playImpact(block.material, impactSpeed);
    this.deps.cameraEffects.shakeFromImpact(impactSpeed, block.material);
  }
}
