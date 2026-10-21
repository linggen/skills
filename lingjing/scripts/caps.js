// caps.js — what this device can do, for a board that has another way to be played when it can (2026-10-21: 古六's
// 讲堂 is 结印's teaching level where a camera is, 砸寨 · 讲堂试法 where none is).
//
// A task row declares it (tasks/*.json): `alt: [{ needs: { camera: true }, game, deal, title?, how? }]` — the first
// alt whose every need this device has is the board; none → the row's own, untouched. The choice is the PAGE's: the
// rules cannot see a camera and never try (Look hands `alt` through as data). The task id stays the row's, so the
// win, its grade (the alt's `deal.grades`), its marks, its pay and the way on are the same beat either way — a save
// never forks on the device it was played on.
//
//   probeCaps(win) → Promise<{ camera: bool, … }>   asked once a page, never a permission prompt
//   chooseBoard(task, caps) → the task as played here    withCaps(look, caps) → Look with every task chosen
//
// Never a dead end (Hanli 10-21: 「用户结印失败, 或者不愿意使用摄像头…也能正常完成, 不会影响剧情推进」): the alt's deal
// carries `instead` (the row's own title); the game leaves with `unable` (the camera refused or failing — that need is
// then dropped for the page) or `instead` (he chose the other board after missing). `fallBack` records it and the row's
// own board is dealt in its place — the same task, so the same pay; the stuck rule (「算了，往下走」) holds on both.
import { available as handsSeen } from './games/jieyin/eye.js';

/* Each capability a row may need, and how the page finds it out. `camera`: a camera, and the WebGL the on-device
   hand model runs on (games/jieyin/eye.js) — a camera nothing can see through is no camera for a board. */
const PROBES = {
  camera: (win) => handsSeen(win),
};

/* Dev only, the live check's seams: `?dev=1&feed=1` plays 结印 on hands fed from the console (games/jieyin.js), so
   it counts as a camera; `?dev=1&caps=none` plays as a device without any. */
function devCaps(search) {
  const q = new URLSearchParams(search ?? '');
  if (q.get('dev') !== '1') return null;
  if (q.get('caps') === 'none') return {};
  if (q.get('feed') === '1') return { camera: true };
  return null;
}

let probed = null;
export function probeCaps(win = globalThis) {
  probed ??= (async () => {
    const dev = devCaps(win.location?.search);
    if (dev) return dev;
    const entries = await Promise.all(Object.entries(PROBES).map(async ([k, probe]) => [k, await Promise.resolve().then(() => probe(win)).catch(() => false)]));
    return Object.fromEntries(entries.map(([k, v]) => [k, Boolean(v)]));
  })();
  return probed;
}

/** Does this device have every capability `needs` names? */
export const meets = (needs, caps) => Object.entries(needs ?? {}).every(([k, want]) => Boolean(caps?.[k]) === Boolean(want));

const BOARD_KEYS = ['game', 'deal', 'title', 'how'];

/** The task as this device plays it: the first alt it meets laid over the row (game, deal, and words if it has them). */
export function chooseBoard(task, caps) {
  if (!task?.alt?.length || caps?.turned?.includes(task.id)) return task;
  const alt = task.alt.find((a) => meets(a.needs, caps));
  if (!alt) return task;
  const over = Object.fromEntries(BOARD_KEYS.filter((k) => alt[k] != null).map((k) => [k, alt[k]]));
  // `instead`: the board behind this one, by its title — the game may offer it (games/jieyin.js 「改用…」).
  return { ...task, ...over, deal: { ...(alt.deal ?? {}), instead: task.title }, played_as: alt.game };
}

/** Look with every task as this device plays it. */
export function withCaps(look, caps) {
  if (!look?.tasks?.some((t) => t.alt?.length)) return look;
  return { ...look, tasks: look.tasks.map((t) => chooseBoard(t, caps)) };
}

/** A board's game left for the board behind it (`instead` in its deal): what caps become — the need it lacked dropped
    (`unable`: 'camera'), the task turned back to its own board. Null when the game simply left (no fallback). */
export function fallBack(caps, taskId, result, deal) {
  if (!deal?.instead || !result?.left || !(result.unable || result.instead)) return null;
  const lost = result.unable ? { [result.unable]: false } : {};
  return { ...caps, ...lost, turned: [...new Set([...(caps?.turned ?? []), taskId])] };
}

/** Lay a fallback over the page's caps (probed once; this is the only later change). */
export async function fellBack(taskId, result, deal, win = globalThis) {
  const next = fallBack(await probeCaps(win), taskId, result, deal);
  if (next) probed = Promise.resolve(next);
  return Boolean(next);
}
