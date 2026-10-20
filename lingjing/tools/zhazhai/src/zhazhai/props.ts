// props.ts — 砸寨: a story throw's place (data/throws.ts). The painted backdrop behind the field (`place`), the
// set-dressing that has no body (`decor`: the brush, the reeds, the torch), and blocks drawn as the things they are
// (`skin`: a log, a rock, a pine — the block underneath keeps its material, its strength and its shards).
import Phaser from "phaser";
import { LEVEL_WIDTH, GROUND_Y } from "../config/GameConfig";
import { DesignTokens } from "../config/DesignTokens";
import type { Block } from "../objects/Block";
import type { DecorConfig } from "../data/levels";
import { texOf } from "./skin";

/** The place's painting over upstream's parallax, across the whole field, its foot on the ground line. */
export function placeBackdrop(scene: Phaser.Scene, place: string | undefined): void {
  const key = `zz-place-${place}`;
  if (!place || !scene.textures.exists(key)) return;
  // Wide enough for the widest zoom out, with room to scroll past either end; the painting's own near ground (its lower
  // fifth) mostly under the field's ground.
  const s = (LEVEL_WIDTH * 1.7) / 1024;
  const img = scene.add.image(LEVEL_WIDTH / 2, GROUND_Y + 576 * s * 0.14, key).setOrigin(0.5, 1);
  img.setScale((LEVEL_WIDTH * 1.7) / img.width);
  img.setScrollFactor(0.92, 1);
  img.setDepth(DesignTokens.depth.background - 1);
}

/** The ground under a place: moonlit on the night shoal (upstream's grass tile, tinted). */
const GROUND_TINT: Record<string, number> = { shoal: 0x7f89b0, anhe: 0x4c5270, jiangtang: 0xb08a5e, campus: 0xc9c2b4 };

export function tintGround(scene: Phaser.Scene, place: string | undefined): void {
  const tint = place ? GROUND_TINT[place] : undefined;
  if (tint === undefined) return;
  for (const o of scene.children.list) if (o instanceof Phaser.GameObjects.TileSprite) o.setTint(tint);
}

/** The dark of a place (the dry river under the mountain): a shade over the field and what stands on it, under the
    throws and the slingshot — a light in it (the gourd's) is drawn over it. */
const SHADE: Record<string, number> = { anhe: 0.5 };
export const SHADE_DEPTH = DesignTokens.depth.pig + 3;

export function shadePlace(scene: Phaser.Scene, place: string | undefined): void {
  const a = place ? SHADE[place] : undefined;
  if (!a) return;
  scene.add.rectangle(LEVEL_WIDTH / 2, GROUND_Y, LEVEL_WIDTH * 3, GROUND_Y * 3, 0x050814, a).setDepth(SHADE_DEPTH);
}

/** The painted things with no body. */
export function placeDecor(scene: Phaser.Scene, decor: DecorConfig[] | undefined): void {
  for (const d of decor ?? []) {
    const key = `zz-${d.art}`;
    if (!scene.textures.exists(key)) continue;
    const img = scene.add.image(d.x, d.y, key).setOrigin(0.5, 1);
    img.setScale(d.h / img.height);
    if (d.flip) img.setFlipX(true);
    img.setDepth(d.front ? DesignTokens.depth.pig + 2 : DesignTokens.depth.block - 2);
  }
}

/** A block drawn as its painting: the block's own picture hidden, the painting riding on its body (turning with it as it
    falls). The painting is drawn at the block's size as the level gives it, `w` × `h` (a standing pine is tall); a
    standing block is upstream's lying frame turned 90°, so its painting turns 90° less than its body. */
export function skinBlock(scene: Phaser.Scene, block: Block, skin: string, w: number, h: number): void {
  const body = block.getMatterImage();
  if (!body) return;
  const [key, frame] = texOf(skin);
  if (!scene.textures.exists(key)) return;
  const img = scene.add.image(body.x, body.y, key, frame).setDepth(body.depth);
  // A lying thing (a log, a rock) fills its block; a standing one (a tree) keeps its own shape at the block's height,
  // its branches reaching past the narrow trunk the body is.
  const upright = w < h;
  img.setDisplaySize(upright ? Math.min((h * img.width) / img.height, w * 2.6) : w, h);
  body.setAlpha(0);
  const turn = upright ? Math.PI / 2 : 0;
  const follow = () => {
    if (block.isDestroyed() || !block.getMatterImage()) return stop();
    const b = block.getMatterImage()!;
    img.setPosition(b.x, b.y).setRotation(b.rotation - turn);
    // A dent shows as a darker painting (the block's own cracked frames are hidden with it).
    const left = block.getHealthPercent();
    img.setTint(left > 0.66 ? 0xffffff : left > 0.33 ? 0xd8c8b8 : 0xb09a8a);
  };
  const stop = () => {
    scene.events.off("update", follow);
    img.destroy();
  };
  scene.events.on("update", follow);
  scene.events.once("shutdown", stop);
}
