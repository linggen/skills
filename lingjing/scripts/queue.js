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

/* What may stand while the story is told (Hanli: one thing on the stage, and nothing stands
   while the story is told): the header (whoever is in the scene, the goal), the page's moments
   and a 回's 「完」 — each comes in its turn (momentMay, atTurn) — a fight or 闭关 already up, the
   闭关 chooser he opened himself, and the scene card, which keeps its own rule (it waits for the
   box's last beat, its choices inside the box). EVERY other card waits for the book: a game, a
   new face's 图鉴 card (银月 at dawn was a girl on the card before the box said so), a choice on
   a card of its own (渡劫's throw, the 生辰, a name), an errand offered (live 2026-10-14: 可接的差事
   stood behind 秦雁's 亮相), 所得, the line, the road, what Ling showed, the day's coins. */
export const STANDS = new Set(['people', 'goal', 'memory', 'homing', 'doors', 'unfold', 'closed', 'fight', 'seclusion', 'seclude', 'panel']);

/* The page's own moments, in the order they come after the book. */
export const MOMENTS = ['piece', 'doors', 'feat', 'memory', 'homing', 'unfold'];

/* No game stands over the passage (Hanli, 2026-10-14: 「小游戏，和剧情不要同时显示」; then at
   三试, the box's 「继续」 under the 降妖 card's 出手 — two things to tap). A board, a fight, a
   传闻 or a 论道 waits for the passage that leads into it, like every card that does not STAND;
   a scene's own game waits for the box to be put away (lingjing.js stageNow), and the box
   steps aside for a game in play (boxGivesWay `game`). The early rule (2026-10-05: the scene's
   fights over the box past its caption) is gone. */
export const afterBook = (cards, ahead) => (ahead ? cards.filter((c) => STANDS.has(c.card)) : cards);

/* Is the book ahead of the stage? Passages owed or being drawn, or the box
   playing — unless it is paused at a 回's turn (its 「完」, the new title). */
export const bookAhead = ({ owed = false, drawing = false, playing = false, huiTurn = false }) => Boolean(owed || drawing || (playing && !huiTurn));

/* Does the box give the stage away now? Only to what is up, never to what waits for it —
   and to a game to play on the stage (`game`): the box is hidden, not shrunk, until the game
   is done; then it comes back with the rest of the passage, or the choices. */
export const boxGivesWay = ({ bout = false, appearing = false, slots = true, up = false, huiTurn = false, game = false }) => Boolean(bout || appearing || !slots || up || huiTurn || game);

/* What stands on the stage, the box and the cards: never a game and the box at once. */
export function onStage({ cards = [], ahead = false, game = (c) => c.card === 'board', ...box }) {
  const shown = afterBook(cards, ahead);
  const gameUp = shown.some(game);
  return { cards: shown, box: Boolean(box.playing) && !boxGivesWay({ ...box, game: gameUp }) };
}

/* Do the moments hold the 回's 「完」 (and the new 回's title) off? One up, or on its way — but
   not one queued behind the new 回's seal ('feat' in MOMENTS: her memory, 鼎归, the map
   unfolding), nor a memory or 鼎归 not yet queued (`waits`) while that seal is pending: the seal
   itself waits for the 「完」 to be put away. Counting them held the 「完」 off for ever — 外门's
   first scene after 回去歇下 stood blank (the crawler, 2026-10-15: 'unfold' waited on 'feat',
   'feat' on the 「完」, the 「完」 on 'unfold'). */
export function momentsHold({ up = false, pending = [], waits = false }) {
  const seal = pending.includes('feat');
  const behind = (k) => seal && MOMENTS.indexOf(k) > MOMENTS.indexOf('feat');
  return Boolean(up || pending.some((k) => k !== 'feat' && !behind(k)) || (waits && !seal));
}

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

/* A 回's turn (Hanli, 2026-10-14, at 古二 → 今 · 一: 「今线突然从半道出来了」, and the
   新的一回 seal came up three scenes later, over the 千米 board). The old 回's last
   passage told, the turn stands until its 「完」 is put away (`closeUp`), the new
   chapter's title card is gone (`titlePending`) and the new 回's seal has played
   (`sealOwed`: on its way or up) — and only then does the box tell the new 回's first
   passage. The seal is the turn's own: it never waits for that passage to end. */
export const atTurn = ({ oldPlaying = false, closeUp = false, titlePending = false, sealOwed = false }) => Boolean(!oldPlaying && (closeUp || titlePending || sealOwed));

/* What may stand on the stage at a 回's turn while the new 回's passage is still to be told
   (`ahead`): the turn's own (its 「完」), the page's moments and a fight or 闭关 already up,
   and the header (whoever is in the scene) — nothing that waits for the passage. The scene
   card and its choices, its games, an errand, a 所得 come after the passage, as anywhere:
   so nothing queues behind the 「完」, there is no 「还有 N 件 ›」 to put it off with, and
   no choice to take past the passage unread (the scene card stood behind the 「完」 and
   one tap on 还有 1 件 put the 「完」 off and 开课 on the stage, j01-track's 55 beats unplayed). */
// What stands while any story is told (STANDS), less the scene card: it waits behind the 「完」 too.
export const TURN_KEEPS = new Set([...STANDS].filter((k) => k !== 'panel'));
export const atTurnCards = (cards, { turn = false, ahead = false } = {}) => (turn && ahead ? cards.filter((c) => TURN_KEEPS.has(c.card)) : cards);
