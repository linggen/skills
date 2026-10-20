import Phaser from "phaser";
import Matter from "matter-js";
import type { Bird } from "../../Bird";
import type { IBirdState } from "./IBirdState";
import { BIRD_PHYSICS } from "../../../config/PhysicsConfig";
import { getFastBodyCollisionDetector } from "../../../utils/FastBodyCollisionDetector";

export class FlyingBirdState implements IBirdState {
  readonly name = "FLYING";
  private abilityUsed = false;
  private landedCheckEvent: Phaser.Time.TimerEvent | null = null;

  enter(bird: Bird): void {
    this.abilityUsed = false;
    this.startLandedCheck(bird);
  }

  exit(_bird: Bird): void {
    this.abilityUsed = false;
    this.stopLandedCheck();
  }

  update(bird: Bird, _delta: number): void {
    this.updateFlightRotation(bird);
    this.checkForTunneling(bird);
  }

  handleCollision(_bird: Bird, _event: Phaser.Types.Physics.Matter.MatterCollisionData): void {}

  canActivateAbility(bird: Bird): boolean {
    if (this.abilityUsed) return false;
    const config = BIRD_PHYSICS[bird.type];
    return config.hasAbility;
  }

  isLaunched(): boolean {
    return true;
  }

  private updateFlightRotation(bird: Bird): void {
    const body = bird.getMatterImage()?.body;
    if (!body) return;

    const velocity = body.velocity;
    const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);

    if (speed > 1) {
      const angle = Math.atan2(velocity.y, velocity.x);
      bird.setFlightRotation(angle);
    }
  }

  private checkForTunneling(bird: Bird): void {
    const detector = getFastBodyCollisionDetector();
    if (!detector) return;

    const matterImage = bird.getMatterImage();
    const body = matterImage?.body as Matter.Body | undefined;
    if (!body) return;

    const velocity = body.velocity;
    if (!detector.shouldCheckForTunneling(bird.id, velocity)) {
      return;
    }

    const collision = detector.checkForTunneling(body, velocity);
    if (collision) {
      this.handleTunnelingCollision(bird, collision, velocity);
    }
  }

  private handleTunnelingCollision(
    bird: Bird,
    collision: { body: Matter.Body; position: Matter.Vector; normal: Matter.Vector },
    velocity: Matter.Vector
  ): void {
    const matterImage = bird.getMatterImage();
    if (!matterImage?.body) return;

    const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
    const impactSpeed = speed * 0.8;

    bird.callbacks.onCollision?.(bird, impactSpeed);

    const bounceVelocity = {
      x: collision.normal.x * speed * 0.5,
      y: collision.normal.y * speed * 0.5,
    };

    matterImage.setPosition(
      collision.position.x - collision.normal.x * 5,
      collision.position.y - collision.normal.y * 5
    );
    matterImage.setVelocity(bounceVelocity.x, bounceVelocity.y);

    const detector = getFastBodyCollisionDetector();
    if (detector) {
      detector.unregisterBird(bird.id);
    }
  }

  private startLandedCheck(bird: Bird): void {
    const scene = bird.scene;
    this.landedCheckEvent = scene.time.addEvent({
      delay: 100,
      callback: () => this.checkLanded(bird),
      callbackScope: this,
      loop: true,
    });
  }

  private stopLandedCheck(): void {
    if (this.landedCheckEvent) {
      this.landedCheckEvent.remove();
      this.landedCheckEvent = null;
    }
  }

  private checkLanded(bird: Bird): void {
    const body = bird.getMatterImage()?.body as Matter.Body | undefined;
    if (!body) return;

    if (body.isSleeping) {
      bird.transitionToState("LANDED");
      return;
    }

    const velocity = body.velocity;
    const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);

    if (speed < 0.5) {
      bird.transitionToState("LANDED");
    }
  }

  markAbilityUsed(): void {
    this.abilityUsed = true;
  }
}
