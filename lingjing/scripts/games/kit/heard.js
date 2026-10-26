// heard.js — what a pure board's step sounds like (Hanli 10-26: 「查一下, 有很多小游戏没有声音和退出」; doc/game-kit.md
// § Sound). The runners of a pure board (games/mount.js for the 游戏厅, the try page and the phone; live-games.js on the
// story's stage) call it after every act and every tick, so a board on any of them sounds the same.
//
//   the game's own moments   a module's optional `sounds(before, after)` → event names (or { event, kind }) for what
//                            that step made happen: a basin set down, a vine cut, a stone placed. Pure: it reads two
//                            states and names; it never plays, and it never knows what an event sounds like.
//   a press                  when the game named nothing for a press, the shell's own `tap` (it was answered) or
//                            `nope` (it was turned down) — so no board is ever silent under a finger.
//
// What each name sounds like is data (games/kit/audio/sounds.json); the shell plays it (games/shell.js `sound`).

/** The events a step made: the module's own first; a press it named nothing for is the shell's tap or nope. */
export function heardOf(mod, before, after, press = null) {
  let named = [];
  if (before !== after || press) {
    try { named = [mod?.sounds?.(before, after) ?? []].flat(); } catch (e) { console.warn('[sound] heard', mod?.meta?.id, e); named = []; }
  }
  const list = named.filter(Boolean).map((e) => (typeof e === 'string' ? { event: e } : e)).filter((e) => e.event);
  if (!list.length && press) list.push({ event: press === 'nope' ? 'nope' : 'tap' });
  return list;
}

/** Sound what a step made through the board's shell (games/shell.js shellFor `sound`). */
export function sounded(shell, mod, before, after, press = null) {
  if (!shell?.sound) return;
  for (const e of heardOf(mod, before, after, press)) shell.sound(e.event, e.kind != null ? { kind: e.kind } : undefined);
}

/** A count that went up between two states (a small help for `sounds`). */
export const rose = (before, after, key) => (Number(after?.[key]) || 0) > (Number(before?.[key]) || 0);
