import Phaser from "phaser";
import type { ThemeColors } from "../config/ThemeColors";
import { PARALLAX_POSITION_CONFIG } from "../config/ParallaxConfig";

export class SkyGradientRenderer {
  private scene: Phaser.Scene;
  private skyGraphics: Phaser.GameObjects.Graphics | null = null;
  private readonly tileWidth: number;
  private readonly tileCenterX: number;
  private readonly skyStartY: number;

  constructor(
    scene: Phaser.Scene,
    tileWidth: number,
    tileCenterX: number,
    skyStartY: number = PARALLAX_POSITION_CONFIG.skyStartY
  ) {
    this.scene = scene;
    this.tileWidth = tileWidth;
    this.tileCenterX = tileCenterX;
    this.skyStartY = skyStartY;
  }

  create(colors: ThemeColors, tileHeight: number): void {
    this.skyGraphics = this.scene.add.graphics();
    this.skyGraphics.setPosition(this.tileCenterX, 0);
    this.skyGraphics.setDepth(PARALLAX_POSITION_CONFIG.skyDepth);
    this.skyGraphics.setScrollFactor(0);

    this.render(colors, tileHeight);
  }

  private render(colors: ThemeColors, tileHeight: number): void {
    if (!this.skyGraphics) return;

    this.skyGraphics.clear();

    const totalHeight = tileHeight + Math.abs(this.skyStartY) + 600;
    const gradientSteps = 200;
    const stepHeight = totalHeight / gradientSteps;

    for (let i = 0; i < gradientSteps; i++) {
      const t = i / gradientSteps;
      const color = this.interpolateSkyColor(colors, t);

      this.skyGraphics.fillStyle(color, 1);
      this.skyGraphics.fillRect(
        -this.tileWidth / 2,
        this.skyStartY + i * stepHeight,
        this.tileWidth,
        stepHeight + 1
      );
    }
  }

  private interpolateSkyColor(colors: ThemeColors, t: number): number {
    const top = Phaser.Display.Color.ValueToColor(colors.skyTop);
    const mid1 = Phaser.Display.Color.ValueToColor(colors.skyMid1);
    const mid2 = Phaser.Display.Color.ValueToColor(colors.skyMid2);
    const bottom = Phaser.Display.Color.ValueToColor(colors.skyBottom);

    let r: number, g: number, b: number;

    if (t < 0.25) {
      const mt = t / 0.25;
      r = Math.floor(Phaser.Math.Linear(top.red, mid1.red, mt));
      g = Math.floor(Phaser.Math.Linear(top.green, mid1.green, mt));
      b = Math.floor(Phaser.Math.Linear(top.blue, mid1.blue, mt));
    } else if (t < 0.5) {
      const mt = (t - 0.25) / 0.25;
      r = Math.floor(Phaser.Math.Linear(mid1.red, mid2.red, mt));
      g = Math.floor(Phaser.Math.Linear(mid1.green, mid2.green, mt));
      b = Math.floor(Phaser.Math.Linear(mid1.blue, mid2.blue, mt));
    } else if (t < 0.75) {
      const mt = (t - 0.5) / 0.25;
      r = Math.floor(Phaser.Math.Linear(mid2.red, bottom.red, mt * 0.7));
      g = Math.floor(Phaser.Math.Linear(mid2.green, bottom.green, mt * 0.7));
      b = Math.floor(Phaser.Math.Linear(mid2.blue, bottom.blue, mt * 0.7));
    } else {
      const mt = (t - 0.75) / 0.25;
      r = Math.floor(
        Phaser.Math.Linear(Phaser.Math.Linear(mid2.red, bottom.red, 0.7), bottom.red, mt)
      );
      g = Math.floor(
        Phaser.Math.Linear(Phaser.Math.Linear(mid2.green, bottom.green, 0.7), bottom.green, mt)
      );
      b = Math.floor(
        Phaser.Math.Linear(Phaser.Math.Linear(mid2.blue, bottom.blue, 0.7), bottom.blue, mt)
      );
    }

    return (r << 16) | (g << 8) | b;
  }

  destroy(): void {
    if (this.skyGraphics) {
      this.skyGraphics.destroy();
      this.skyGraphics = null;
    }
  }
}
