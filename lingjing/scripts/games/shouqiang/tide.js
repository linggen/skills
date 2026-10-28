// shouqiang/tide.js — 守墙关's 兽潮 nights past the hand-made rows (rules/shouchao.mjs; Hanli 2026-10-28: 「后面新兽潮是否会到下一关,
// 还是同一关反复, 最好不要反复」 · 「关卡要多, 最起码1个月不重复」 · 「主力塔防放进兽潮」). Pure and seeded: one ask → one night.
//
//   tide.night(kit, { seed, tier, boss, open }) → { deal, sig, boss, kinds } | null
//
// `kit`: levels/shouqiang.json. `seed`: the night's own (the rules make it from the save and the night). `tier` 0…1: the
// climb, from about the last hand-made night (shouchao-4) to the ceiling. `boss`: bring one 大妖 of his 回 (`open`) — the
// last wave, small on the first nights (`bossHp`), so 结印 has its moment and is never needed. `open(kind)`: a beast of
// his 回 or before (rules/reveal.mjs). A night is the 山门's wall mode, in one of three places of 沉鼎观 (the 山道 under the
// 山门; the 后山 溪口 with its two trails; the 药园's low wall with the alleys between the beds — the painted art each
// level type already has, `paths` the painted ways): waves of 1–3 groups, their kinds, counts, gaps and delays drawn
// from the seed. The deal lays the whole night over a base row the phone already ships (`over`), so a night is data.
// `sig` names the layout (place, waves) without the knobs, for the rules' never-twice. Bot-proven: tests/tide-shouqiang.
export const SCENES = {
  shanmen: { art: null, paths: null, wall: 1200, zh: '山门', en: 'the gate' },
  xikou: { art: { bg: 'tailu-bg', wall: 'wall' }, wall: 1200, zh: '后山溪口', en: 'the stream below the back hill',
    paths: [[[232, -70], [222, 200], [200, 420], [179, 489], [166, 580], [138, 670], [124, 760]], [[322, -70], [340, 200], [356, 426], [370, 489], [375, 580], [396, 670], [412, 760]]] },
  yaoyuan: { art: { bg: 'yaoyuan-bg', wall: 'yaoyuan-wall' }, wall: 1100, zh: '药园外墙', en: 'the herb garden wall', paths: [107, 215, 323, 431] },
};
import { BOTS, sim, withRoots } from './core.js';

const BASE = 'shouchao-1';
// Each kind's weight in the count (its hp and pace against 小满's hand), and its place in the book (the latest met last).
const WEIGHT = { yezhu: 1, zheng: 1, qiuyu: 1.9, qique: 1.1 };
const RANK = ['yezhu', 'zheng', 'qiuyu', 'qique'];

function rng(seed) {
  let a = 2166136261 >>> 0;
  for (const ch of String(seed)) a = Math.imul(a ^ ch.codePointAt(0), 16777619) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, k) => a + (b - a) * k;
const r2 = (x) => Math.round(x * 100) / 100;

/** The night's waves: `n` waves, each 1–3 groups of open kinds; the count of a wave grows to the last. */
function wavesOf(r, kinds, n, tier) {
  const newest = kinds.at(-1);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const k = n > 1 ? i / (n - 1) : 1;
    const total = lerp(11, 40, k) * lerp(1, 1.12, tier) * (0.88 + r() * 0.24);
    const groups = i === 0 ? 1 : 1 + Math.floor(r() * Math.min(3, kinds.length + 1));
    // The first wave is the oldest kind; the newest kind shows from the third wave on, at least once.
    const pool = i === 0 ? kinds.slice(0, 1) : i < 2 ? kinds.filter((x) => x !== newest || kinds.length === 1) : kinds;
    const picked = [];
    for (let j = 0; j < groups; j += 1) {
      const kind = (i === Math.max(2, Math.floor(n / 2)) && j === 0) ? newest : pool[Math.floor(r() * pool.length)];
      if (!picked.includes(kind)) picked.push(kind);
    }
    const share = picked.map(() => 0.6 + r());
    const sum = share.reduce((a, b) => a + b, 0);
    let delay = 0;
    out.push(picked.map((kind, j) => {
      const count = Math.max(3, Math.round(total * share[j] / sum / WEIGHT[kind]));
      const span = lerp(5, 9, r()) * (kind === 'qiuyu' ? 1.4 : 1);
      const g = [kind, count, r2(Math.max(0.2, span / count)), j === 0 ? 0 : delay];
      delay += Math.round(2 + r() * 5);
      return g;
    }));
  }
  return out;
}

export const tide = {
  game: 'shouqiang',
  boss: true,
  night(kit, { seed, tier = 0, boss = false, open = () => true }) {
    const beasts = kit?.beasts ?? {};
    const kinds = RANK.filter((k) => beasts[k] && open(k));
    if (!kinds.length || !kit.levels?.some((l) => l.id === BASE)) return null;
    const bossKind = boss ? Object.keys(beasts).find((k) => !k.startsWith('_') && beasts[k]?.boss && open(k)) ?? null : null;
    const r = rng(`shouqiang|tide|${seed}`);
    const names = Object.keys(SCENES), place = names[Math.floor(r() * names.length)], sc = SCENES[place];
    const t = Math.max(0, Math.min(1, tier));
    const n = 6 + Math.floor(r() * 2) + Math.round(t * 2);
    const waves = wavesOf(r, kinds, n, t);
    if (bossKind) waves.at(-1).push([bossKind, 1, 1, Math.round(3 + r() * 6)]);
    const used = [...new Set(waves.flat().map((g) => g[0]))];
    const over = {
      place: place === 'shanmen' ? 'shanmen' : place,
      wall: sc.wall,
      hpMul: r2(lerp(1.9, 2.05, t)),
      growth: r2(lerp(0.36, 0.42, t)),
      difficulty: 1,
      // the 大妖's own size: about a third of the hand-made 山门's on the first nights, a little more at the ceiling
      ...(bossKind ? { bossHp: r2(lerp(0.3, 0.38, t)) } : {}),
      ...(sc.art ? { art: sc.art } : {}),
      ...(sc.paths ? { paths: sc.paths } : {}),
      waves,
      lead: [
        { zh: `兽潮扑向${sc.zh}！`, en: `The tide breaks on ${sc.en}!`, big: true },
        ...(bossKind ? [{ zh: '后头跟着个大的。', en: 'Something big comes behind them.' }] : []),
        { zh: '守住！', en: 'Hold!', big: true },
      ],
    };
    const sig = `shouqiang|${place}|${waves.map((w) => w.map((g) => g.slice(0, 4).join(':')).join('+')).join('/')}`;
    return { deal: { lv: BASE, over, tide: true }, sig, boss: Boolean(bossKind), kinds: used };
  },
  /** The night played once headless by the human-like hand, no 结印 (tools/tide-prove.mjs): won? `creatures` for 五行. */
  prove(kit, deal, seed, creatures = []) {
    const k = withRoots(kit, creatures), row = k.levels.find((l) => l.id === deal.lv) ?? k.levels[0];
    return sim(k, deal.over ? { ...row, ...deal.over } : row, BOTS.human, { seed }).won;
  },
};
