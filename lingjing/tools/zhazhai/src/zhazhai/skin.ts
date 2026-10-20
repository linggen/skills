// skin.ts — 砸寨: a thing drawn from its own painting instead of an upstream atlas frame. An asset key `zz:<name>`
// names game-assets/art/<name>.webp, loaded as the texture `zz-<name>` (decor.ts loadArt); any other key is a frame of
// the `level` atlas (atlas.py's). So the story throws (the arrow, the stag, the 鯥, the props) need no atlas frame.
import { LEVEL_ATLAS_KEY } from "../config/assetManifest";

export const SKIN = "zz:";

/** [texture, frame] for an asset key: a painting of its own, or the level atlas's frame. */
export function texOf(assetKey: string): [string, string | undefined] {
  return assetKey.startsWith(SKIN) ? [`zz-${assetKey.slice(SKIN.length)}`, undefined] : [LEVEL_ATLAS_KEY, assetKey];
}

/** The size of what texOf names, in its own pixels. */
export function sizeOf(scene: Phaser.Scene, assetKey: string): { w: number; h: number } {
  const [key, frame] = texOf(assetKey);
  const t = scene.textures.get(key);
  const f = frame ? t?.get(frame) : t?.get();
  return { w: f?.cutWidth ?? t?.source[0]?.width ?? 70, h: f?.cutHeight ?? t?.source[0]?.height ?? 70 };
}
