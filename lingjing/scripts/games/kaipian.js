// 念开篇 · 洛书 — 古六, the cliff top (wm-heluo; the per-回 plan, 2026-10-15). The book: 瞿老 pushes
// the bamboo slips at him — 「《河洛剑诀》。你念开篇。」 — and the first slip is no words but nine numbers,
// three to a row, a 五 in the middle; he does not look at it, he says it: 「戴九履一，左三右七，二四为肩，
// 六八为足，五居中央。」 The 洛书 board (luoshu.js, the cauldron seals) played as that recitation:
// each phrase of his mother's rhyme puts its numbers in their places on the nine squares, and when
// the five sits in the middle every line is fifteen. A wrong square is only 「不是那一格」. No grade.
// Pure module: newGame / html / act. Drawn with luoshu.css's squares.
import { btn, skipped } from './ink.js';
import { isMagic, LINES } from './luoshu.js';

export const meta = {
  id: 'kaipian',
  name: { zh: '念开篇 · 洛书', en: 'Reciting the opening · The Luo Shu' },
  how: {
    zh: '照你娘教的念：戴九履一，左三右七，二四为肩，六八为足，五居中央。一句一句落进九格。',
    en: 'Say it as your mother taught you: nine on the head, one on the feet, three left, seven right, two and four the shoulders, six and eight the feet, five in the middle. Phrase by phrase into the nine squares.',
  },
};

// The square as the rhyme lays it (head up, the viewer's left is 左): 4 9 2 / 3 5 7 / 8 1 6.
export const SQUARE = [4, 9, 2, 3, 5, 7, 8, 1, 6];
export const PHRASES = [
  { zh: '戴九', en: 'Nine on the head', nums: [9] }, { zh: '履一', en: 'one under the feet', nums: [1] },
  { zh: '左三', en: 'three on the left', nums: [3] }, { zh: '右七', en: 'seven on the right', nums: [7] },
  { zh: '二四为肩', en: 'two and four the shoulders', nums: [2, 4] }, { zh: '六八为足', en: 'six and eight the feet', nums: [6, 8] },
  { zh: '五居中央', en: 'five in the middle', nums: [5] },
];
const ORDER = PHRASES.flatMap((p, i) => p.nums.map((n) => ({ n, i })));

const T = {
  zh: {
    ready: '瞿老把竹简推到你面前：「《河洛剑诀》。你念开篇。」头一片上刻的不是字，是九个数，三三一排，中间一个「五」。', start: '不看竹简，念',
    say: '念：', place: '——{n}，落在哪一格？', wrong: '不是那一格。', right: '对。',
    done: '「戴九履一，左三右七，二四为肩，六八为足，五居中央。」纵、横、斜，都是十五。崖顶上很静。瞿老：「……你没看竹简。」',
    skipped: '「戴九履一，左三右七，二四为肩，六八为足，五居中央。」',
  },
  en: {
    ready: 'Elder Qu pushes the bamboo slips toward you. "The Heluo Sword Canon. Recite the opening." The first slip is cut not with words but with nine numbers, three to a row, a five in the middle.', start: 'Don\'t look — recite',
    say: 'Say: ', place: ' — {n}: which square?', wrong: 'Not that square.', right: 'Yes.',
    done: '"Nine on the head, one under the feet, three left, seven right, two and four the shoulders, six and eight the feet, five in the middle." Down, across and corner to corner, fifteen. The cliff top is very still. Elder Qu: "…You didn\'t look at the slips."',
    skipped: '"Nine on the head, one under the feet… five in the middle."',
  },
};

export function newGame(seed) {
  return { seed: String(seed), phase: 'ready', cells: Array(9).fill(0), k: 0, wrongs: 0, note: 'ready', won: false, grade: null };
}

export const stuck = (s) => s.wrongs >= 6;

function cell(s, d) {
  const i = Number(d.i);
  if (s.phase !== 'say' || !(i >= 0 && i < 9) || s.cells[i]) return null;
  const want = ORDER[s.k].n;
  if (SQUARE[i] !== want) return { ...s, wrongs: s.wrongs + 1, note: 'wrong' };
  const cells = s.cells.map((v, j) => (j === i ? want : v)), k = s.k + 1;
  if (k < ORDER.length) return { ...s, cells, k, note: 'right' };
  return { ...s, cells, k, phase: 'done', won: isMagic(cells), note: 'done' };
}

const VERBS = {
  start: (s) => (s.phase === 'ready' ? { ...s, phase: 'say', note: 'say' } : null),
  cell,
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

const sum = (cells, l) => (l.every((i) => cells[i]) ? l.reduce((a, i) => a + cells[i], 0) : null);

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const rows = [0, 1, 2].map((r) => [0, 1, 2].map((c) => {
    const i = r * 3 + c, v = state.cells[i];
    return `<button type="button" class="g-luoshu-cell ${v ? 'is-placed' : 'is-empty'}" data-g="cell" data-i="${i}"${v || state.won ? ' disabled' : ''}>${v || ''}</button>`;
  }).join('') + `<span class="g-luoshu-sum${sum(state.cells, LINES[r]) === 15 ? ' is-ok' : ''}">${sum(state.cells, LINES[r]) ?? '·'}</span>`).join('');
  const board = `<div class="g-luoshu-board">${rows}</div>`;
  if (state.won || state.phase === 'done') return `<div class="g-luoshu g-kaipian g-ink is-won">${board}<p class="g-line-say">${state.k >= ORDER.length ? t.done : t.skipped}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-luoshu g-kaipian g-ink"><p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
  const cur = ORDER[state.k], p = PHRASES[cur.i];
  const said = PHRASES.slice(0, cur.i).map((x) => x[lang] ?? x.zh).join(lang === 'en' ? ', ' : '，');
  const lead = state.note === 'wrong' ? `${t.wrong} ` : '';
  return `<div class="g-luoshu g-kaipian g-ink">${board}<p class="g-line-say">${lead}${said ? `<span class="g-faint">${said}${lang === 'en' ? ', ' : '，'}</span>` : ''}<b>${p[lang] ?? p.zh}</b>${t.place.replace('{n}', cur.n)}</p></div>`;
}
