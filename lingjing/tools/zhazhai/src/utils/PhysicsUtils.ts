import Matter from "matter-js";
import type Phaser from "phaser";
import { TimeScaleCompensator } from "./TimeScaleCompensator";

const _tempVelocity = { x: 0, y: 0 };

export function applyRadialImpulse(
  body: Matter.Body,
  originX: number,
  originY: number,
  radius: number,
  baseSpeed: number
): void {
  if (body.isStatic) return;

  const dx = body.position.x - originX;
  const dy = body.position.y - originY;
  const distSquared = dx * dx + dy * dy;
  const radiusSquared = radius * radius;

  if (distSquared >= radiusSquared) return;

  const distance = Math.sqrt(distSquared);

  if (body.isSleeping) {
    Matter.Sleeping.set(body, false);
  }

  const distanceRatio = distance / radius;
  const massFactor = 1 / (1 + body.mass * 0.02);
  let dirX: number;
  let dirY: number;

  if (distance <= 0) {
    const randomAngle = Math.random() * Math.PI * 2;
    dirX = Math.cos(randomAngle);
    dirY = Math.sin(randomAngle);
  } else {
    dirX = dx / distance;
    dirY = dy / distance;
  }

  const pushSpeed = baseSpeed * (1 - distanceRatio) * massFactor;
  _tempVelocity.x = body.velocity.x + dirX * pushSpeed;
  _tempVelocity.y = body.velocity.y + dirY * pushSpeed;
  Matter.Body.setVelocity(body, _tempVelocity);
}

export function getRelativeVelocity(
  bodyA: Matter.Body,
  bodyB: Matter.Body
): { x: number; y: number } {
  return {
    x: bodyA.velocity.x - bodyB.velocity.x,
    y: bodyA.velocity.y - bodyB.velocity.y,
  };
}

export function calculateImpactSpeed(
  bodyA: Matter.Body,
  bodyB: Matter.Body,
  scene?: Phaser.Scene
): number {
  const dx = bodyA.velocity.x - bodyB.velocity.x;
  const dy = bodyA.velocity.y - bodyB.velocity.y;
  const rawSpeed = Math.sqrt(dx * dx + dy * dy);

  if (scene) {
    return TimeScaleCompensator.compensateImpactSpeed(rawSpeed, scene);
  }
  return rawSpeed;
}
