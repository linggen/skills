// 认方 · 三张方子 — 古七, 开春 in the 柴房 (09-furnace; the per-回 plan, 2026-10-15). The book: 「他爹说，
// 打猎靠的不是运气，是脚印。他把剩下的半篮按样分成四堆，蹲着把这半个月的脚印一个一个往回认，认了一夜，
// 认出三张方子：黄精搭一块灵石，出聚气丹；黄芪搭一口自己的灵力，出回春丹；紫玉参的断须搭一口灵力，出回气丹
// ……乱搭的，仍旧是灰。」 The half month's footprints are a list of what went in and what came out (the
// seed orders it); the four heaps and the two 引 (a spirit stone, a breath of his own power) are the
// player's to pair, one heap and one 引 a feed. A pairing that is a recipe gives its pill and the
// recipe is found; any other is ash. All three found wins. Never a fail; `stuck` after five ashes.
// Grade clean (at most one ash) · rough. Pure module: newGame / act / html (no clock).
import { btn, n, scene, skipped, splash } from './ink.js';
import { rng, shuffled } from './seeded.js';

export const HEAPS = ['huangjing', 'huangqi', 'danggui', 'ziyu'];
export const YIN = ['stone', 'qi'];
export const RECIPES = [{ heap: 'huangjing', yin: 'stone', pill: 'juqi' }, { heap: 'huangqi', yin: 'qi', pill: 'huichun' }, { heap: 'ziyu', yin: 'qi', pill: 'huiqi' }];
/* The half month's footprints: the three that worked, and the mixes that came out ash. */
const TRACKS = [
  { in: ['huangjing', 'stone'], out: 'juqi' }, { in: ['huangqi', 'qi'], out: 'huichun' }, { in: ['ziyu', 'qi'], out: 'huiqi' },
  { in: ['huangqi', 'stone'], out: 'ash' }, { in: ['huangjing', 'qi'], out: 'ash' }, { in: ['danggui', 'stone'], out: 'ash' }, { in: ['huangjing', 'danggui', 'qi'], out: 'ash' },
];

export const meta = {
  id: 'recipe',
  name: { zh: '认方 · 三张方子', en: 'Reading the recipes · Three of them' },
  how: {
    zh: '把这半个月的脚印往回认：哪一堆搭哪一样，出哪一颗丹。挑一堆，挑一样引子，喂进去——乱搭的，仍旧是灰。',
    en: 'Trace back the half month\'s footprints: which heap with which, gave which pill. Pick a heap, pick a starter, feed it in — mixed any other way, it is still ash.',
  },
};

const T = {
  zh: {
    ready: '他爹说，打猎靠的不是运气，是脚印。他把剩下的半篮按样分成四堆，蹲下来。', start: '往回认',
    huangjing: '黄精', huangqi: '黄芪', danggui: '当归', ziyu: '紫玉参断须', stone: '一块灵石', qi: '一口灵力',
    juqi: '聚气丹', huichun: '回春丹', huiqi: '回气丹', ash: '灰',
    tracks: '这半个月的脚印', heaps: '四堆', yin: '引子', feed: '喂', pick: '挑一堆，再挑一样引子。', found: '认出一张方子：', again: '乱搭的，仍旧是灰。', known: '这一张，已经认出来了。',
    clean: '认了一夜，认出三张方子。方子他一个字也没往纸上写，记在肚里。', rough: '灰喂出了好几捧，天亮前到底认出了三张方子。方子他记在肚里。',
    skipped: '认了一夜，认出三张方子：黄精搭一块灵石，出聚气丹；黄芪搭一口灵力，出回春丹；紫玉参的断须搭一口灵力，出回气丹。',
  },
  en: {
    ready: 'Father said hunting wasn\'t luck, it was footprints. He sorts the half basket that\'s left into four heaps by kind and squats down.', start: 'Trace them back',
    huangjing: 'Solomon\'s seal', huangqi: 'Milkvetch', danggui: 'Angelica', ziyu: 'Purple jade ginseng whiskers', stone: 'A spirit stone', qi: 'A breath of power',
    juqi: 'Qi-Gathering Pill', huichun: 'Spring-Return Pill', huiqi: 'Qi-Return Pill', ash: 'ash',
    tracks: 'Half a month of footprints', heaps: 'Four heaps', yin: 'Starter', feed: 'Feed', pick: 'Pick a heap, then a starter.', found: 'A recipe worked out: ', again: 'Mixed any other way, it is still ash.', known: 'That one is already worked out.',
    clean: 'It took him all night, and he worked out three recipes. He didn\'t write a single word of them on paper. He kept them in his belly.', rough: 'Several handfuls of ash later, before dawn, he had the three recipes worked out. He kept them in his belly.',
    skipped: 'It took all night, and he worked out three recipes: solomon\'s seal with a spirit stone gave a Qi-Gathering Pill; milkvetch with a breath of power, a Spring-Return Pill; purple jade ginseng whiskers with a breath of power, a Qi-Return Pill.',
  },
};

export function newGame(seed) {
  return { seed: String(seed), phase: 'ready', order: shuffled(TRACKS.map((_, i) => i), rng(`${seed}|tracks`)), heap: null, yin: null, found: [], ash: 0, last: null, note: 'ready', won: false, grade: null };
}
export const stuck = (s) => s.ash >= 5;
export const recipeOf = (heap, yin) => RECIPES.find((r) => r.heap === heap && r.yin === yin) ?? null;

const VERBS = {
  start: (s) => (s.phase === 'ready' ? { ...s, phase: 'sort', note: 'pick' } : null),
  heap: (s, d) => (s.phase === 'sort' && HEAPS.includes(d.h) ? { ...s, heap: d.h } : null),
  yin: (s, d) => (s.phase === 'sort' && YIN.includes(d.y) ? { ...s, yin: d.y } : null),
  feed: (s) => {
    if (s.phase !== 'sort' || !s.heap || !s.yin) return null;
    const r = recipeOf(s.heap, s.yin), base = { ...s, heap: null, yin: null };
    if (!r) return { ...base, ash: s.ash + 1, last: 'ash', note: 'again' };
    if (s.found.includes(r.pill)) return { ...base, last: r.pill, note: 'known' };
    const found = [...s.found, r.pill];
    if (found.length < RECIPES.length) return { ...base, found, last: r.pill, note: 'found' };
    const grade = s.ash <= 1 ? 'clean' : 'rough';
    return { ...base, found, last: r.pill, won: true, grade, note: grade };
  },
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* ── The picture: four little heaps on the woodshed floor, a seal for each pill found. */
function picture(s) {
  const heaps = HEAPS.map((h, i) => `<path class="g-line${s.heap === h ? '' : ' g-thin'}" d="M${40 + i * 62} 100 q22 -26 44 0 Z"/>`).join('');
  const seals = s.found.map((_, i) => `<circle class="g-dot is-seal" cx="${n(250 + i * 18)}" cy="30" r="6"/>`).join('');
  const fx = s.last === 'ash' ? splash(160, 60, 300, { r: 10 }) : '';
  return scene(320, 116, heaps + seals + fx);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-recipe g-ink is-won">${picture(state)}<p class="g-line-say">${t[state.grade ?? 'skipped']}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-recipe g-ink">${picture(state)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
  const tracks = `<div class="g-diche-page g-recipe-tracks"><small>${t.tracks}</small>${state.order.map((i) => `<p>${TRACKS[i].in.map((x) => t[x]).join(lang === 'zh' ? '、' : ', ')} —— <b>${t[TRACKS[i].out]}</b></p>`).join('')}</div>`;
  const say = state.note === 'found' ? `${t.found}${t[state.last]}` : t[state.note] ?? '';
  const heaps = `<div class="g-tags">${HEAPS.map((h) => `<button type="button" class="g-tag${state.heap === h ? ' is-held' : ''}" data-g="heap" data-h="${h}">${t[h]}</button>`).join('')}</div>`;
  const yin = `<div class="g-pair">${YIN.map((y) => btn(t[y], `data-g="yin" data-y="${y}"`, state.yin === y ? 'main' : 'soft')).join('')}</div>`;
  const head = `<div class="g-head"><span>${state.found.map((p) => t[p]).join(' · ') || '—'}</span></div>`;
  return `<div class="g-recipe g-ink">${picture(state)}${head}${tracks}<p class="g-line-say">${say}</p>${heaps}${yin}${btn(t.feed, 'data-g="feed"', state.heap && state.yin ? 'main' : 'soft')}</div>`;
}
