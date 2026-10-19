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

/** 试玩's address for a game: its own test save, begun again from the fixture, the board named. */
export const arcadePlayUrl = (id) => `index.html?${new URLSearchParams({ save: `arcade-${id}`, seed: ARCADE_SEED, board: id })}`;

/** The registry row a 试玩 deals from: the game's own row (no story task), else its first. */
export function arcadeRow(registry, id) {
  const rows = (registry?.games ?? []).filter((g) => g.id === id);
  return rows.find((g) => !g.task) ?? rows[0] ?? null;
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
