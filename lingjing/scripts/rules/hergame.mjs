// rules/hergame.mjs — 银月 out of the 木牌 for a small game that needs her (Hanli, 2026-10-19:
// 「平时和剧情对齐, 只有在小游戏里需要时醒着」). Part of the rules engine; rules.mjs is its one door.
//
// The book has her asleep in 吴婆婆's fox token through 卷一 (companion.asleep). A game that needs
// her says so where it is declared — a task row's `needs: "her"` (tasks/*.json: the 家信, 本王考考你,
// the 秘境's 你画我猜), a 传闻 game's (tale.json) — and the page holds her out for its round:
// `hergame --hold=1 --task=<id>` as a round begins (renewed by each round), `--hold=0` when the board
// settles (the page's verb, never logged). While it holds, companion.mjs herAwake answers true, and
// fitPresence writes `companion.awake` — the flag the engine's presence reads (SKILL.md
// absent_until) — so her look at the picture is a turn of hers, not 「查无此人」. A hold the page
// never ended (a tab shut mid-round) lapses after HER_GAME_TTL_MS. The 游戏厅's 画猜 with her as the
// guesser holds as `arcade:<game>` — a game some her-task plays.
import { herAway, herGameNow } from './companion.mjs';
import { sceneOf } from './world.mjs';
import { boardId, liveTale } from './tale.mjs';

const tasksOf = content => content.tasks?.tasks ?? [];
const herTask = (content, id) => tasksOf(content).some(t => t.id === id && t.needs === 'her');
/* Today's 传闻 step, when its game needs her and the board is this one. */
function herTale(content, state, id) {
  const t = liveTale(state);
  const link = t?.chain?.[t.n];
  return Boolean(t && link && id === boardId(t) && content.tale?.games?.[link.game]?.needs === 'her');
}
const herArcade = (content, id) => {
  const game = String(id).startsWith('arcade:') ? String(id).slice(7) : null;
  return Boolean(game) && tasksOf(content).some(t => t.needs === 'her' && t.game === game);
};

/* Does the board `id` need her? A task or 传闻 step that declares it, or the 游戏厅's game of one. */
export function needsHer(content, state, id) {
  if (!id) return false;
  return herTask(content, id) || herTale(content, state, id) || herArcade(content, id);
}

/* The page's `hergame --hold=1|0 --task=<id>`: the hold begun (or renewed), or ended. `keep` the save
   to write (rules.mjs fits her presence with it), null when nothing changed. */
export function pageHerGame(content, state, args = {}, now = new Date()) {
  const on = ['1', 'true', 'on'].includes(String(args.hold ?? ''));
  const task = String(args.task ?? '');
  if (!on) {
    if (!state?.her_game || (task && state.her_game.task !== task)) return { keep: null, result: { ok: true, hold: false } };
    const keep = { ...state };
    delete keep.her_game;
    return { keep, result: { ok: true, hold: false } };
  }
  // Unmet, she can be held only where she stands on the stage in her talking form (the scene's
  // `her: "human"`, a board of that scene: 00-yinyue's 讨饼债) — the hold names the scene (`stage`).
  const sc = sceneOf(content, state);
  const onStage = !state?.companion?.joined && sc?.her === 'human' && (sc.offers?.tasks ?? []).includes(task);
  if ((!state?.companion?.joined && !onStage) || herAway(content, state)) return { keep: null, result: { ok: false, refused: 'no-host', say: null } };
  if (!needsHer(content, state, task)) return { keep: null, result: { ok: false, refused: 'not-hers', say: null } };
  return { keep: { ...state, her_game: { task, since: now.toISOString(), ...(onStage ? { stage: sc.id } : {}) } }, result: { ok: true, hold: true, task } };
}

export { herGameNow };
