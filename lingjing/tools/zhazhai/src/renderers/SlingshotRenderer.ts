import Phaser from "phaser";
import { ISlingshotRenderer, BandRenderData, SlingshotRendererDeps } from "./ISlingshotRenderer";
import {
  SlingshotBandConfig,
  SlingshotPouchConfig,
  SlingshotAnchorConfig,
} from "../config/SlingshotRenderConfig";

export class SlingshotRenderer implements ISlingshotRenderer {
  private scene: Phaser.Scene;

  private leftBand: Phaser.GameObjects.Graphics;
  private rightBand: Phaser.GameObjects.Graphics;
  private frontPouch: Phaser.GameObjects.Graphics;
  private pouchShadow: Phaser.GameObjects.Graphics;

  constructor(deps: SlingshotRendererDeps) {
    this.scene = deps.scene;

    this.rightBand = this.scene.add.graphics();
    this.rightBand.setDepth(SlingshotBandConfig.depth.rightBand);

    this.pouchShadow = this.scene.add.graphics();
    this.pouchShadow.setDepth(SlingshotBandConfig.depth.pouchShadow);

    this.frontPouch = this.scene.add.graphics();
    this.frontPouch.setDepth(SlingshotBandConfig.depth.frontPouch);

    this.leftBand = this.scene.add.graphics();
    this.leftBand.setDepth(SlingshotBandConfig.depth.leftBand);
  }

  drawBands(data: BandRenderData): void {
    this.leftBand.clear();
    this.rightBand.clear();
    this.frontPouch.clear();
    this.pouchShadow.clear();

    const { leftPoints, rightPoints, pouchPos, powerRatio, anchorLeft, anchorRight } = data;

    let tensionColor: { r: number; g: number; b: number };
    if (powerRatio >= SlingshotBandConfig.powerTransition.threshold) {
      const maxBlend =
        (powerRatio - SlingshotBandConfig.powerTransition.threshold) /
        (1 - SlingshotBandConfig.powerTransition.threshold);
      tensionColor = this.interpolateColor(
        SlingshotBandConfig.colors.stretched,
        SlingshotBandConfig.colors.maxPower,
        maxBlend
      );
    } else {
      tensionColor = this.interpolateColor(
        SlingshotBandConfig.colors.relaxed,
        SlingshotBandConfig.colors.stretched,
        powerRatio
      );
    }
    const bandColor = Phaser.Display.Color.GetColor(tensionColor.r, tensionColor.g, tensionColor.b);

    const thickness =
      SlingshotBandConfig.thickness.base + powerRatio * SlingshotBandConfig.thickness.tensionBonus;

    this.drawBandFromVerletPoints(this.rightBand, rightPoints, thickness, bandColor, 0.9);

    this.drawBandFromVerletPoints(this.leftBand, leftPoints, thickness, bandColor, 0.95);

    this.drawFrontPouch(pouchPos, thickness, anchorLeft, anchorRight);

    this.drawAnchorCaps(anchorLeft, anchorRight);
  }

  private drawBandFromVerletPoints(
    graphics: Phaser.GameObjects.Graphics,
    points: Phaser.Math.Vector2[],
    thickness: number,
    color: number,
    alpha: number
  ): void {
    if (points.length < 2) return;

    const strands = SlingshotBandConfig.strands.count;
    const strandSpacing = thickness / (strands + 1);

    const first = points[0];
    const last = points[points.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len;
    const ny = dx / len;

    for (let s = 0; s < strands; s++) {
      const offset = (s - (strands - 1) / 2) * strandSpacing * 0.7;

      let strandColor = color;
      if (s === 0) {
        strandColor = Phaser.Display.Color.GetColor(
          Math.min(255, ((color >> 16) & 0xff) + SlingshotBandConfig.strands.highlightOffset),
          Math.min(255, ((color >> 8) & 0xff) + SlingshotBandConfig.strands.shadowOffset),
          Math.max(0, (color & 0xff) - 5)
        );
      } else if (s === strands - 1) {
        strandColor = Phaser.Display.Color.GetColor(
          Math.max(0, ((color >> 16) & 0xff) - SlingshotBandConfig.strands.shadowOffset),
          Math.max(0, ((color >> 8) & 0xff) - 15),
          Math.max(0, (color & 0xff) - 10)
        );
      }

      graphics.lineStyle(
        thickness / strands + 1,
        strandColor,
        alpha * (s === 0 ? 1 : SlingshotBandConfig.strands.alphaMultiplier)
      );
      graphics.beginPath();

      graphics.moveTo(points[0].x + nx * offset, points[0].y + ny * offset);

      for (let i = 1; i < points.length; i++) {
        const currOffsetX = points[i].x + nx * offset;
        const currOffsetY = points[i].y + ny * offset;
        graphics.lineTo(currOffsetX, currOffsetY);
      }

      graphics.strokePath();
    }

    const highlightAlpha = alpha * SlingshotBandConfig.highlight.alphaFactor;
    graphics.lineStyle(
      SlingshotBandConfig.highlight.lineWidth,
      SlingshotBandConfig.highlight.color,
      highlightAlpha
    );
    graphics.beginPath();
    graphics.moveTo(
      points[0].x + SlingshotBandConfig.highlight.offsetX,
      points[0].y + SlingshotBandConfig.highlight.offsetY
    );

    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(
        points[i].x + SlingshotBandConfig.highlight.offsetX,
        points[i].y + SlingshotBandConfig.highlight.offsetY
      );
    }
    graphics.strokePath();
  }

  private drawFrontPouch(
    birdPos: Phaser.Math.Vector2,
    thickness: number,
    anchorLeft: Phaser.Math.Vector2,
    anchorRight: Phaser.Math.Vector2
  ): void {
    const leftDirX = birdPos.x - anchorLeft.x;
    const leftDirY = birdPos.y - anchorLeft.y;
    const leftLen = Math.sqrt(leftDirX * leftDirX + leftDirY * leftDirY);

    const rightDirX = birdPos.x - anchorRight.x;
    const rightDirY = birdPos.y - anchorRight.y;
    const rightLen = Math.sqrt(rightDirX * rightDirX + rightDirY * rightDirY);

    const ringRadius = thickness * SlingshotPouchConfig.ringRadiusMultiplier;

    const leatherColor = Phaser.Display.Color.GetColor(
      SlingshotPouchConfig.leather.color.r,
      SlingshotPouchConfig.leather.color.g,
      SlingshotPouchConfig.leather.color.b
    );
    this.frontPouch.fillStyle(leatherColor, SlingshotPouchConfig.leather.alpha);
    this.frontPouch.fillCircle(
      birdPos.x,
      birdPos.y,
      ringRadius * SlingshotPouchConfig.leather.outerRadiusMultiplier
    );

    this.frontPouch.fillStyle(SlingshotPouchConfig.inner.color, SlingshotPouchConfig.inner.alpha);
    this.frontPouch.fillCircle(
      birdPos.x,
      birdPos.y,
      ringRadius * SlingshotPouchConfig.inner.radiusMultiplier
    );

    const grommetRadius = ringRadius * SlingshotPouchConfig.grommet.radiusMultiplier;

    const leftGrommetX =
      birdPos.x -
      (leftDirX / leftLen) * ringRadius * SlingshotPouchConfig.grommet.positionMultiplier;
    const leftGrommetY =
      birdPos.y -
      (leftDirY / leftLen) * ringRadius * SlingshotPouchConfig.grommet.positionMultiplier;

    const rightGrommetX =
      birdPos.x -
      (rightDirX / rightLen) * ringRadius * SlingshotPouchConfig.grommet.positionMultiplier;
    const rightGrommetY =
      birdPos.y -
      (rightDirY / rightLen) * ringRadius * SlingshotPouchConfig.grommet.positionMultiplier;

    this.frontPouch.lineStyle(
      SlingshotPouchConfig.grommet.stroke.lineWidth,
      SlingshotPouchConfig.grommet.stroke.color,
      SlingshotPouchConfig.grommet.stroke.alpha
    );
    this.frontPouch.strokeCircle(leftGrommetX, leftGrommetY, grommetRadius);
    this.frontPouch.fillStyle(
      SlingshotPouchConfig.grommet.fill.color,
      SlingshotPouchConfig.grommet.fill.alpha
    );
    this.frontPouch.fillCircle(
      leftGrommetX,
      leftGrommetY,
      grommetRadius * SlingshotPouchConfig.grommet.fill.innerRadiusMultiplier
    );
    this.frontPouch.fillStyle(
      SlingshotPouchConfig.grommet.highlight.color,
      SlingshotPouchConfig.grommet.highlight.alpha
    );
    this.frontPouch.fillCircle(
      leftGrommetX - grommetRadius * SlingshotPouchConfig.grommet.highlight.offsetXMultiplier,
      leftGrommetY - grommetRadius * SlingshotPouchConfig.grommet.highlight.offsetYMultiplier,
      grommetRadius * SlingshotPouchConfig.grommet.highlight.radiusMultiplier
    );

    this.frontPouch.lineStyle(
      SlingshotPouchConfig.grommet.stroke.lineWidth,
      SlingshotPouchConfig.grommet.stroke.color,
      SlingshotPouchConfig.grommet.stroke.alpha
    );
    this.frontPouch.strokeCircle(rightGrommetX, rightGrommetY, grommetRadius);
    this.frontPouch.fillStyle(
      SlingshotPouchConfig.grommet.fill.color,
      SlingshotPouchConfig.grommet.fill.alpha
    );
    this.frontPouch.fillCircle(
      rightGrommetX,
      rightGrommetY,
      grommetRadius * SlingshotPouchConfig.grommet.fill.innerRadiusMultiplier
    );
    this.frontPouch.fillStyle(
      SlingshotPouchConfig.grommet.highlight.color,
      SlingshotPouchConfig.grommet.highlight.alpha
    );
    this.frontPouch.fillCircle(
      rightGrommetX - grommetRadius * SlingshotPouchConfig.grommet.highlight.offsetXMultiplier,
      rightGrommetY - grommetRadius * SlingshotPouchConfig.grommet.highlight.offsetYMultiplier,
      grommetRadius * SlingshotPouchConfig.grommet.highlight.radiusMultiplier
    );
  }

  private drawAnchorCaps(anchorLeft: Phaser.Math.Vector2, anchorRight: Phaser.Math.Vector2): void {
    this.leftBand.fillStyle(SlingshotAnchorConfig.fill.color, SlingshotAnchorConfig.fill.alpha);
    this.leftBand.fillCircle(anchorLeft.x, anchorLeft.y, SlingshotAnchorConfig.radius);
    this.leftBand.fillStyle(
      SlingshotAnchorConfig.highlight.color,
      SlingshotAnchorConfig.highlight.alpha
    );
    this.leftBand.fillCircle(
      anchorLeft.x + SlingshotAnchorConfig.highlight.offsetX,
      anchorLeft.y + SlingshotAnchorConfig.highlight.offsetY,
      SlingshotAnchorConfig.highlight.radius
    );

    this.rightBand.fillStyle(SlingshotAnchorConfig.fill.color, SlingshotAnchorConfig.fill.alpha);
    this.rightBand.fillCircle(anchorRight.x, anchorRight.y, SlingshotAnchorConfig.radius);
    this.rightBand.fillStyle(
      SlingshotAnchorConfig.highlight.color,
      SlingshotAnchorConfig.highlight.alpha
    );
    this.rightBand.fillCircle(
      anchorRight.x + SlingshotAnchorConfig.highlight.offsetX,
      anchorRight.y + SlingshotAnchorConfig.highlight.offsetY,
      SlingshotAnchorConfig.highlight.radius
    );
  }

  private interpolateColor(
    color1: { r: number; g: number; b: number },
    color2: { r: number; g: number; b: number },
    t: number
  ): { r: number; g: number; b: number } {
    return {
      r: Math.round(color1.r + (color2.r - color1.r) * t),
      g: Math.round(color1.g + (color2.g - color1.g) * t),
      b: Math.round(color1.b + (color2.b - color1.b) * t),
    };
  }

  clear(): void {
    this.leftBand.clear();
    this.rightBand.clear();
    this.frontPouch.clear();
    this.pouchShadow.clear();
  }

  destroy(): void {
    this.leftBand.destroy();
    this.rightBand.destroy();
    this.frontPouch.destroy();
    this.pouchShadow.destroy();
  }
}
