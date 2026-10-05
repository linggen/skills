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

/* The cards that wait for the book: a game to play here — and the 图鉴 card of
   whoever the scene brings on, so a card never shows what the passage has not
   told yet (银月 at dawn was a girl on the card before the box said so) — and a
   choice on a card of its own (渡劫's throw, the 生辰, a name): the box goes
   first, the choices after. */
export const BOX_FIRST = new Set(['board', 'duel', 'tale', 'lundao', 'meet', 'breakthrough', 'born', 'value']);

/* The page's own moments, in the order they come after the book. */
export const MOMENTS = ['piece', 'doors', 'feat', 'memory', 'homing'];

/* The games to play here: once the box is on the scene's own passage, past
   its caption, they stand over the box (Hanli, 2026-10-05: 「对白讲到它时就出现在
   舞台中央，可以直接上手」) — the passage that leads into them, a choice's, still
   plays first. The rest of BOX_FIRST (a new face, a choice on its own card)
   waits for the last beat, as before. */
export const EARLY = new Set(['board', 'duel', 'tale', 'lundao']);

/* The stage's cards with the games held back while the book is ahead; `early`,
   the box past the scene's caption, lets the games through. */
export const afterBook = (cards, ahead, early = false) => (ahead ? cards.filter((c) => !BOX_FIRST.has(c.card) || (early && EARLY.has(c.card))) : cards);

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

/* A board he opened from the tray's 开局 is his own pick, not the scene's way
   on: it waits for the whole passage — the box put away, not only its last
   beat — and for a 回's turn (its 「完」, the new title). Live 2026-10-01: 开局
   opened a board over a passage still playing. */
export const trayWaits = ({ owed = false, drawing = false, playing = false, huiTurn = false }) => Boolean(owed || drawing || playing || huiTurn);

/* The 回 line over the stage: while the box still tells a passage of another
   回 (the old 回's last words, under the new 回's banner — live 2026-10-01),
   it keeps that 回's line, when the page has it (`titles`, by 回 id); it turns
   once that passage is told. */
export const huiLineOf = ({ hui = null, title = '', telling = null, titles = {} }) => (telling && telling !== hui && titles[telling] ? titles[telling] : title);
