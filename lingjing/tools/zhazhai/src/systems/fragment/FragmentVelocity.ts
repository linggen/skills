import Phaser from "phaser";
import type { FragmentShape } from "./VoronoiGenerator";
import type { MaterialFragmentConfig } from "../../config/registries/MaterialConfigRegistry";
import { FRAGMENT_VELOCITY_CONFIG } from "../../config/PhysicsConfig";

export interface FragmentVelocityData {
  vx: number;
  vy: number;
  angularVelocity: number;
}

export class FragmentVelocity {
  static calculate(
    config: MaterialFragmentConfig | undefined,
    impactSpeed: number,
    impactAngle: number,
    fragment: FragmentShape,
    width: number = 100
  ): FragmentVelocityData {
    const blend = config?.blendFactor ?? 0.5;
    const angularVel = config?.angularVelocity ?? 0.5;
    const downAngle = Math.PI / 2;
    const speed = impactSpeed;
    const halfWidth = width / 2;

    const baseAngle = impactAngle * blend + downAngle * (1 - blend);
    const spreadAngle =
      baseAngle +
      ((fragment.centerX - halfWidth) / halfWidth) *
        FRAGMENT_VELOCITY_CONFIG.spreadAngleMultiplier +
      (Math.random() - 0.5) * FRAGMENT_VELOCITY_CONFIG.randomSpread;

    return {
      vx: Math.cos(spreadAngle) * speed * FRAGMENT_VELOCITY_CONFIG.horizontalMultiplier,
      vy:
        Math.sin(spreadAngle) * speed * FRAGMENT_VELOCITY_CONFIG.verticalMultiplier +
        FRAGMENT_VELOCITY_CONFIG.verticalBoost,
      angularVelocity: Phaser.Math.FloatBetween(-angularVel, angularVel),
    };
  }

  static apply(
    body: Phaser.Physics.Matter.Image,
    config: MaterialFragmentConfig | undefined,
    impactSpeed: number,
    impactAngle: number,
    fragment: FragmentShape
  ): void {
    const data = this.calculate(config, impactSpeed, impactAngle, fragment);
    body.setVelocity(data.vx, data.vy);
    body.setAngularVelocity(data.angularVelocity);
  }

  static applyFromData(body: Phaser.Physics.Matter.Image, data: FragmentVelocityData): void {
    body.setVelocity(data.vx, data.vy);
    body.setAngularVelocity(data.angularVelocity);
  }
}
