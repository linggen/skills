// arcade-board.js — the 游戏厅's 试玩 of a game the model plays (画猜: `meta.ai`), on the REAL game page
// (Hanli, 2026-10-19): the arcade opens index.html on a test save of its own (`arcade-<game>`, seeded
// from a fixture where 银月 walks awake), and the page stands that game's board on the stage as a
// light board — the same card, the same mount, the same her-game hold and the same chat beside it as
// in the story. Only a test save takes it (`board=` is read with `save=`), and a win there pays
// nothing: the board is dealt again. No DOM here.

export const ARCADE_PREFIX = 'arcade:';
/** The fixture a 试玩 save begins from: 银月 joined and awake (tests/fixtures/saves). */
export const ARCADE_SEED = 'ji-home';

/** The game the page is asked to stand (`&board=<id>`), on a test save only. */
export function arcadeGameOf(search, scratch) {
  if (!scratch) return null;
  const id = new URLSearchParams(search ?? '').get('board') ?? '';
  return /^[a-z]+$/.test(id) ? id : null;
}

export const isArcadeBoard = (id) => String(id ?? '').startsWith(ARCADE_PREFIX);

/** 试玩's address for a game: its own test save, begun again from the fixture, the board named — and, for a story
    row of a game that plays several (今's 聊天: one chat a row), that row's task (`row=`), so its own deal is played. */
export const arcadePlayUrl = (id, task = null) => `index.html?${new URLSearchParams({ save: `arcade-${id}`, seed: ARCADE_SEED, board: id, ...(task ? { row: task } : {}) })}`;

/** The story row a 试玩 asks for (`&row=<task id>`), on a test save only. */
export function arcadeRowOf(search, scratch) {
  if (!scratch) return null;
  const id = new URLSearchParams(search ?? '').get('row') ?? '';
  return /^[a-z0-9-]+$/.test(id) ? id : null;
}

/**
 * 试玩's address for a game the rules stand on the stage themselves (a registry row's `stage`: 二十问, 讨价还价,
 * 对对子, the 秘境 rerun): its own test save begun again from its fixture (tools/arcade-saves.mjs —
 * where its card stands; or a fixture it names, `seed`), and no `board=` — Look brings the card, as in the story.
 */
export const arcadeStageUrl = (stage, days = 0) => `index.html?${new URLSearchParams({ save: stage.save, seed: stage.seed ?? stage.save, ...(days > 0 ? { days: String(days) } : {}) })}`;

/**
 * Days until a visiting shop stands (`visits: { every, offset }` against the local calendar day — rules/visiting.mjs's
 * count): a stage row with a `visitor` (讨价还价 with the pedlar up the mountain) shifts its save's clock that far.
 */
export function visitDays(visits, now = new Date()) {
  if (!visits?.every) return 0;
  const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  return (((visits.offset ?? 0) - day) % visits.every + visits.every) % visits.every;
}

/** The registry row a 试玩 deals from: the story row asked for (`task`, one that carries its own deal), else the game's
    own row (no story task), else its first. */
export function arcadeRow(registry, id, task = null) {
  const rows = (registry?.games ?? []).filter((g) => g.id === id && !g.replaced);
  const asked = task ? rows.find((g) => g.task === task && g.data) : null;
  return asked ?? rows.find((g) => !g.task) ?? rows[0] ?? null;
}

/**
 * Look with the 试玩 board among its tasks: a light board standing open (stage.mjs stands it on any
 * stage), the game's deal from its row, and `her` — the round holds 银月 out of the 木牌
 * (rules/hergame.mjs `arcade:<game>`). A Look that already holds it is left as it is.
 */
export function withArcade(look, game, { row = null, title = null } = {}) {
  if (!look || !game) return look;
  const id = `${ARCADE_PREFIX}${game}`;
  if ((look.tasks ?? []).some((t) => t.id === id)) return look;
  const deal = { ...(row?.data ?? {}), who: 'yinyue', fixed: true };
  const task = { id, kind: 'board', game, status: 'offered', light: true, open: true, her: true, hosted: true, title: title ?? game, deal };
  return { ...look, tasks: [...(look.tasks ?? []), task] };
}
