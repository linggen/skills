// queue.js — one thing at a time on the stage: the book first, then the rest.
//
// Live play of 卷一 (2026-10-01): every mini-game, duel, set piece and 突破
// seal played BEFORE the book passage that leads into it — the box yielded
// the stage to whatever stood in main, so the passage of the choice that led
// there played after it (射鹿, 洗髓, 洛书二试, 蠪侄, 小周天, 狰, 大比, 漳水 and
// 冰夷, 01-cauldron, the 练气 seals). And two moments stood at once (「完」 over
// 所得, 突破 over 五门俱开, 修为 +60 over her memory).
//
// The rule: the passage that leads into a board finishes in the box first,
// then the board opens. The games wait for the box; the page's moments wait
// for the box and for each other, in MOMENTS order; the box yields only to
// what is already UP (a fight in play, a beast's first sight, a moment on the
// stage) and, at a 回's turn, to its 「完」 and the new 回's title.
//
// Pure: lingjing.js reads the page's flags into plain objects and asks here.

/* The cards that wait for the book: a game to play here. */
export const BOX_FIRST = new Set(['board', 'duel', 'tale', 'lundao']);

/* The page's own moments, in the order they come after the book. */
export const MOMENTS = ['piece', 'doors', 'feat', 'memory', 'homing'];

/* The stage's cards with the games held back while the book is ahead. */
export const afterBook = (cards, ahead) => (ahead ? cards.filter((c) => !BOX_FIRST.has(c.card)) : cards);

/* Is the book ahead of the stage? Passages owed or being drawn, or the box
   playing — unless it is paused at a 回's turn (its 「完」, the new title). */
export const bookAhead = ({ owed = false, drawing = false, playing = false, huiTurn = false }) => Boolean(owed || drawing || (playing && !huiTurn));

/* Does the box give the stage away now? Only to what is up, never to what waits for it. */
export const boxGivesWay = ({ bout = false, appearing = false, slots = true, up = false, huiTurn = false }) => Boolean(bout || appearing || !slots || up || huiTurn);

/* May this moment come up now? The book told, nothing else up, and no moment
   before it in MOMENTS still on its way. */
export function momentMay(kind, { ahead = false, up = false, pending = [] }) {
  const before = MOMENTS.slice(0, MOMENTS.indexOf(kind));
  return !ahead && !up && !before.some((m) => pending.includes(m));
}
