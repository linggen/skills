// 算账 · 皮抵去年的欠，肉二十斤抵今年的 — 古二, 立冬 (00-rent; Hanli 2026-10-14).
// The book: 马三 takes the hide for last year's arrears and twenty 斤 of meat for
// this year's rent; his men weigh it on the steelyard. The player lays it out:
// the hide first, then the cuts of a deer that has three legs (the fourth went
// to 吴婆婆 before dawn) onto the pan until the beam reads twenty. Light, the
// men will not take it; over, the extra goes up the hill with them. Exactly
// twenty keeps the most at home. It never fails: the `grade` (exact · over) is
// written as a mark, and the scene's own choices follow as before.
// Pure module: newGame / html / act.
import { rng, shuffled } from './seeded.js';
import { btn, n, scene, splash } from './ink.js';
import { mountPure } from './mount.js';
import * as self from './scale.js';

export const meta = {
  id: 'scale',
  name: { zh: '算账 · 皮抵欠，肉抵租', en: 'Settling up · Hide for the arrears, meat for the rent' },
  how: {
    zh: '先交鹿皮，再把肉一块块搁上秤，凑够二十斤——多一两也是马家的。',
    en: 'Hand over the hide, then lay the meat on the pan to make twenty catties — every ounce over goes to the Mas.',
  },
};

export const RENT = 20; // 斤 of meat, this year's rent
export const CUTS = [
  { id: 'hind', jin: 7, zh: '后腿', en: 'Hind leg' },
  { id: 'fore1', jin: 5, zh: '前腿', en: 'Foreleg' },
  { id: 'fore2', jin: 5, zh: '前腿', en: 'Foreleg' },
  { id: 'ribs', jin: 4, zh: '肋条', en: 'Ribs' },
  { id: 'loin', jin: 3, zh: '脊肉', en: 'Loin' },
  { id: 'neck', jin: 2, zh: '脖子肉', en: 'Neck' },
  { id: 'scraps', jin: 1, zh: '碎肉', en: 'Scraps' },
];
const ALL = CUTS.reduce((n, c) => n + c.jin, 0);

const T = {
  zh: {
    hide: '马三拎起鹿皮抖了几抖：「皮，抵去年欠下的。」',
    handHide: '交出鹿皮', hideGone: '鹿皮搭上了马三的肩膀。肉，二十斤，抵今年的。',
    pan: '秤盘', weigh: '称', home: '家里留下', jin: '斤',
    on: '搁上秤盘。', off: '拿了下来。',
    light: '家丁把秤杆一拨：「不够。」',
    exact: '秤杆平平的，二十斤，不多不少。家丁撇撇嘴，拎走了。',
    over: '秤杆翘得老高。多出来的 {x} 斤，家丁一并拎走了，没人吭声。',
  },
  en: {
    hide: 'Ma San picks up the hide and shakes it out: "The hide, for last year\'s arrears."',
    handHide: 'Hand over the hide', hideGone: "The hide goes over Ma San's shoulder. Now the meat: twenty catties, for this year.",
    pan: 'The pan', weigh: 'Weigh it', home: 'Kept at home', jin: 'catties',
    on: 'onto the pan.', off: 'taken off.',
    light: 'The man flicks the beam: "Short."',
    exact: 'The beam hangs level: twenty catties, not an ounce over. The man sniffs and carries it off.',
    over: 'The beam kicks high. The {x} catties over go up the hill with the rest, and nobody says a word.',
  },
};

export function newGame(seed) {
  const rnd = rng(`scale:${seed}`);
  return { seed: String(seed), order: shuffled(CUTS.map((c) => c.id), rnd), hide: false, pan: [], lights: 0, last: null, note: 'hide', won: false, grade: null };
}

export const weightOf = (pan) => pan.reduce((n, id) => n + (CUTS.find((c) => c.id === id)?.jin ?? 0), 0);

const VERBS = {
  hide: (s) => (s.hide ? null : { ...s, hide: true, note: 'hideGone' }),
  cut: (s, d) => {
    if (!s.hide || !CUTS.some((c) => c.id === d.id)) return null;
    const on = s.pan.includes(d.id);
    return { ...s, pan: on ? s.pan.filter((x) => x !== d.id) : [...s.pan, d.id], last: d.id, note: on ? 'off' : 'on' };
  },
  weigh: (s) => {
    if (!s.hide || !s.pan.length) return null;
    const w = weightOf(s.pan);
    if (w < RENT) return { ...s, lights: s.lights + 1, note: 'light' };
    const grade = w === RENT ? 'exact' : 'over';
    return { ...s, won: true, grade, note: grade };
  },
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

function lineOf(s, t, lang) {
  if (s.note === 'on' || s.note === 'off') {
    const c = CUTS.find((x) => x.id === s.last);
    return `${c?.[lang] ?? c?.zh ?? ''}${lang === 'en' ? ' ' : ''}${t[s.note]}`;
  }
  if (s.note === 'over') return t.over.replace('{x}', String(weightOf(s.pan) - RENT));
  return t[s.note] ?? '';
}

/* ── The picture (2026-10-14): a steelyard (杆秤) in ink — the hook, the beam tipping with the
   load, the pan on its three cords with the cuts piled on it, the weight on its loop — and the
   hide (its 图鉴 picture) before it goes over 马三's shoulder. */
const HIDE = '../worlds/jiuding/art/items/deer-hide.webp';
function scaleScene(state, w) {
  const tilt = Math.max(-1, Math.min(1, (w - RENT) / 8)), a = -tilt * 12, rad = a * Math.PI / 180;
  const px = 160, py = 40, end = (dx) => [n(px + dx * Math.cos(rad)), n(py + dx * Math.sin(rad))];
  const [lx, ly] = end(-100), [rx, ry] = end(92);
  const ticks = [20, 34, 48, 62, 76].map((d) => { const [x, y] = end(d); return `<path class="g-line g-thin g-faint" d="M${x} ${y - 3} v6"/>`; }).join('');
  const beam = `<path class="g-line g-hook" d="M160 4 v12 q0 6 -5 6"/><path class="g-beam" d="M${lx} ${ly} L${rx} ${ry}"/>${ticks}`;
  const panY = ly + 62;
  const cords = `<path class="g-line g-thin" d="M${lx} ${ly} L${n(lx - 30)} ${n(panY)} M${lx} ${ly} L${lx} ${n(panY)} M${lx} ${ly} L${n(lx + 30)} ${n(panY)}"/>`;
  const pan = `<path class="g-line" d="M${n(lx - 36)} ${n(panY)} Q${lx} ${n(panY + 14)} ${n(lx + 36)} ${n(panY)}"/>`;
  const meat = state.pan.map((id, i) => `<ellipse class="g-meat" cx="${n(lx - 18 + (i % 3) * 18)}" cy="${n(panY - 4 - Math.floor(i / 3) * 8)}" rx="${n(6 + (CUTS.find((c) => c.id === id)?.jin ?? 1))}" ry="5"/>`).join('');
  const wt = `<path class="g-line g-thin" d="M${rx} ${ry} v18"/><path class="g-weight" d="M${n(rx - 9)} ${n(ry + 18)} h18 l-3 16 h-12z"/>`;
  const read = `<text class="g-count g-small" x="${px}" y="${n(py + 26)}" text-anchor="middle">${w}</text>`;
  const hide = state.hide ? '' : `<image href="${HIDE}" x="196" y="66" width="118" height="92" preserveAspectRatio="xMidYMid meet"/>`;
  const fx = state.won ? splash(n(lx + 44), n(panY - 14), 420, { r: 9, seal: state.grade === 'exact' }) : state.note === 'light' ? splash(lx, n(panY + 10), 420, { r: 7 }) : '';
  return scene(320, 160, beam + cords + pan + meat + wt + read + hide + fx);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const w = weightOf(state.pan);
  const home = `<div class="g-scale-home g-head"><span>${t.pan} <b>${w}</b> / ${RENT} ${t.jin}</span><span>${t.home} <b>${ALL - w}</b> ${t.jin}</span></div>`;
  if (state.won) return `<div class="g-scale g-ink is-won">${scaleScene(state, w)}${home}<p class="g-line-say">${lineOf(state, t, lang)}</p></div>`;
  if (!state.hide) return `<div class="g-scale g-ink">${scaleScene(state, w)}<p class="g-line-say">${t.hide}</p>${btn(t.handHide, 'data-g="hide"')}</div>`;
  const cuts = state.order.map((id) => {
    const c = CUTS.find((x) => x.id === id), on = state.pan.includes(id);
    return `<button type="button" class="g-tag${on ? ' is-on' : ''}" data-g="cut" data-id="${id}" aria-pressed="${on}">${c[lang] ?? c.zh}<small>${c.jin} ${t.jin}</small></button>`;
  }).join('');
  return `<div class="g-scale g-ink">${scaleScene(state, w)}${home}<div class="g-tags">${cuts}</div>`
    + `<p class="g-line-say">${lineOf(state, t, lang)}</p>`
    + btn(t.weigh, `data-g="weigh"${state.pan.length ? '' : ' disabled'}`) + `</div>`;
}

/** The small-game contract (mount.js): this board alone in a container — the 游戏厅, a try page, or a beat's host. */
export const mount = (container, opts) => mountPure(self)(container, opts);
