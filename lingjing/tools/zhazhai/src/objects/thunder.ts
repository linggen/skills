// thunder.ts — the 五雷符 in flight (Hanli 10-20: 「符文飞出去有点奇怪, 一页纸来砸」). In the basket and the pouch it is a
// paper talisman; let go, it is 催动: the paper flies at the heart of a ball of crackling 雷光 that spins and flickers,
// shedding fading ghosts behind it, until it bursts (the explosion ability) or the throw is spent.
// The ball is game-assets/art/fx-thunder.webp, painted on black by the local FLUX (mflux FLUX.2 klein, 512², seed 1):
//   "A cartoon game visual effect: a round ball of crackling electric thunder energy, bright white-hot core fading to
//    electric cyan and violet, jagged zig-zag lightning arcs whipping around its rim, small sparks flying off, glowing,
//    centred … on a plain solid pure BLACK background … Bright cheerful mobile game effect style like Angry Birds
//    power-ups …"
// then keyed (its brightness is its alpha), so it reads on the bright sky as well as the dark. The paper keeps the body
// (and its hits); the ball is only drawn, behind the paper.
import Phaser from "phaser";

const KEY = "zz-fx-thunder";
const GHOST_MS = 55;

export class ThunderAura {
  private ball: Phaser.GameObjects.Image | null;
  private since = 0;
  private readonly onUpdate: (time: number, delta: number) => void;

  constructor(private scene: Phaser.Scene, private paper: Phaser.GameObjects.Image, private calm = false) {
    const size = Math.max(paper.displayWidth, paper.displayHeight) * 3.2;
    this.ball = scene.add.image(paper.x, paper.y, KEY).setDepth(paper.depth - 1);
    const base = size / this.ball.width;
    this.ball.setScale(base * 0.4).setAlpha(0.95);
    // 催符: it flares open out of the paper, then flickers as it flies
    scene.tweens.add({ targets: this.ball, scale: base, duration: 140, ease: "Back.Out" });
    if (!calm) scene.tweens.add({ targets: this.ball, alpha: 0.8, duration: 90, yoyo: true, repeat: -1, ease: "Sine.InOut", delay: 140 });
    this.onUpdate = (_t, delta) => this.follow(delta, base);
    scene.events.on("update", this.onUpdate);
  }

  private follow(delta: number, base: number): void {
    const b = this.ball;
    if (!b) return;
    if (!this.paper.active) { this.destroy(); return; }
    b.setPosition(this.paper.x, this.paper.y);
    b.rotation += delta * 0.012;
    if (this.calm || (this.since += delta) < GHOST_MS) return;
    this.since = 0;
    // a ghost of the ball left where it was, shrinking out: the 雷光's trail
    const g = this.scene.add.image(b.x, b.y, KEY).setDepth(b.depth - 1)
      .setScale(base * 0.7).setAlpha(0.45).setRotation(b.rotation);
    this.scene.tweens.add({ targets: g, scale: base * 0.15, alpha: 0, duration: 320, ease: "Quad.Out", onComplete: () => g.destroy() });
  }

  destroy(): void {
    if (!this.ball) return;
    this.scene.events.off("update", this.onUpdate);
    const b = this.ball;
    this.ball = null;
    this.scene.tweens.killTweensOf(b);
    b.destroy();
  }
}
