import Matter from "matter-js";
import { TRAJECTORY_SIMULATION_CONFIG } from "../config/TrajectoryConfig";

export interface TrajectoryPoint {
  x: number;
  y: number;
}

export interface BirdShapeConfig {
  shape: "circle" | "rectangle";
  radius: number;
  width?: number;
  height?: number;
  mass: number;
  frictionAir?: number;
  restitution?: number;
  friction?: number;
}

export interface TrajectoryConfig {
  totalSteps: number;
  framesPerDot: number;
  birdShape: BirdShapeConfig;
}

const DEFAULT_CONFIG: TrajectoryConfig = {
  totalSteps: TRAJECTORY_SIMULATION_CONFIG.totalSteps,
  framesPerDot: TRAJECTORY_SIMULATION_CONFIG.framesPerDot,
  birdShape: {
    shape: "circle",
    radius: TRAJECTORY_SIMULATION_CONFIG.defaultBird.radius,
    mass: TRAJECTORY_SIMULATION_CONFIG.defaultBird.mass,
    frictionAir: TRAJECTORY_SIMULATION_CONFIG.defaultBird.frictionAir,
  },
};

/**
 * TrajectorySimulator with cached Matter.js engine for performance.
 * Reuses the same engine across multiple trajectory simulations.
 */
export class TrajectorySimulator {
  private engine: Matter.Engine;
  private world: Matter.World;
  private tempBody: Matter.Body | null = null;
  private config: TrajectoryConfig;

  constructor(
    gravityConfig: { x: number; y: number; scale: number },
    config: Partial<TrajectoryConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.engine = Matter.Engine.create({
      gravity: { x: gravityConfig.x, y: gravityConfig.y, scale: gravityConfig.scale },
    });
    this.world = this.engine.world;
  }

  public simulate(
    startX: number,
    startY: number,
    velocityX: number,
    velocityY: number,
    birdShape?: BirdShapeConfig
  ): TrajectoryPoint[] {
    const shape = birdShape ?? this.config.birdShape;
    const frictionAir = shape.frictionAir ?? 0.0005;

    let area: number;
    let bodyOptions: Matter.IBodyDefinition;

    if (shape.shape === "circle") {
      area = Math.PI * shape.radius * shape.radius;

      bodyOptions = {
        frictionAir,
        restitution: shape.restitution,
        friction: shape.friction,
        isStatic: false,
      };
    } else {
      const width = shape.width ?? shape.radius * 2;
      const height = shape.height ?? shape.radius * 2;
      area = width * height;

      bodyOptions = {
        frictionAir,
        restitution: shape.restitution,
        friction: shape.friction,
        isStatic: false,
      };
    }

    const density = shape.mass / area;

    if (this.tempBody) {
      Matter.World.remove(this.world, this.tempBody);
    }

    if (shape.shape === "circle") {
      this.tempBody = Matter.Bodies.circle(startX, startY, shape.radius, {
        ...bodyOptions,
        density,
        label: "trajectory-sim",
      });
    } else {
      const width = shape.width ?? shape.radius * 2;
      const height = shape.height ?? shape.radius * 2;

      this.tempBody = Matter.Bodies.rectangle(startX, startY, width, height, {
        ...bodyOptions,
        density,
        label: "trajectory-sim",
      });
    }

    // Set initial velocity
    Matter.Body.setVelocity(this.tempBody, { x: velocityX, y: velocityY });
    Matter.World.add(this.world, this.tempBody);

    const points: TrajectoryPoint[] = [];
    const totalFrames = this.config.totalSteps * this.config.framesPerDot;
    const delta = TRAJECTORY_SIMULATION_CONFIG.frameMs;

    for (let i = 0; i < totalFrames; i++) {
      Matter.Engine.update(this.engine, delta);

      if ((i + 1) % this.config.framesPerDot === 0) {
        points.push({
          x: this.tempBody!.position.x,
          y: this.tempBody!.position.y,
        });
      }
    }

    // Remove body from world but keep engine cached
    Matter.World.remove(this.world, this.tempBody!);
    this.tempBody = null;

    return points;
  }

  public updateGravity(gravityConfig: { x: number; y: number; scale: number }): void {
    this.engine.gravity.x = gravityConfig.x;
    this.engine.gravity.y = gravityConfig.y;
    this.engine.gravity.scale = gravityConfig.scale;
  }

  public destroy(): void {
    if (this.tempBody) {
      Matter.World.remove(this.world, this.tempBody);
      this.tempBody = null;
    }

    Matter.World.clear(this.world, false);
    Matter.Engine.clear(this.engine);
  }
}
