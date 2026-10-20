import Phaser from "phaser";
import { CollisionCategory } from "../constants";
import { ThemeType, LEVEL_WIDTH, LEVEL_HEIGHT, GROUND_Y } from "../config/GameConfig";
import { GROUND_CONFIG } from "../config/PhysicsConfig";
import { BodyLabels } from "../constants/BodyLabels";
import type { IGroundManager } from "../interfaces/IGroundManager";

export interface GroundConfig {
  groundY: number;
  tileHeight: number;
}

const FLOOR_EXTENT_WIDTH =
  Math.ceil(LEVEL_WIDTH / GROUND_CONFIG.minZoom) +
  GROUND_CONFIG.floorRightPadding +
  GROUND_CONFIG.floorLeftPadding;

const DEFAULT_GROUND_CONFIG: GroundConfig = {
  groundY: GROUND_Y,
  tileHeight: 140,
};

export class GroundManager implements IGroundManager {
  private scene: Phaser.Scene;
  private config: GroundConfig;
  private groundTileSprite: Phaser.GameObjects.TileSprite | null = null;
  private physicsGround: MatterJS.BodyType | null = null;
  private theme: ThemeType = "forest";

  constructor(scene: Phaser.Scene, config: Partial<GroundConfig> = {}) {
    this.scene = scene;
    this.config = { ...DEFAULT_GROUND_CONFIG, ...config };
  }

  setTheme(theme: ThemeType): void {
    this.theme = theme;
    this.recreateGround();
  }

  getTheme(): ThemeType {
    return this.theme;
  }

  getGroundY(): number {
    return this.config.groundY;
  }

  create(): void {
    this.createPhysicsGround();
    this.createVisualGround();
  }

  private createPhysicsGround(): void {
    this.physicsGround = this.scene.matter.add.rectangle(
      LEVEL_WIDTH / 2,
      this.config.groundY + this.config.tileHeight / 2,
      LEVEL_WIDTH,
      this.config.tileHeight,
      {
        isStatic: true,
        friction: GROUND_CONFIG.friction,
        label: BodyLabels.GROUND,
        collisionFilter: {
          category: CollisionCategory.GROUND,
          mask:
            CollisionCategory.BIRD |
            CollisionCategory.PIG |
            CollisionCategory.BLOCK |
            CollisionCategory.DEBRIS,
        },
      }
    );

    this.scene.matter.world.setBounds(
      0,
      0,
      LEVEL_WIDTH,
      LEVEL_HEIGHT,
      GROUND_CONFIG.worldBoundsPadding,
      true,
      true,
      false,
      true
    );
  }

  private createVisualGround(): void {
    const texture = this.getGroundTexture();

    this.groundTileSprite = this.scene.add.tileSprite(
      -GROUND_CONFIG.floorLeftPadding + FLOOR_EXTENT_WIDTH / 2,
      this.config.groundY + this.config.tileHeight / 2,
      FLOOR_EXTENT_WIDTH,
      this.config.tileHeight,
      "level",
      texture
    );

    this.groundTileSprite.setOrigin(0.5, 0.5);
    this.groundTileSprite.setDepth(-5);
    this.groundTileSprite.setScrollFactor(1);
  }

  private getGroundTexture(): string {
    const textures: Record<ThemeType, string> = {
      forest: "grass",
      desert: "sand",
      castle: "grass-purple",
      ice: "snow",
      volcano: "snow",
      jungle: "grass-jungle",
    };
    return textures[this.theme];
  }

  update(cameraX: number): void {
    if (this.groundTileSprite) {
      this.groundTileSprite.tilePositionX = cameraX;
    }
  }

  private recreateGround(): void {
    if (this.groundTileSprite) {
      this.groundTileSprite.destroy();
      this.groundTileSprite = null;
    }

    if (this.physicsGround) {
      this.scene.matter.world.remove(this.physicsGround);
      this.physicsGround = null;
    }

    this.createPhysicsGround();
    this.createVisualGround();
  }

  destroy(): void {
    if (this.groundTileSprite) {
      this.groundTileSprite.destroy();
      this.groundTileSprite = null;
    }
    if (this.physicsGround && this.scene.matter?.world) {
      this.scene.matter.world.remove(this.physicsGround);
      this.physicsGround = null;
    }
  }
}
