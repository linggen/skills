import type { Pig } from "../../objects/Pig";
import type { Block } from "../../objects/Block";
import type { ICameraController } from "../../systems/camera/ICameraController";
import type { DestructionHandler } from "./DestructionHandler";

export interface CallbackHandlerDeps {
  destructionHandler: DestructionHandler;
  cameraController: ICameraController;
  birdLaunchOrchestrator: { hasActiveFlyingBird: () => boolean };
}

export class CallbackHandlers {
  public static handlePigDestroyed(deps: CallbackHandlerDeps, pig: Pig): void {
    deps.destructionHandler.handlePigDestroyed(pig);

    if (
      deps.birdLaunchOrchestrator.hasActiveFlyingBird() &&
      deps.cameraController.isInImpactFocus()
    ) {
      const pos = pig.getPosition();
      deps.cameraController.expandImpactFocus(pos.x, pos.y);
    }
  }

  public static handleBlockDestroyed(
    deps: CallbackHandlerDeps,
    block: Block,
    impactSpeed: number,
    impactAngle: number,
    impactX?: number,
    impactY?: number
  ): void {
    deps.destructionHandler.handleBlockDestroyed(block, impactSpeed, impactAngle, impactX, impactY);

    if (
      deps.birdLaunchOrchestrator.hasActiveFlyingBird() &&
      deps.cameraController.isInImpactFocus()
    ) {
      const pos = block.getPosition();
      deps.cameraController.expandImpactFocus(pos.x, pos.y);
    }
  }

  public static handleBlockDamaged(
    deps: CallbackHandlerDeps,
    block: Block,
    impactSpeed: number,
    impactAngle: number,
    impactX?: number,
    impactY?: number
  ): void {
    deps.destructionHandler.handleBlockDamaged(block, impactSpeed, impactAngle, impactX, impactY);
  }
}
