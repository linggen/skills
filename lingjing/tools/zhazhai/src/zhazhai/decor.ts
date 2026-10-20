// decor.ts — 砸寨's own touches on upstream's title and fort-select scenes: the painted weasels (big, from
// game-assets/art/, not the 70 px atlas frames), a tagline, and each fort's name under its card.
import Phaser from "phaser";
import { tr } from "./i18n";
import { Runtime } from "./runtime";
import { getLevelById } from "../data/levels";

// basket-back / basket-front: the 竹篮 the throws rest in (systems/BirdQueue.ts, drawn by atlas.py basket()).
// fx-thunder: the 五雷符's flight — the talisman, once let go, flies inside a ball of crackling 雷光 (Hanli 10-20:
// 「符文飞出去有点奇怪, 一页纸来砸」). Painted on black by the local FLUX (seed 1, the prompt in objects/thunder.ts), keyed
// by its brightness.
export const ART = ["weasel-s", "weasel-m", "weasel-l", "proj-stone", "slingshot", "basket-back", "basket-front", "fx-thunder"] as const;

// The story throws' paintings (tools/paint-zhazhai-throws.py): their targets, props and places (data/throws.ts).
export const THROW_ART = [
  "deer-graze", "deer-look", "deer-bolt", "lu-shut", "lu-open", "proj-arrow",
  "prop-pine", "prop-deadtree", "prop-log", "prop-rock", "prop-bush", "prop-reeds", "prop-bramble", "prop-torch", "prop-crown",
  "zou", "place-creek", "place-shoal", "place-anhe",
] as const;

export function loadArt(load: Phaser.Loader.LoaderPlugin): void {
  for (const k of [...ART, ...THROW_ART]) load.image(`zz-${k}`, `art/${k}.webp`);
}

const FAMILY = '"Kenney Bold", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';

/** An idle breath: squash and stretch from the feet, forever. */
function breathe(scene: Phaser.Scene, img: Phaser.GameObjects.Image, ms: number, delay = 0): void {
  const sx = img.scaleX, sy = img.scaleY;
  scene.tweens.add({ targets: img, scaleX: sx * 1.04, scaleY: sy * 0.95, duration: ms, yoyo: true, repeat: -1, ease: "Sine.InOut", delay });
}

/** The title screen: the chief on his fort's step at the right, two of his gang, the slingshot and a stone at the left. */
export function menuDecor(scene: Phaser.Scene, w: number, h: number): void {
  const ground = h * 0.97;
  const put = (key: string, x: number, size: number, flip = false, depth = 50) => {
    const img = scene.add.image(x, ground + 60, `zz-${key}`).setOrigin(0.5, 1).setDepth(depth);
    img.setScale((size / img.height) * (flip ? -1 : 1), size / img.height);
    scene.tweens.add({ targets: img, y: ground, duration: 520, ease: "Back.Out", delay: 300 + x / 8 });
    return img;
  };
  breathe(scene, put("weasel-l", w * 0.83, 420), 900, 900);
  breathe(scene, put("weasel-m", w * 0.67, 250), 700, 1100);
  breathe(scene, put("weasel-s", w * 0.96, 190), 600, 1200);
  put("slingshot", w * 0.15, 360);
  put("proj-stone", w * 0.26, 110);
  const tag = scene.add.text(w / 2, h * 0.31, tr("A weasel gang stole the village's chickens."), {
    fontFamily: FAMILY, fontSize: "40px", color: "#fff8e6", stroke: "#5a3a1a", strokeThickness: 8,
  }).setOrigin(0.5).setDepth(101).setAlpha(0);
  scene.tweens.add({ targets: tag, alpha: 1, duration: 600, delay: 900 });
}

/** Under each fort's card in the select: its name. */
export function fortName(scene: Phaser.Scene, level: number): Phaser.GameObjects.Text {
  const name = getLevelById(level)?.name ?? "";
  return scene.add.text(0, 118, name, {
    fontFamily: FAMILY, fontSize: Runtime.lang === "zh" ? "34px" : "24px", color: "#ffffff", stroke: "#3d2817", strokeThickness: 7,
    align: "center", wordWrap: { width: 210 }, // cards stand ~275 units apart
  }).setOrigin(0.5, 0);
}
