// 照着走 — Simon on the nine squares (2026-10-27, in 禹步 · 九格's place: that board was home-made, Hanli's rule 「只用经典」).
// The classic memory-sequence game (Simon, Milton Bradley 1978; the KDE game Blinken): the board lights a run of squares
// and sounds each its own note; you tap the same run back; every round it adds one more. Rules only — Blinken is
// GPL-2.0-or-later, so no code, art or sound of it is used (scripts/vendor/VENDOR.md § 照着走). Two rules are the
// original's: the run grows by one a round, and it quickens at its 5th, 9th and 13th step. One is this kit's own, as
// every board here is never a fail: a wrong square is a trip, and the same run is shown again.
//
// The squares are the 洛书 (戴九履一，左三右七，二四为肩，六八为足，五居中央), the chestnut dots on each its number; the
// keys 1–9 tap the square of that number. The picture is painted (tools/paint-boards-flux.py: the clifftop terrace and the
// bluestone slab, kept from the board this one replaced); the dots, the lit square and the footprint are drawn over it.
//
// Levels by number (a task's `deal.lv`; else `level`):
//   0  the nine squares each once, in an order the seed picks, ending in 中五 — runs 4 → 9 (a first meeting: 古七's 崖顶)
//   1  any squares, 3 → 10          2  any squares, 4 → 14, quicker          3  any squares, 5 → 18, quicker still
// A deal's `lines` ({zh, en}: ready · start · show · go · step · trip · quiet · loudly · skipped) are the story's words
// for its stop; the kit's own stand where it gives none. Grade: quiet (no trip) · loud.
// Pure: newGame / act / tick / html / stuck / sounds; `mount` is mount.js mountPure.
import { mountPure } from './mount.js';
import { btn, n, skipped } from './ink.js';
import { rng, shuffled } from './seeded.js';

const ART = new URL('./boards/', import.meta.url).href;

export const GRID = [4, 9, 2, 3, 5, 7, 8, 1, 6]; // row by row: 戴九履一，左三右七，二四为肩，六八为足，五居中央
const NUM = { zh: ['一', '二', '三', '四', '五', '六', '七', '八', '九'], en: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] };

export const LEVELS = {
  0: { walk: 'nine', from: 4, to: 9, on: 620, off: 220 },
  1: { walk: 'free', from: 3, to: 10, on: 560, off: 200 },
  2: { walk: 'free', from: 4, to: 14, on: 480, off: 170 },
  3: { walk: 'free', from: 5, to: 18, on: 420, off: 150 },
};
export const LEAD = 700; // ms before a run is shown (the eye finds the board)
export const QUICKEN = [5, 9, 13]; // the original's: the run quickens at these steps
/** How long a run of `len` holds each square lit, and the gap: a fifth quicker at each of QUICKEN passed. */
export function tempo(L, len) {
  const k = 0.82 ** QUICKEN.filter((q) => len >= q).length;
  return { on: Math.round(L.on * k), off: Math.round(L.off * k) };
}

export const meta = {
  id: 'simon',
  sounds: ['note', 'trip', 'good'],
  name: { zh: '照着走', en: 'Follow me' },
  how: {
    zh: '先看：九格一格一格亮，每格一个音。再照着点回去，一格不差。每过一轮，多走一格。点错了不算输，再看一遍。',
    en: 'Watch first: the squares light one by one, each with its own note. Then tap them back in the same order. Each round adds one more. A wrong square is no loss: watch it again.',
  },
  keys: Object.fromEntries(GRID.map((v) => [String(v), { g: 'sq', n: String(v) }])),
};

const KIT = {
  zh: { ready: '九格亮一遍，你照着走一遍。', start: '开始', show: '看。', go: '该你了。', step: '对。', trip: '错了一格——再看一遍。',
    quiet: '一格不差，走完了。', loudly: '绊了几回，到底走完了。', skipped: '这一回不走了。', round: '第', rounds: '轮' },
  en: { ready: 'The squares light up once; you walk them back.', start: 'Start', show: 'Watch.', go: 'Your turn.', step: 'Yes.',
    trip: 'One square wrong. Watch again.', quiet: 'Not one square wrong, all the way.', loudly: 'A few slips, but walked to the end.',
    skipped: 'Not this time.', round: 'Round', rounds: '' },
};

/** The level a deal plays: `deal.lv`, else `level`, held to the ladder. */
export function levelOf(level, deal) {
  const want = deal?.lv != null && LEVELS[Number(deal.lv)] ? Number(deal.lv) : Number(level);
  return LEVELS[want] ? want : 1;
}

/** The whole run, dealt once: the nine each once ending in 中五, or any squares never the same twice running. */
export function runOf(L, seed) {
  const rand = rng(`simon|${seed}`);
  if (L.walk === 'nine') return [...shuffled([1, 2, 3, 4, 6, 7, 8, 9], rand), 5];
  const out = [];
  while (out.length < L.to) {
    const v = 1 + Math.floor(rand() * 9);
    if (v !== out[out.length - 1]) out.push(v);
  }
  return out;
}

export function newGame(seed = '', level = 1, deal = {}) {
  const lv = levelOf(level, deal), L = LEVELS[lv];
  const lines = deal?.lines && typeof deal.lines === 'object' ? deal.lines : null;
  return { seed: String(seed), level: lv, run: runOf(L, seed), len: L.from, to: L.to, phase: 'ready', live: false, t: 0, at: 0, i: 0,
    trips: 0, note: 'ready', fx: null, won: false, grade: null, lines };
}

/** The square lit now while a run is shown: { j, v } or null (between two, or not showing). */
export function litOf(s) {
  if (s.phase !== 'show') return null;
  const { on, off } = tempo(LEVELS[s.level], s.len), dt = s.t - s.at - LEAD;
  if (dt < 0) return null;
  const j = Math.floor(dt / (on + off));
  return j < s.len && dt - j * (on + off) < on ? { j, v: s.run[j] } : null;
}
const showEnd = (s) => { const { on, off } = tempo(LEVELS[s.level], s.len); return s.at + LEAD + s.len * (on + off); };
const show = (s, note = 'show') => ({ ...s, phase: 'show', at: s.t, i: 0, note });

const verbs = {
  start: (s) => (s.phase === 'ready' ? show({ ...s, live: true }) : null),
  sq: (s, d) => {
    if (s.phase !== 'input') return null;
    const v = Number(d.n);
    if (!(v >= 1 && v <= 9)) return null;
    if (v !== s.run[s.i]) return show({ ...s, trips: s.trips + 1, fx: { at: s.t, v, ok: false } }, 'trip');
    const i = s.i + 1, fx = { at: s.t, v, ok: true };
    if (i < s.len) return { ...s, i, fx, note: 'step' };
    if (s.len >= s.to) {
      const grade = s.trips === 0 ? 'quiet' : 'loud';
      return { ...s, i, fx, live: false, won: true, grade, note: grade };
    }
    return show({ ...s, len: s.len + 1, fx });
  },
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = verbs[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function tick(state, ms) {
  if (!state.live || state.won || ms <= 0) return state;
  const s = { ...state, t: state.t + ms };
  return s.phase === 'show' && s.t >= showEnd(s) ? { ...s, phase: 'input', i: 0, note: 'go' } : s;
}

export const stuck = (s) => s.trips >= 3;

/* ── The picture: the terrace, nine bluestone slabs laid as the 洛书, his chestnuts on each, the square lit now, the
   squares walked back this round inked. ── */
const FOOT = '<path class="g-simon-foot" d="M12 3c3 0 5 4 5 9s-2 9-5 9-5-3-5-8 2-10 5-10z"/>';
function dots(v) {
  return Array.from({ length: v }, (_, j) => `<circle class="g-simon-dot" cx="${n(8 + (j % 3) * 8)}" cy="${n(8 + Math.floor(j / 3) * 8)}" r="2.6"/>`).join('');
}
function slab(v, s, lit, lang) {
  const walked = s.phase === 'input' && s.run.slice(0, s.i).includes(v);
  const hit = s.fx && s.fx.v === v && s.t - s.fx.at < 360 ? (s.fx.ok ? ' is-hit' : ' is-miss') : '';
  const cls = `g-simon-sq${lit === v ? ' is-lit' : ''}${walked ? ' is-walked' : ''}${hit}`;
  return `<button type="button" class="${cls}" data-g="sq" data-n="${v}" aria-label="${NUM[lang]?.[v - 1] ?? v}"${s.phase !== 'input' ? ' aria-disabled="true"' : ''}>`
    + `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">${dots(v)}${lit === v ? `<g transform="translate(4 4)">${FOOT}</g>` : ''}</svg></button>`;
}

export function html(state, lang = 'zh') {
  const t = { ...KIT.zh, ...(KIT[lang] ?? {}), ...(state.lines?.[lang] ?? state.lines?.zh ?? {}) };
  const lit = litOf(state)?.v ?? null;
  const stage = `<div class="g-simon-stage" style="--g-simon-ground:url(&quot;${ART}yubu-ground.webp&quot;);--g-simon-slab:url(&quot;${ART}yubu-slab.webp&quot;)">`
    + `<div class="g-simon-grid">${GRID.map((v) => slab(v, state, lit, lang)).join('')}</div></div>`;
  if (state.won) return `<div class="g-simon g-ink is-won">${stage}<p class="g-line-say">${t[state.grade === 'loud' ? 'loudly' : state.grade ?? 'skipped']}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-simon g-ink">${stage}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
  const pips = Array.from({ length: state.len }, (_, j) => `<i class="${state.phase === 'input' && j < state.i ? 'is-on' : ''}"></i>`).join('');
  const head = `<div class="g-head g-simon-head"><span>${lang === 'en' ? `${t.round} ${state.len - LEVELS[state.level].from + 1}` : `${t.round}${NUM.zh[state.len - LEVELS[state.level].from] ?? state.len - LEVELS[state.level].from + 1}${t.rounds}`}</span><span class="g-simon-pips">${pips}</span></div>`;
  return `<div class="g-simon g-ink is-${state.phase}">${head}${stage}<p class="g-line-say">${t[state.note] ?? ''}</p></div>`;
}

/** What a step sounded (games/kit/heard.js): each square its own note as it lights or is tapped right (`note`, kind =
    its number), a wrong one (`trip`), a round walked whole (`good`). */
export function sounds(b, a) {
  if (!b || !a) return [];
  if (a.trips > b.trips) return ['trip'];
  if (a.fx !== b.fx && a.fx?.ok) return [{ event: 'note', kind: a.fx.v }, ...(a.len > b.len ? ['good'] : [])];
  const lb = litOf(b), la = litOf(a);
  return la && (!lb || lb.j !== la.j || b.len !== a.len) ? [{ event: 'note', kind: la.v }] : [];
}

export const mount = mountPure({ meta, newGame, act, tick, html, stuck, sounds });
