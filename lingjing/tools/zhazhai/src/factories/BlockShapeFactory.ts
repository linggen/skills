import Phaser from "phaser";
import Matter from "matter-js";
import { BlockShape } from "../config/assetManifest";

export interface BlockBodyConfig {
  width: number;
  height: number;
  density: number;
  restitution: number;
  friction: number;
  label: string;
}

export interface IBlockShapeStrategy {
  applyBody(matterImage: Phaser.Physics.Matter.Image, config: BlockBodyConfig): void;
}

class CircleShapeStrategy implements IBlockShapeStrategy {
  applyBody(matterImage: Phaser.Physics.Matter.Image, config: BlockBodyConfig): void {
    const radius = Math.min(config.width, config.height) / 2;
    const existingBody = matterImage.body as Matter.Body | undefined;
    if (
      existingBody &&
      !existingBody.isStatic &&
      existingBody.circleRadius &&
      Math.abs(existingBody.circleRadius - radius) < 0.5
    ) {
      Matter.Body.setDensity(existingBody, config.density);
      existingBody.restitution = config.restitution;
      existingBody.friction = config.friction;
      existingBody.label = config.label;
      return;
    }
    matterImage.setCircle(radius, {
      density: config.density,
      restitution: config.restitution,
      friction: config.friction,
      label: config.label,
    });
  }
}

class TriangleShapeStrategy implements IBlockShapeStrategy {
  applyBody(matterImage: Phaser.Physics.Matter.Image, config: BlockBodyConfig): void {
    const { width, height } = config;

    const hw = width / 2;
    const hh = height / 2;
    const isRightAngled = width === height;
    let verts: { x: number; y: number }[];

    if (isRightAngled) {
      verts = [
        { x: -hw, y: -hh },
        { x: -hw, y: hh },
        { x: hw, y: hh },
      ];
    } else {
      verts = [
        { x: -hw, y: hh },
        { x: 0, y: -hh },
        { x: hw, y: hh },
      ];
    }

    matterImage.setBody(
      {
        type: "fromVertices",
        verts: verts,
      },
      {
        density: config.density,
        restitution: config.restitution,
        friction: config.friction,
        label: config.label,
      }
    );

    if (isRightAngled) {
      matterImage.setOrigin(0.35, 0.65);
    } else {
      matterImage.setOrigin(0.5, 0.65);
    }
  }
}

class RectangleShapeStrategy implements IBlockShapeStrategy {
  applyBody(matterImage: Phaser.Physics.Matter.Image, config: BlockBodyConfig): void {
    const existingBody = matterImage.body as Matter.Body | undefined;
    if (
      existingBody &&
      !existingBody.isStatic &&
      existingBody.vertices.length === 4 &&
      Math.abs(existingBody.area - config.width * config.height) < 1
    ) {
      Matter.Body.setDensity(existingBody, config.density);
      existingBody.restitution = config.restitution;
      existingBody.friction = config.friction;
      existingBody.label = config.label;
      return;
    }
    matterImage.setRectangle(config.width, config.height, {
      density: config.density,
      restitution: config.restitution,
      friction: config.friction,
      label: config.label,
    });
  }
}

export class BlockShapeFactory {
  private strategies: Map<BlockShape, IBlockShapeStrategy>;

  constructor() {
    this.strategies = new Map();
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.register("circle", new CircleShapeStrategy());
    this.register("triangle", new TriangleShapeStrategy());
    this.register("square", new RectangleShapeStrategy());
    this.register("rectangle", new RectangleShapeStrategy());
  }

  register(shape: BlockShape, strategy: IBlockShapeStrategy): void {
    this.strategies.set(shape, strategy);
  }

  applyBody(
    shape: BlockShape,
    matterImage: Phaser.Physics.Matter.Image,
    config: BlockBodyConfig
  ): void {
    const strategy = this.strategies.get(shape);
    if (!strategy) {
      this.strategies.get("rectangle")!.applyBody(matterImage, config);
      return;
    }

    strategy.applyBody(matterImage, config);
  }
}

export const blockShapeFactory = new BlockShapeFactory();
