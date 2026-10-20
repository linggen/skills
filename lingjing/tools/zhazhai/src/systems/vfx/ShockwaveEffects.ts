import Phaser from "phaser";
import { BlockMaterial } from "../../constants/Materials";
import { materialRegistry } from "../../config/registries/MaterialConfigRegistry";
import { CirclePool } from "../../utils/ObjectPool";
import { SHOCKWAVE_CONFIG } from "../../config/VFXConfig";

export class ShockwaveEffects {
  private ringPool: CirclePool;
  private destroyed: boolean = false;

  constructor(private scene: Phaser.Scene) {
    this.ringPool = new CirclePool(scene, {
      initialSize: SHOCKWAVE_CONFIG.poolInitialSize,
      maxSize: SHOCKWAVE_CONFIG.poolMaxSize,
    });
  }

  spawnShockwaveRing(x: number, y: number, material: BlockMaterial, impactSpeed: number): void {
    if (this.destroyed) return;

    const intensity = Math.min(impactSpeed / SHOCKWAVE_CONFIG.impactSpeedNormalization, 1);
    const color = materialRegistry.getColor(material);
    const radius = SHOCKWAVE_CONFIG.radiusBase + intensity * SHOCKWAVE_CONFIG.radiusRange;

    const ring = this.ringPool.acquire(
      x,
      y,
      SHOCKWAVE_CONFIG.initialRadius,
      color,
      SHOCKWAVE_CONFIG.initialAlpha
    );
    ring.setDepth(SHOCKWAVE_CONFIG.depth);

    this.scene.tweens.add({
      targets: ring,
      radius: radius,
      alpha: 0,
      duration: SHOCKWAVE_CONFIG.duration,
      ease: "Quad.easeOut",
      onComplete: () => this.ringPool.release(ring),
    });
  }

  getMaterialColor(material: BlockMaterial): number {
    return materialRegistry.getColor(material);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ringPool.destroy();
  }
}
