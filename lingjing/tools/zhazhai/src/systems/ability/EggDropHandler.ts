import Phaser from "phaser";
import { IAbilityHandler } from "./IAbilityHandler";
import type { GameEvents } from "../../events/EventBus";
import { CollisionCategory } from "../../constants";
import Matter from "matter-js";
import { calculateImpactSpeed } from "../../utils/PhysicsUtils";
import type { AbilityVFXManager } from "../vfx/AbilityVFXManager";
import type { ISFXPlayer } from "../../interfaces/audio";
import type { IEventEmitter } from "../../interfaces/IEventEmitter";
import { ABILITY_CONFIG } from "../../config/AbilityConfig";

export interface EggDropHandlerDeps {
  vfxManager: AbilityVFXManager;
  sfx: ISFXPlayer;
  eventEmitter: IEventEmitter;
}

interface TrackedEgg {
  body: Phaser.Physics.Matter.Image;
  boundCallback: (event: Phaser.Types.Physics.Matter.MatterCollisionData) => void;
}

export class EggDropHandler implements IAbilityHandler<"eggDrop"> {
  readonly eventType = "eggDrop" as const;
  private trackedEggs: TrackedEgg[] = [];

  constructor(private deps: EggDropHandlerDeps) {}

  handle(event: GameEvents["eggDrop"], scene: Phaser.Scene): Phaser.GameObjects.GameObject {
    this.deps.vfxManager.createEggDropEffect(event.x, event.y);
    this.deps.sfx.playEggDrop();

    const egg = scene.add.image(event.x, event.y, "level", "alienPink_square");

    const eggBody = scene.matter.add.gameObject(egg, {
      shape: {
        type: "rectangle",
        width: ABILITY_CONFIG.eggDrop.eggSize.width,
        height: ABILITY_CONFIG.eggDrop.eggSize.height,
      },
      density: ABILITY_CONFIG.eggDrop.physics.density,
      restitution: ABILITY_CONFIG.eggDrop.physics.restitution,
      friction: ABILITY_CONFIG.eggDrop.physics.friction,
    }) as Phaser.Physics.Matter.Image;

    eggBody.setVelocity(0, ABILITY_CONFIG.eggDrop.initialVelocityY);
    eggBody.setCollisionCategory(CollisionCategory.BIRD);

    const boundCallback = (collisionEvent: Phaser.Types.Physics.Matter.MatterCollisionData) => {
      const bodyA = collisionEvent.bodyA as Matter.Body;
      const bodyB = collisionEvent.bodyB as Matter.Body;
      const ownBody = eggBody.body as Matter.Body | undefined;
      const birdBody = ownBody === bodyA ? bodyA : ownBody === bodyB ? bodyB : bodyA;
      const otherBody = birdBody === bodyA ? bodyB : bodyA;
      const impactSpeed = calculateImpactSpeed(birdBody, otherBody, scene);

      this.deps.eventEmitter.emit("birdCollision", {
        bird: event.bird,
        impactSpeed,
        target: otherBody.label,
        x: birdBody.position.x,
        y: birdBody.position.y,
      });
    };

    eggBody.setOnCollide(boundCallback);
    this.trackedEggs.push({ body: eggBody, boundCallback });

    scene.time.delayedCall(ABILITY_CONFIG.eggDrop.boostDelayMs, () => {
      if (eggBody.active) {
        eggBody.setVelocity(0, ABILITY_CONFIG.eggDrop.boostVelocityY);
      }
    });

    return eggBody;
  }

  cleanup(): void {
    for (const tracked of this.trackedEggs) {
      if (tracked.body?.body) {
        tracked.body.setOnCollide(() => {});
        tracked.body.destroy();
      }
    }
    this.trackedEggs = [];
  }
}
