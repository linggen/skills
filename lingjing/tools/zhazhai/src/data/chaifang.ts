// chaifang.ts — 砸寨: the 柴房's practice throws (Hanli 10-27: 「可以, 加吧」 — the 观's places want boards of their own;
// 割绳子's daily generator stays cut). The woodshed yard by day: 黄鼠狼 have got in after the hens and hide among the
// woodpiles — under a log laid across two uprights, on top of a stack of split wood, up on a stack with a shelter on it —
// and 小满 throws stones from the coop's side till every one has run. Six rungs, easiest first (tasks/world.json
// chaifang-huangshulang `climb`): one weasel under one shelter, then piles that stand taller, stone slabs for lids, more
// weasels, the same few stones. Each rung is made by `rung(n)` from its own seed (a small seeded generator, run when the
// bundle is built, so a rung is the same every time it is dealt and the bot proves exactly what is played:
// tests/game-zhazhai.test.mjs); nothing here repeats a story throw's layout. Plain data: no Phaser here.
import { BirdType } from "../types/BirdType";
import { PigSize } from "../constants/PigSize";
import { BlockMaterial } from "../constants/Materials";
import { GRID_UNIT, GROUND_Y, SLINGSHOT_X } from "../config/GameConfig";
import type { LevelBlockConfig, LevelData, LevelPigConfig } from "./levels";

const U = GRID_UNIT;

/** mulberry32 over a string's hash: the rung's own numbers, the same every build. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A block by its size in grid units, its middle `x` and its foot `bottom` (as throws.ts `block`). */
function block(material: BlockMaterial, shape: "rectangle" | "square", gw: number, gh: number, x: number, bottom: number, skin?: string): LevelBlockConfig {
  const upright = shape === "rectangle" && gw < gh;
  const [cw, ch] = upright ? [gh, gw] : [gw, gh];
  return {
    x, y: bottom - (gh * U) / 2, width: gw * U, height: gh * U, material, rotation: upright ? 90 : 0,
    elementIndex: `${material}_${shape}_pristine_${cw}x${ch}`, ...(skin ? { skin } : {}),
  };
}
const LOG = "zz:prop-log";
const wood = (gw: number, gh: number, x: number, bottom: number) => block(BlockMaterial.WOOD, "rectangle", gw, gh, x, bottom, gw > gh ? LOG : undefined);
const weasel = (x: number, foot: number, size = PigSize.SMALL): LevelPigConfig => ({ x, y: foot - U / 2, size });

type Pile = { blocks: LevelBlockConfig[]; pig: LevelPigConfig | null };
/** A log across two uprights, the weasel under it. `slab`: a stone slab for the lid. */
function shelter(x: number, foot: number, slab: boolean, hides: boolean): Pile {
  const lid = slab ? block(BlockMaterial.STONE, "rectangle", 3, 1, x, foot - 2 * U) : wood(3, 1, x, foot - 2 * U);
  return { blocks: [wood(1, 2, x - U, foot), wood(1, 2, x + U, foot), lid], pig: hides ? weasel(x, foot) : null };
}
/** A stack of split wood `h` logs high (each 4 long, laid across), the weasel on top. */
function stack(x: number, h: number, hides: boolean): Pile {
  const blocks = Array.from({ length: h }, (_, k) => wood(4, 1, x + (k % 2 ? 0.25 : -0.25) * U, GROUND_Y - k * U));
  return { blocks, pig: hides ? weasel(x, GROUND_Y - h * U) : null };
}
/** A stack with a shelter on it: the weasel up under the lid. */
function tower(x: number, h: number, slab: boolean): Pile {
  const base = stack(x, h, false), top = shelter(x, GROUND_Y - h * U, slab, true);
  return { blocks: [...base.blocks, ...top.blocks], pig: top.pig };
}

/** The six rungs: what stands, by kind, left to right (`*` hides a weasel), and the stones in the basket. */
const PLAN: { piles: string[]; stones: number }[] = [
  { piles: ["shelter*"], stones: 3 },
  { piles: ["stack*", "shelter"], stones: 3 },
  { piles: ["shelter*", "stack*"], stones: 4 },
  { piles: ["tower*", "shelter*"], stones: 5 },
  { piles: ["shelter*", "tower*", "stack*"], stones: 5 },
  { piles: ["tower*", "stack*", "tower*"], stones: 5 },
];

/** Past the top (tasks/world.json `climb_top`, rules/climb.mjs): five layouts as hard as rung 6, its piles in other
    orders, each on its own seed; one a day once all six are won, so the top never deals the same yard two days running. */
const TOP: string[][] = [
  ["stack*", "tower*", "tower*"],
  ["tower*", "tower*", "stack*"],
  ["tower*", "shelter*", "tower*"],
  ["shelter*", "tower*", "tower*"],
  ["tower*", "stack*", "tower*"],
];
/** A top layout's seed, where its own name's first one dealt a yard the bot won only one time in three (re-rolled 10-27,
    measured over six hands: 4b 4/6, 5b 6/6). */
const TOP_SEED = ["", "", "", "chaifang-top-4b", "chaifang-top-5b"];

/** Rung `n` (1…6): its piles from x 1700 on, each a little apart by its seed; taller and stonier up the rungs. A top
    layout (`top` 1…5) is rung 6's size on its own piles and seed. */
export function rung(n: number, top = 0): LevelData {
  const r = seeded(top ? (TOP_SEED[top - 1] || `chaifang-top-${top}`) : `chaifang-${n}`), plan = top ? { ...PLAN[5], piles: TOP[top - 1] } : PLAN[n - 1];
  const blocks: LevelBlockConfig[] = [], pigs: LevelPigConfig[] = [];
  let x = 1700 + Math.round(r() * 3) * 40;
  for (const kind of plan.piles) {
    const hides = kind.endsWith("*"), k = kind.replace("*", "");
    // A stack's height: one or two logs on the first rungs, two or three above; a tower's base one, then two.
    const high = Math.min(3, [1, 1, 2, 2, 2, 2][n - 1] + (r() < 0.5 ? 0 : 1)), base = n >= 5 ? 2 : 1;
    const slab = n >= 4 && r() < 0.5;
    const pile = k === "shelter" ? shelter(x, GROUND_Y, slab, hides) : k === "stack" ? stack(x, high, hides) : tower(x, base, slab);
    blocks.push(...pile.blocks);
    if (pile.pig) pigs.push(pile.pig);
    x += 5 * U + Math.round(r() * 4) * 30;
  }
  return {
    levelId: top ? 30 + top : 20 + n,
    key: top ? `chaifang-top-${top}` : `chaifang-${n}`,
    name: top ? `The Woodshed, top ${top}` : `The Woodshed ${n}`,
    description: "Weasels in the woodpiles.",
    theme: "forest",
    place: "chaifang",
    teachingFocus: "Bring the pile down on it.",
    birds: Array.from({ length: plan.stones }, () => ({ type: BirdType.RED })),
    structures: blocks,
    pigs,
    decor: [],
    slingshot: { x: SLINGSHOT_X, y: GROUND_Y - U },
    // Stars by stones left: every weasel run off is one ★, a stone to spare ★★, two ★★★ (a kill 5000, a spare 10000).
    starThresholds: { oneStar: 0, twoStars: pigs.length * 5000 + 10000, threeStars: pigs.length * 5000 + 20000 },
    bot: {},
  };
}

export const CHAIFANG_LEVELS: LevelData[] = [...PLAN.map((_, i) => rung(i + 1)), ...TOP.map((_, i) => rung(6, i + 1))];

const NAMES: [string, string, string, string][] = [
  ["柴房 · 头一只", "一根木头横在两根柴上，底下缩着一只黄鼠狼。", "The Woodshed · The first one", "A log laid across two uprights, and a weasel crouched under it."],
  ["柴房 · 柴垛顶上", "柴垛顶上蹲着一只，眼睛盯着鸡笼。", "The Woodshed · On top of the pile", "One squats on top of the woodpile, eyes on the hen coop."],
  ["柴房 · 一上一下", "两只，一只在柴底下，一只在柴垛上。", "The Woodshed · One up, one down", "Two: one under the wood, one on the pile."],
  ["柴房 · 垛上搭棚", "柴垛上又搭了个小棚，石板盖顶。", "The Woodshed · A shelter on the pile", "A little shelter built on top of the pile, a stone slab for a roof."],
  ["柴房 · 三只", "三只，三处，石子就那么几颗。", "The Woodshed · Three", "Three, in three places, and only so many stones."],
  ["柴房 · 满院子", "柴房前后全是柴垛，哪一垛里都有眼睛。", "The Woodshed · The whole yard", "Woodpiles all round the shed, and eyes in every one."],
];
/** The rungs' words, both languages (levels.ts LEVEL_WORDS takes them with the throws'). */
export const CHAIFANG_WORDS: Record<number, Record<"zh" | "en", { name: string; description: string; teachingFocus: string }>> = Object.fromEntries(
  NAMES.map(([zn, zd, en, ed], i) => [20 + i + 1, {
    zh: { name: zn, description: zd, teachingFocus: "砸柴不砸鸡——把柴垛砸塌在它身上，它就跑了。" },
    en: { name: en, description: ed, teachingFocus: "Hit the wood, not the hens: bring the pile down on it and it runs." },
  }])
);
const TOP_NAMES: [string, string, string, string][] = [
  ["柴房 · 垛后头", "柴垛挡在前头，两座搭了棚的垛藏在后面。", "The Woodshed · Behind the pile", "A woodpile in front, two roofed piles hidden behind it."],
  ["柴房 · 两座棚", "近处两座垛上都搭了棚，最远那垛光着顶。", "The Woodshed · Two shelters", "Shelters on the two near piles; the far one is bare on top."],
  ["柴房 · 中间一只", "中间那只缩在柴底下，两边垛上各蹲一只。", "The Woodshed · One in the middle", "One crouched under the wood in the middle, one up on each pile."],
  ["柴房 · 近处一只", "最近那只先露了头，后面两座垛，棚顶压着石板。", "The Woodshed · The near one", "The nearest one shows its head first; behind it two piles with shelters on top."],
  ["柴房 · 又来了", "昨天赶跑的，今天又回来了，换了地方。", "The Woodshed · Back again", "The ones chased off yesterday are back today, somewhere else."],
];
for (const [i, [zn, zd, en, ed]] of TOP_NAMES.entries()) CHAIFANG_WORDS[30 + i + 1] = {
  zh: { name: zn, description: zd, teachingFocus: "砸柴不砸鸡——把柴垛砸塌在它身上，它就跑了。" },
  en: { name: en, description: ed, teachingFocus: "Hit the wood, not the hens: bring the pile down on it and it runs." },
};
