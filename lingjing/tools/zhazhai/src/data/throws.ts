// throws.ts — 砸寨: the story's throws, each its own level (Hanli 10-20: 「射鹿可以用砸寨代替. 其他投掷类都用砸寨的不同关卡代替」).
// Each is the book's moment: its place, its target (zhazhai/targets.ts), the one thing 小满 has to throw there (the card
// law: only what he owns at that point of the story), and set-dressing drawn from the material blocks — wood and stone,
// the things that stand by a stream or on a shoal (never a temple door in a forest: Hanli 10-19 「不太合理」). In story
// order, each a little harder than the one before (his rule). The story points at a level by its `key` (tasks/*.json
// `deal.lv`); the 游戏厅 opens one with `lv=<key>`. Plain data: no Phaser here (levels-dump.ts reads it under node).
import { BirdType } from "../types/BirdType";
import { PigSize } from "../constants/PigSize";
import { BlockMaterial } from "../constants/Materials";
import { GRID_UNIT, GROUND_Y, SLINGSHOT_X } from "../config/GameConfig";
import type { LevelBlockConfig, LevelData } from "./levels";

const U = GRID_UNIT;

/** A block by its size in grid units, its middle `x` and its foot `bottom` (world). Upstream's atlas frames are
    painted lying down, so a standing one is a lying frame turned 90° (as levels.ts convertGridLevelToLevelData). */
function block(
  material: BlockMaterial,
  shape: "rectangle" | "circle" | "square",
  gw: number,
  gh: number,
  x: number,
  bottom: number,
  more: Partial<LevelBlockConfig> = {}
): LevelBlockConfig {
  const upright = shape === "rectangle" && gw < gh;
  const [cw, ch] = upright ? [gh, gw] : [gw, gh];
  return {
    x,
    y: bottom - (gh * U) / 2,
    width: gw * U,
    height: gh * U,
    material,
    rotation: upright ? 90 : 0,
    elementIndex: `${material}_${shape}_pristine_${cw}x${ch}`,
    ...more,
  };
}

const SLINGSHOT = { x: SLINGSHOT_X, y: GROUND_Y - U };
/** Stars by what was left in the basket: the first throw ★★★, the second ★★, the last ★ (a kill is 5000, a spare 10000). */
const STARS = { oneStar: 0, twoStars: 15000, threeStars: 25000 };
const on = (x: number) => ({ x, y: GROUND_Y - U / 2, size: PigSize.SMALL });

export const THROW_LEVELS: LevelData[] = [
  // 第二回 00-deer 射鹿 · 先看风: the stag drinking at the stream, three hundred steps off; 爷爷的弓, three arrows.
  // A fallen log on two stones before it, a dead pine standing by it. Lob over the log, or knock the dead tree down
  // on it; a near miss and it bolts, and comes back somewhere else.
  {
    levelId: 6,
    key: "deer-wind",
    name: "The Stag",
    description: "The stag drinks at the stream.",
    theme: "forest",
    place: "creek",
    teachingFocus: "Wind first, then the deer.",
    birds: [{ type: BirdType.ARROW }, { type: BirdType.ARROW }, { type: BirdType.ARROW }],
    structures: [
      block(BlockMaterial.WOOD, "rectangle", 1, 7, 1380, GROUND_Y, { skin: "zz:prop-pine", fixed: true }),
      block(BlockMaterial.STONE, "square", 2, 2, 1760, GROUND_Y, { skin: "zz:prop-rock" }),
      block(BlockMaterial.STONE, "square", 2, 2, 1960, GROUND_Y, { skin: "zz:prop-rock" }),
      block(BlockMaterial.WOOD, "rectangle", 5, 1, 1860, GROUND_Y - 2 * U, { skin: "zz:prop-log" }),
      // The dead pine behind it leans its way: an arrow flying long knocks it down on the stag.
      block(BlockMaterial.WOOD, "rectangle", 1, 6, 2510, GROUND_Y, { skin: "zz:prop-deadtree", rotation: 76 }),
    ],
    pigs: [on(2230)],
    target: { kind: "deer", spook: 170, alert: 450, away: 3200, spots: [2370, 2150, 2290] },
    decor: [
      { art: "prop-crown", x: 1330, y: GROUND_Y - 7 * U + 130, h: 240 },
      { art: "prop-bush", x: 2660, y: GROUND_Y + 10, h: 170 },
      { art: "prop-reeds", x: 540, y: GROUND_Y + 10, h: 260, front: true },
      { art: "prop-reeds", x: 600, y: GROUND_Y + 10, h: 220, front: true, flip: true },
    ],
    slingshot: SLINGSHOT,
    starThresholds: STARS,
    bot: {},
  },
  // 第五回 wm-xirang 暗河 (the reading-cap hand-off, 10-20): the dry underground river, dark; 邹青松 crouched behind the
  // stones with his gourd stoppered — 「黑里射不着人。可他杀人只使葫芦——葫芦一开，就有光。小满搭上一支，左手在地上摸了
  // 一块石子，往左边黑里一丢。『嗒』。铜塞子『啵』地一响，葫芦嘴里亮起一团红光……他一箭奔那团红光去了。」 A stone into
  // the dark first, then the arrow at the light while it shows; anywhere else the arrow rings off his shield.
  {
    levelId: 7,
    key: "anhe-dark",
    name: "The Light in the Dark",
    description: "The dry river under the mountain.",
    theme: "forest",
    place: "anhe",
    teachingFocus: "A stone into the dark, then the arrow at the light.",
    birds: [{ type: BirdType.RED }, { type: BirdType.ARROW }, { type: BirdType.RED }, { type: BirdType.ARROW }],
    structures: [
      block(BlockMaterial.STONE, "square", 2, 2, 2040, GROUND_Y, { skin: "zz:prop-rock" }),
      block(BlockMaterial.STONE, "circle", 1, 1, 1890, GROUND_Y, { skin: "zz:prop-rock" }),
      block(BlockMaterial.STONE, "circle", 1, 1, 1480, GROUND_Y, { skin: "zz:prop-rock" }),
    ],
    pigs: [on(2260)],
    target: { kind: "gourd", delay: 450, open: 9000, root: { dx: -100, dy: -85, r: 24 } },
    decor: [
      { art: "prop-reeds", x: 1660, y: GROUND_Y + 8, h: 110 },
      { art: "prop-reeds", x: 2380, y: GROUND_Y + 8, h: 90, flip: true },
    ],
    slingshot: SLINGSHOT,
    starThresholds: STARS,
    bot: { decoy: { x: 1640, y: GROUND_Y - 20 } },
  },
  // 古七 09-yishui 芦苇里那一等: the 鯥 comes up out of the 沂水 at the torch and 孙二狗's pine board, and is pinned in
  // the brambles; its hide turns a blade, but when it draws breath its wings lift and the root shows soft pink flesh for
  // an instant. 小满 in the reeds downwind, behind it, the short flying sword between his fingers: three throws over the
  // driftwood, onto its back as it breathes; a tap sends the sword straight.
  {
    levelId: 8,
    key: "yishui-reed",
    name: "The Wait in the Reeds",
    description: "The lu on the shoal of the Yi.",
    theme: "forest",
    place: "shoal",
    teachingFocus: "Wait for its breath.",
    birds: [{ type: BirdType.YELLOW }, { type: BirdType.YELLOW }, { type: BirdType.YELLOW }],
    structures: [
      // 孙二狗's pine board planted at the drag mark, the torch by it: what the 鯥 charges.
      block(BlockMaterial.WOOD, "rectangle", 1, 3, 2470, GROUND_Y, { fixed: true }),
      // Driftwood and stones on the shoal behind it, between it and the reeds.
      block(BlockMaterial.STONE, "circle", 1, 1, 1640, GROUND_Y, { skin: "zz:prop-rock" }),
      block(BlockMaterial.STONE, "square", 2, 2, 1740, GROUND_Y, { skin: "zz:prop-rock" }),
      block(BlockMaterial.WOOD, "rectangle", 3, 1, 1720, GROUND_Y - 2 * U, { skin: "zz:prop-log" }),
    ],
    pigs: [on(2140)],
    target: { kind: "lu", every: 2400, open: 1000, struggle: { every: 2000, open: 800 }, root: { dx: 40, dy: -95, r: 70 } },
    decor: [
      { art: "prop-torch", x: 2530, y: GROUND_Y + 6, h: 230 },
      { art: "prop-bramble", x: 2140, y: GROUND_Y + 14, h: 120, front: true },
      { art: "prop-reeds", x: 520, y: GROUND_Y + 10, h: 280, front: true },
      { art: "prop-reeds", x: 590, y: GROUND_Y + 10, h: 240, front: true, flip: true },
    ],
    slingshot: SLINGSHOT,
    starThresholds: STARS,
    bot: { timed: true },
  },
];

/** The throws' words, in both languages (the forts' are in levels.ts LEVEL_WORDS). */
export const THROW_WORDS: Record<number, Record<"zh" | "en", { name: string; description: string; teachingFocus: string }>> = {
  6: {
    zh: { name: "射鹿", description: "溪边，那头雄鹿低着头喝水。", teachingFocus: "先看风，后看鹿。擦着它过去，它就跑了。" },
    en: { name: "The Stag", description: "By the stream the stag drinks, head down.", teachingFocus: "Wind first, then the deer. Graze it and it bolts." },
  },
  7: {
    zh: { name: "暗河里那一团红光", description: "干了的暗河，黑里蹲着邹青松，葫芦塞着。黑里射不着人。", teachingFocus: "先往黑里丢一块石子——葫芦一开，就有光。再一箭奔那团红光。" },
    en: { name: "The Red Light in the Dark", description: "The dry river under the mountain: Zou Qingsong crouched in the dark, his gourd stoppered. You can't shoot a man in the dark.", teachingFocus: "A stone into the dark first: open the gourd and there is light. Then the arrow at the red light." },
  },
  8: {
    zh: { name: "芦苇里那一等", description: "沂水滩上，鯥叫荆棘钉住了。皮厚，刀剑不入。", teachingFocus: "等它吸气——翅膀根翻开的那一霎。飞行中点一下，剑直冲出去。" },
    en: { name: "The Wait in the Reeds", description: "On the Yi shoal the lu is caught in the brambles. Its hide turns a blade.", teachingFocus: "Wait for its breath: the instant the wing root opens. Tap in flight and the sword flies straight." },
  },
};
