import Phaser from "phaser";
import Matter from "matter-js";
import { IAbilityHandler } from "./IAbilityHandler";
import type { GameEvents } from "../../events/EventBus";
import { CollisionCategory } from "../../constants";
import { calculateImpactSpeed } from "../../utils/PhysicsUtils";
import type { AbilityVFXManager } from "../vfx/AbilityVFXManager";
import type { ISFXPlayer } from "../../interfaces/audio";
import type { IEventEmitter } from "../../interfaces/IEventEmitter";
import { ABILITY_CONFIG } from "../../config/AbilityConfig";

export interface SplitHandlerDeps {
  vfxManager: AbilityVFXManager;
  sfx: ISFXPlayer;
  eventEmitter: IEventEmitter;
  getScene: () => Phaser.Scene;
}

interface TrackedMiniBird {
  body: Phaser.Physics.Matter.Image;
  boundCallback: (event: Phaser.Types.Physics.Matter.MatterCollisionData) => void;
}

export class SplitHandler implements IAbilityHandler<"birdSplit"> {
  readonly eventType = "birdSplit" as const;
  private trackedBirds: TrackedMiniBird[] = [];

  constructor(private deps: SplitHandlerDeps) {}

  handle(event: GameEvents["birdSplit"], scene: Phaser.Scene): Phaser.GameObjects.GameObject {
    const speed = Math.sqrt(event.velocity.x ** 2 + event.velocity.y ** 2);
    const baseAngle = Math.atan2(event.velocity.y, event.velocity.x);
    const angleRad = (event.angleOffset * Math.PI) / 180;

    this.deps.vfxManager.createSplitEffect(event.x, event.y);
    this.deps.sfx.playSplit();

    let centerBird: Phaser.Physics.Matter.Image | null = null;

    for (let i = -1; i <= 1; i++) {
      const splitAngle = baseAngle + i * angleRad;

      const miniBird = scene.add.image(event.x, event.y, "level", "alienBlue_round");
      miniBird.setScale(ABILITY_CONFIG.split.miniBirdScale);

      const miniBody = scene.matter.add.gameObject(miniBird, {
        shape: { type: "circle", radius: ABILITY_CONFIG.split.miniBirdRadius },
        density: ABILITY_CONFIG.split.physics.density,
        restitution: ABILITY_CONFIG.split.physics.restitution,
        friction: ABILITY_CONFIG.split.physics.friction,
        frictionAir: ABILITY_CONFIG.split.physics.frictionAir,
        label: event.originalBird?.type ? `bird-${event.originalBird.type}` : "bird-split",
      }) as Phaser.Physics.Matter.Image;

      miniBody.setVelocity(Math.cos(splitAngle) * speed, Math.sin(splitAngle) * speed);
      miniBody.setCollisionCategory(CollisionCategory.BIRD);

      const boundCallback = (collisionEvent: Phaser.Types.Physics.Matter.MatterCollisionData) => {
        const bodyA = collisionEvent.bodyA as Matter.Body;
        const bodyB = collisionEvent.bodyB as Matter.Body;
        const ownBody = miniBody.body as Matter.Body | undefined;
        const birdBody = ownBody === bodyA ? bodyA : ownBody === bodyB ? bodyB : bodyA;
        const otherBody = birdBody === bodyA ? bodyB : bodyA;
        const impactSpeed = calculateImpactSpeed(birdBody, otherBody, scene);

        if (event.originalBird) {
          this.deps.eventEmitter.emit("birdCollision", {
            bird: event.originalBird,
            impactSpeed,
            target: otherBody.label,
            x: birdBody.position.x,
            y: birdBody.position.y,
          });
        }
      };

      miniBody.setOnCollide(boundCallback);
      this.trackedBirds.push({ body: miniBody, boundCallback });

      if (i === 0) {
        centerBird = miniBody;
      }
    }

    if (centerBird) {
      this.deps.eventEmitter.emit("splitCameraHandoff", {
        target: centerBird,
        velocity: event.velocity,
      });
    }

    if (event.originalBird) {
      const matterImage = event.originalBird.getMatterImage();
      if (matterImage) {
        matterImage.setVisible(false);
        matterImage.setActive(false);
        const body = matterImage.body as Matter.Body;
        if (body) {
          body.collisionFilter.category = 0;
          body.collisionFilter.mask = 0;
        }
      }
      event.originalBird.destroy();
    }

    return centerBird!;
  }

  cleanup(): void {
    for (const tracked of this.trackedBirds) {
      if (tracked.body?.body) {
        tracked.body.setOnCollide(() => {});
        tracked.body.destroy();
      }
    }
    this.trackedBirds = [];
  }
}
