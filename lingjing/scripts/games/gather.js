// 拾遗 · 石缝里的灵草 — 古五, the dry river under the 沉鼎秘境 (the room's board, 2026-10-15). The
// book: this year the Si ebbed low, the underground river ran dry and showed its bed — in the cracks,
// clump after clump of spirit herbs, high, middle and low grade, and a vein of copper on the wall;
// four 九层 at the far end pull them by the sleeveful without looking at the grade. Here nine cracks
// along the bank, each with a faint light or none: gold for a high-grade herb, a dim green for a
// middle or low one, a copper glint for ore, dark for nothing. Four may be pulled before the 九层
// come this way. Grade rich (a high-grade herb among them) · plain, written as a mark.
// Pure module: newGame / html / act.
import { rng, shuffled } from './seeded.js';
import { btn, scene, skipped, splash } from './ink.js';

export const meta = {
  id: 'gather',
  name: { zh: '拾遗 · 石缝里的灵草', en: 'Gleaning · Herbs in the cracks' },
  how: {
    zh: '河床的石缝里，有的透着光：金的是上品灵草，暗绿的是中品下品，铜色一闪的是矿，黑的什么也没有。只拔得了四处，那几个九层就要过来了。',
    en: 'Some cracks in the riverbed glow: gold is a high-grade herb, dim green a middle or low one, a copper glint is ore, and dark is nothing. You can pull four before the ninth-layers come this way.',
  },
};

export const CRACKS = ['high', 'mid', 'mid', 'low', 'low', 'low', 'ore', 'none', 'none'];
export const PULLS = 4;
const GLOW = { high: 'gold', mid: 'green', low: 'green', ore: 'copper', none: 'dark' };

const T = {
  zh: {
    ready: '暗河干了，露了底。石缝里一丛一丛，有的透着光；壁上一道铜矿。远处那头，有人在拔草，一袖子一袖子地往里揣。', crack: '缝',
    gold: '金光', green: '暗绿', copper: '铜色', dark: '黑', pulled: '已拔', left: '还能拔 {n} 处',
    high: '三片叶子，紫里透金——上品。你小心连根拔了起来。', mid: '一丛中品，叶子还嫩。', low: '下品，几根细草，也收了。',
    ore: '一块铜矿石，敲下来，沉甸甸的。', none: '扒开一看，什么也没有，一手的灰。',
    rich: '远处脚步声近了。你把怀里的东西按了按，退进了黑里——里头有一株上品。', plain: '远处脚步声近了。你把怀里的东西按了按，退进了黑里。',
    skipped: '你顺手拔了几丛草，退进了黑里。',
  },
  en: {
    ready: 'The underground river has run dry and shows its bed. In the cracks, clump after clump, some glowing; a vein of copper on the wall. At the far end someone is pulling herbs by the sleeveful.', crack: 'Crack',
    gold: 'gold', green: 'dim green', copper: 'copper', dark: 'dark', pulled: 'pulled', left: '{n} more to pull',
    high: 'Three leaves, purple shot with gold — high grade. You ease it out, root and all.', mid: 'A middle-grade clump, the leaves still tender.', low: 'Low grade, a few thin stems — you take them anyway.',
    ore: 'A lump of copper ore, knocked loose, heavy in the hand.', none: 'You part it — nothing, a handful of grit.',
    rich: 'Footsteps come nearer. You press what you hold to your chest and back into the dark — a high-grade herb among it.', plain: 'Footsteps come nearer. You press what you hold to your chest and back into the dark.',
    skipped: 'You pull a few clumps on your way and back into the dark.',
  },
};

export function newGame(seed) {
  const rnd = rng(`gather:${seed}`);
  return { seed: String(seed), cracks: shuffled(CRACKS, rnd), taken: [], last: null, t: 0, note: 'ready', won: false, grade: null };
}

const VERBS = {
  pull: (s, d) => {
    const i = Number(d.i);
    if (!(i >= 0 && i < s.cracks.length) || s.taken.includes(i)) return null;
    const taken = [...s.taken, i], kind = s.cracks[i];
    if (taken.length < PULLS) return { ...s, taken, last: i, t: s.t + 1, note: kind };
    const grade = taken.some((k) => s.cracks[k] === 'high') ? 'rich' : 'plain';
    return { ...s, taken, last: i, t: s.t + 1, won: true, grade, note: grade };
  },
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* ── The picture: the dry bed in ink, nine cracks along it, each glowing as it holds; a pulled
   one is an empty ink stroke, the last one pulled marked with a small splash. */
function bedScene(state) {
  const bed = '<path class="g-rock" d="M0 0 H320 V40 Q160 56 0 40Z"/><path class="g-line" d="M0 112 Q160 96 320 112"/><path class="g-line g-thin g-faint" d="M0 40 Q160 56 320 40"/>';
  const cracks = state.cracks.map((kind, i) => {
    const x = 24 + i * 34, y = 78 + (i % 2) * 10, gone = state.taken.includes(i);
    const glow = gone || kind === 'none' ? '' : `<circle cx="${x}" cy="${y - 4}" r="${kind === 'high' ? 6 : 4}" class="g-glow g-glow-${GLOW[kind]}"/>`;
    return `<path class="g-line${gone ? ' g-faint' : ''}" d="M${x - 8} ${y} l6 -3 l4 4 l6 -3"/>${glow}`;
  }).join('');
  const last = state.last != null ? splash(24 + state.last * 34, 78 + (state.last % 2) * 10, 300, { r: 7, seal: state.cracks[state.last] === 'high' }) : '';
  return scene(320, 120, bed + cracks + last);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-gather g-ink is-won">${bedScene(state)}<p class="g-line-say">${t[state.note] ?? ''}</p></div>`;
  const tags = state.cracks.map((kind, i) => {
    const gone = state.taken.includes(i);
    return `<button type="button" class="g-tag${gone ? ' is-tried' : ''}" data-g="pull" data-i="${i}"${gone ? ' disabled' : ''}>${t.crack} ${i + 1}<small>${gone ? t.pulled : t[GLOW[kind]]}</small></button>`;
  }).join('');
  const left = `<p class="g-meter small">${t.left.replace('{n}', String(PULLS - state.taken.length))}</p>`;
  return `<div class="g-gather g-ink">${bedScene(state)}<div class="g-tags">${tags}</div>${left}<p class="g-line-say">${t[state.note] ?? ''}</p></div>`;
}
