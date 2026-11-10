// board-choice.js — which board a task is played as on this device: the rule alone, no page in it (caps.js finds out
// what the Mac page can do and keeps the choice; the phone's rules door, tools/phone/entry.mjs, calls the same rule
// with the caps the app declares). A task row declares it (tasks/*.json):
//
//   alt: [{ needs: { camera: true }, demo?, game, deal, title?, how? }]
//
// The first alt this device may play is the board; none → the row's own, untouched. An alt is played where every
// need is met — or, with `demo`, anywhere: its game shows itself where the need is missing (结印's teaching level
// plays the lesson by itself, Hanli 11-10: 「如果用户不开摄像头, 就改成自动演示给用户demo结印」) and then leaves
// `unable`, so the row's own board follows. `hosted`: the games this host can mount at all (the phone's board kit);
// null → every game.
//
//   meets(needs, caps)                        chooseBoard(task, caps, { hosted }?) → the task as played here
//   withCaps(look, caps, { hosted }?)         → Look with every task chosen
//   fallBack(caps, taskId, result, deal)      → the caps after a board left for the one behind it, or null

/** Does this device have every capability `needs` names? */
export const meets = (needs, caps) => Object.entries(needs ?? {}).every(([k, want]) => Boolean(caps?.[k]) === Boolean(want));

const BOARD_KEYS = ['game', 'deal', 'title', 'how'];
const mounts = (alt, hosted) => !hosted || hosted.includes(alt.game);

/** The task as this device plays it: the first alt it may play laid over the row (game, deal, and words if it has them). */
export function chooseBoard(task, caps, { hosted = null } = {}) {
  if (!task?.alt?.length || caps?.turned?.includes(task.id)) return task;
  const alt = task.alt.find((a) => (meets(a.needs, caps) || a.demo === true) && mounts(a, hosted));
  if (!alt) return task;
  const over = Object.fromEntries(BOARD_KEYS.filter((k) => alt[k] != null).map((k) => [k, alt[k]]));
  // `instead`: the board behind this one, by its title — the game may offer it (games/jieyin.js 「改用…」).
  return { ...task, ...over, deal: { ...(alt.deal ?? {}), instead: task.title, ...(!meets(alt.needs, caps) && alt.demo === true ? { demo: true } : {}) }, played_as: alt.game };
}

/** Look with every task as this device plays it. */
export function withCaps(look, caps, opts) {
  if (!look?.tasks?.some((t) => t.alt?.length)) return look;
  return { ...look, tasks: look.tasks.map((t) => chooseBoard(t, caps, opts)) };
}

/** A board's game left for the board behind it (`instead` in its deal): what caps become — the need it lacked dropped
    (`unable`: 'camera'), the task turned back to its own board. Null when the game simply left (no fallback). */
export function fallBack(caps, taskId, result, deal) {
  if (!deal?.instead || !result?.left || !(result.unable || result.instead)) return null;
  const lost = result.unable ? { [result.unable]: false } : {};
  return { ...caps, ...lost, turned: [...new Set([...(caps?.turned ?? []), taskId])] };
}
