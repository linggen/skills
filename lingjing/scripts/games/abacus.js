// 算盘 · 一笔一笔地算账 — 古二, the spring 舅舅 comes (00-uncle; batch two, 2026-10-14). The
// book: 舅舅 keeps the books at 济世堂 — after the steps he went down the mountain and learned the
// abacus — and that night 小满 lies on the bed doing his sums, item by item, as 娘 taught him:
// 遇事先算账. Here the sums are the ones the scene has just put in front of him, set on 舅舅's
// abacus — three rods, a five-bead above the beam and four ones below — and checked: the steps
// 舅舅 had still to climb, the 山风钱 for three heads at fifty 文, and the spare days before 九月初九.
// A wrong sum only gets 舅舅's cough; a second, and he pushes the beads into place himself.
// Grade clean · fumbled, written as a mark.
// Pure module: newGame / html / act.
import { btn, scene, skipped, splash } from './ink.js';
import { mountPure } from './mount.js';
import * as self from './abacus.js';

export const meta = {
  id: 'abacus',
  name: { zh: '算盘 · 一笔一笔地算账', en: 'The abacus · Sum by sum' },
  how: {
    zh: '梁上一颗算五，梁下一颗算一。把答数拨上算盘，再对账。',
    en: 'A bead above the beam counts five, a bead below counts one. Set the answer on the abacus, then check it.',
  },
};

export const SUMS = [
  { id: 'steps', answer: 130 },
  { id: 'wind', answer: 150 },
  { id: 'days', answer: 83 },
];
export const RODS = 3; // hundreds, tens, ones

const T = {
  zh: {
    steps: '舅舅说：三百级石阶，他爬到一百七十级。还差几级？', wind: '山风钱，一个人头五十文。沈家三口，一年多少文？', days: '离九月初九，一百八十三日。筑基一百天——还富余几天？',
    check: '对账', clear: '清盘', set: '算盘上', right: '对上了。', wrong: '舅舅咳了一声：「再拨拨。」', shown: '舅舅伸过手来，替你把珠子拨好了：「看，是这个数。」',
    rods: ['百', '十', '个'], sum: '笔',
    clean: '三笔账，都对上了。舅舅推了推算盘：「你娘教的？」', fumbled: '三笔账算完了，有一笔是舅舅替你拨的。他没说什么，只把算盘推了回去。',
    skipped: '那天夜里，你躺在炕上，一笔一笔地算账。',
  },
  en: {
    steps: 'Uncle said: three hundred stone steps, and he got to step one hundred and seventy. How many short?', wind: 'Mountain wind money, fifty coppers a head. Three in the Shen family — how much a year?', days: 'A hundred and eighty-three days till the ninth of the ninth month. A hundred days for Foundation Establishment — how many to spare?',
    check: 'Check it', clear: 'Clear', set: 'On the abacus', right: 'It tallies.', wrong: 'Uncle coughs. "Try the beads again."', shown: 'Uncle reaches over and sets the beads for you. "There. That\'s the number."',
    rods: ['100s', '10s', '1s'], sum: 'sum',
    clean: 'Three sums, all tallied. Uncle pushes the abacus back. "Your mother taught you?"', fumbled: 'Three sums done — one of them set by Uncle\'s hand. He says nothing, and pushes the abacus back.',
    skipped: 'That night you lie on the bed doing your sums, item by item.',
  },
};

export function newGame(seed) {
  return { seed: String(seed), i: 0, rods: [0, 0, 0].map(() => ({ five: false, ones: 0 })), tries: 0, helped: 0, wrongs: 0, fx: null, n: 0, note: 'steps', won: false, grade: null };
}

export const valueOf = (rods) => rods.reduce((v, r) => v * 10 + (r.five ? 5 : 0) + r.ones, 0);
const rodsOf = (v) => String(v).padStart(RODS, '0').split('').map((d) => ({ five: +d >= 5, ones: +d % 5 }));
const blank = () => [0, 0, 0].map(() => ({ five: false, ones: 0 }));

function next(s, note, ok) {
  const i = s.i + 1, n = s.n + 1;
  if (i >= SUMS.length) {
    const grade = s.helped || s.wrongs > 1 ? 'fumbled' : 'clean';
    return { ...s, i, n, fx: { n, ok }, won: true, grade, note: grade };
  }
  return { ...s, i, n, rods: blank(), tries: 0, fx: { n, ok }, note: `${note}|${SUMS[i].id}` };
}

const VERBS = {
  five: (s, d) => { const r = Number(d.r); if (!(r >= 0 && r < RODS)) return null; return { ...s, rods: s.rods.map((x, k) => (k === r ? { ...x, five: !x.five } : x)), note: SUMS[s.i].id }; },
  one: (s, d) => {
    const r = Number(d.r), k = Number(d.k);
    if (!(r >= 0 && r < RODS && k >= 1 && k <= 4)) return null;
    // A bead tapped is pushed up to the beam with those above it; the top one tapped again lets them all down.
    return { ...s, rods: s.rods.map((x, j) => (j === r ? { ...x, ones: x.ones === k ? k - 1 : k } : x)), note: SUMS[s.i].id };
  },
  clear: (s) => ({ ...s, rods: blank(), note: SUMS[s.i].id }),
  check: (s) => {
    const sum = SUMS[s.i];
    if (valueOf(s.rods) === sum.answer) return next(s, 'right', true);
    if (s.tries >= 1) return { ...s, rods: rodsOf(sum.answer), helped: s.helped + 1, wrongs: s.wrongs + 1, tries: 2, note: 'shown' };
    return { ...s, tries: s.tries + 1, wrongs: s.wrongs + 1, note: 'wrong' };
  },
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next2 = VERBS[data.g]?.(state, data);
  if (!next2) return { state, won: false };
  return { state: next2, won: next2.won === true };
}

/* ── The picture: the frame and beam in ink, the three rods with their beads where they stand
   (a five-bead down against the beam when counted, ones pushed up to it), the answer written
   small under each rod; a cinnabar seal when a sum tallies. */
function abacusScene(state) {
  const frame = '<rect class="g-line" x="70" y="10" width="180" height="104" rx="4" fill="none"/><path class="g-beam" d="M70 44 H250"/>';
  const rods = state.rods.map((r, k) => {
    const x = 110 + k * 50;
    const five = `<ellipse class="g-bead${r.five ? ' is-on' : ''}" cx="${x}" cy="${r.five ? 36 : 20}" rx="14" ry="6"/>`;
    const ones = [1, 2, 3, 4].map((b) => `<ellipse class="g-bead${b <= r.ones ? ' is-on' : ''}" cx="${x}" cy="${b <= r.ones ? 44 + b * 12 : 58 + b * 12}" rx="14" ry="6"/>`).join('');
    return `<path class="g-line g-thin" d="M${x} 10 V114"/>${five}${ones}`;
  }).join('');
  const fx = String(state.note).startsWith('right') || state.grade === 'clean' ? splash(160, 64, 260, { r: 12, seal: true }) : '';
  return scene(320, 124, frame + rods + fx);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const head = `<div class="g-head"><span>${t.sum} <b>${Math.min(state.i + 1, SUMS.length)}</b> / ${SUMS.length}</span><span>${t.set} <b>${valueOf(state.rods)}</b></span></div>`;
  if (state.won) return `<div class="g-abacus g-ink is-won">${abacusScene(state)}${head}<p class="g-line-say">${t[state.note] ?? ''}</p></div>`;
  const [lead, q] = String(state.note).includes('|') ? state.note.split('|') : [null, state.note];
  const ask = t[SUMS[state.i].id];
  const say = lead ? `${t[lead]} ${ask}` : ['wrong', 'shown'].includes(q) ? `${t[q]} ${ask}` : ask;
  const pad = state.rods.map((r, k) => `<div class="g-abacus-rod"><span class="g-abacus-name">${t.rods[k]}</span>`
    + `<button type="button" class="g-abacus-bead is-five${r.five ? ' is-on' : ''}" data-g="five" data-r="${k}" aria-pressed="${r.five}">5</button>`
    + [1, 2, 3, 4].map((b) => `<button type="button" class="g-abacus-bead${b <= r.ones ? ' is-on' : ''}" data-g="one" data-r="${k}" data-k="${b}" aria-pressed="${b <= r.ones}">1</button>`).join('')
    + '</div>').join('');
  return `<div class="g-abacus g-ink">${abacusScene(state)}${head}<p class="g-line-say">${say}</p><div class="g-abacus-pad">${pad}</div>`
    + `<div class="g-pair">${btn(t.clear, 'data-g="clear"', 'soft')}${btn(t.check, 'data-g="check"')}</div></div>`;
}

/** Stuck (scripts/stuck.js): four sums wrong — the page may offer 「算了，往下走」 now. */
export const stuck = (s) => (s.wrongs ?? 0) >= 4;

/** The small-game contract (mount.js): this board alone in a container — the 游戏厅, a try page, or a beat's host. */
export const mount = (container, opts) => mountPure(self)(container, opts);
