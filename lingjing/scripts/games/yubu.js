// 禹步 · 九格 — the shared Step-of-Yu board (the per-回 plan, 2026-10-15). 瞿老's nine squares on
// the bluestone, laid as 洛书 (戴九履一，左三右七，二四为肩，六八为足，五居中央), and his walk: 「左脚先出，
// 右脚从左脚后头绕过去，左脚再跟上右脚，并住——三下，才算一步」. Each step is those three beats —
// 左脚 → 右脚绕 → the square it lands on (the next number) — and the walk takes the squares 一 to 九.
// A beat out of order, or the wrong square, is 「自己绊了自己一下」; beats snatched too fast are
// footfalls heard. Never a fail: a trip only starts that step again. Grade quiet (「猎户的脚」) · loud.
// A stop is data (STOPS): 'jiuge' is 古七's 崖顶 lesson (09-jiuge); 古九's 量河滩 ('tan') is meant to
// be added the same way. Pure: makeYubu(stop) → { meta, newGame, act, tick, html, stuck }.
import { btn, n, scene, skipped, splash } from './ink.js';

const ART = new URL('./boards/', import.meta.url).href;

export const GRID = [4, 9, 2, 3, 5, 7, 8, 1, 6]; // row by row: 戴九履一，左三右七，二四为肩，六八为足，五居中央
export const HASTE = 180; // ms: a beat faster than this is a footfall heard
const NUM = { zh: ['一', '二', '三', '四', '五', '六', '七', '八', '九'], en: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] };

export const STOPS = {
  jiuge: {
    name: { zh: '禹步 · 九格', en: 'The Step of Yu · Nine squares' },
    how: { zh: '一步三下：「左脚」先出，「右脚」从左脚后头绕过去，再踏进下一格，并住。从一走到九——一是履一，九是戴九。', en: 'Three beats a step: "Left foot" out first, "Right foot" round behind it, then step into the next square and close. Walk from one to nine — one at the foot, nine at the head.' },
    zh: {
      ready: '「九格你摆得出来，走却是另一回事。」瞿老道，「照着我的脚，走一遍。」', start: '照着走',
      walk: '左脚先出，右脚从左脚后头绕过去，左脚再跟上右脚，并住。', left: '左脚', right: '右脚绕', l1: '左脚出去了。', r1: '右脚绕过去了——踏哪一格？',
      trip: '右脚绕过左脚的时候，自己绊了自己一下。', loud: '脚下「嚓」的一响。猎户走路本来没有声息。', step: '并住。', steps: '步',
      quiet: '他走完九格，站在中宫，一点声息也没有。瞿老背对着他道：「猎户的脚。」', loudly: '他走完了九格，站在中宫。瞿老扫着青石上的雪末子，道：「再走。脚落下去，先落脚尖。」',
      skipped: '瞿老走完九格，站在中宫，道：「这叫禹步。」',
    },
    en: {
      ready: '"Laying out nine squares is one thing; walking them is another," said Elder Qu. "Follow my feet. Walk it once."', start: 'Follow',
      walk: 'Left foot out first, right foot round behind the left, then the left comes up to the right and closes.', left: 'Left foot', right: 'Right foot round', l1: 'The left foot is out.', r1: 'The right foot is round — which square?',
      trip: 'As his right foot went round the left, he tripped himself.', loud: 'A scrape underfoot. A hunter\'s walk makes no sound.', step: 'Close.', steps: 'Step',
      quiet: 'He walked all nine squares and stood in the centre palace without a sound. With his back to him, Elder Qu said, "A hunter\'s feet."', loudly: 'He walked all nine and stood in the centre palace. Elder Qu, sweeping the snow off the bluestone, said, "Again. When the foot comes down, toes first."',
      skipped: 'Elder Qu walked the nine squares and stood in the centre palace. "This is called the Step of Yu."',
    },
  },
};

export function makeYubu(stop) {
  const S = STOPS[stop];
  const meta = { id: `yubu${stop}`, name: S.name, how: S.how };
  const newGame = (seed) => ({ seed: String(seed), phase: 'ready', live: false, t: 0, k: 0, beat: 0, last: -1e9, trips: 0, loud: 0, fx: null, note: 'ready', won: false, grade: null });
  const heard = (s) => (s.t - s.last < HASTE ? 1 : 0);
  const trip = (s) => ({ ...s, beat: 0, trips: s.trips + 1, note: 'trip', fx: { at: s.t, ok: false } });
  const verbs = {
    start: (s) => (s.phase === 'ready' ? { ...s, phase: 'walk', live: true, note: 'walk' } : null),
    left: (s) => (s.phase !== 'walk' ? null : s.beat !== 0 ? trip(s) : { ...s, beat: 1, loud: s.loud + heard(s), last: s.t, note: heard(s) ? 'loud' : 'l1' }),
    right: (s) => (s.phase !== 'walk' ? null : s.beat !== 1 ? trip(s) : { ...s, beat: 2, loud: s.loud + heard(s), last: s.t, note: heard(s) ? 'loud' : 'r1' }),
    sq: (s, d) => {
      if (s.phase !== 'walk') return null;
      if (s.beat !== 2 || Number(d.n) !== s.k + 1) return trip(s);
      const k = s.k + 1, loud = s.loud + heard(s);
      if (k < 9) return { ...s, k, beat: 0, loud, last: s.t, note: heard(s) ? 'loud' : 'step', fx: { at: s.t, ok: true } };
      const grade = s.trips === 0 && loud === 0 ? 'quiet' : 'loud';
      return { ...s, k, beat: 0, loud, live: false, won: true, grade, note: grade, fx: { at: s.t, ok: true } };
    },
    skip: (s) => skipped(s),
  };
  const act = (state, data = {}) => {
    if (!state || state.won) return { state, won: false };
    const next = verbs[data.g]?.(state, data);
    if (!next) return { state, won: false };
    return { state: next, won: next.won === true };
  };
  const tick = (state, ms) => (!state.live || state.won || ms <= 0 ? state : { ...state, t: state.t + ms });

  /* ── The picture: the bluestone's nine squares, a chestnut dot-count in each, the squares walked
     inked over, his foot on the last. */
  function picture(s) {
    const cell = 34, x0 = 109, y0 = 8;
    // painted (tools/paint-boards-flux.py): the clifftop terrace and the bluestone slab; the grid and dots stay drawn
    const ground = `<image href="${ART}yubu-ground.webp" width="320" height="120" preserveAspectRatio="xMidYMid slice"/>`
      + `<image href="${ART}yubu-slab.webp" x="${x0 - 7}" y="${y0 - 6}" width="${cell * 3 + 14}" height="${cell * 3 + 12}" preserveAspectRatio="none"/>`;
    const lines = [0, 1, 2, 3].map((i) => `<path class="g-line g-thin" d="M${x0} ${y0 + i * cell} h${cell * 3} M${x0 + i * cell} ${y0} v${cell * 3}"/>`).join('');
    const marks = GRID.map((v, i) => {
      const cx = x0 + (i % 3) * cell + cell / 2, cy = y0 + Math.floor(i / 3) * cell + cell / 2;
      const walked = v <= s.k, dots = Array.from({ length: v }, (_, j) => `<circle class="g-dot${walked ? ' is-seal' : ''}" cx="${n(cx - 9 + (j % 3) * 9)}" cy="${n(cy - 9 + Math.floor(j / 3) * 9)}" r="2.2"/>`).join('');
      return dots + (v === s.k ? `<circle class="g-line" cx="${n(cx)}" cy="${n(cy)}" r="14"/>` : '');
    }).join('');
    const fx = s.fx ? splash(160, 60, s.t - s.fx.at, { r: 10, seal: s.fx.ok }) : '';
    return scene(320, 120, ground + lines + marks + fx, 'g-yubu-pic');
  }

  function html(state, lang = 'zh') {
    const t = S[lang] || S.zh;
    if (state.won) return `<div class="g-yubu g-ink is-won">${picture(state)}<p class="g-line-say">${t[state.grade === 'loud' ? 'loudly' : state.grade ?? 'skipped']}</p></div>`;
    if (state.phase === 'ready') return `<div class="g-yubu g-ink">${picture(state)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
    const head = `<div class="g-head"><span>${t.steps} <b>${state.k}</b> / 9</span></div>`;
    const feet = `<div class="g-pair">${btn(t.left, 'data-g="left"', state.beat === 0 ? 'main' : 'soft')}${btn(t.right, 'data-g="right"', state.beat === 1 ? 'main' : 'soft')}</div>`;
    const squares = `<div class="g-yubu-grid">${GRID.map((v) => `<button type="button" class="g-tag${v <= state.k ? ' is-tried' : ''}" data-g="sq" data-n="${v}">${NUM[lang]?.[v - 1] ?? v}</button>`).join('')}</div>`;
    return `<div class="g-yubu g-ink">${picture(state)}${head}<p class="g-line-say">${t[state.note] ?? ''}</p>${feet}${squares}</div>`;
  }

  const stuck = (s) => s.trips >= 5;
  return { meta, newGame, act, tick, html, stuck };
}
