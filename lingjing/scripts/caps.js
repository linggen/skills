// caps.js — what this device can do, for a board that has another way to be played when it can (2026-10-21: 古六's
// 讲堂 is 结印's teaching level where a camera is, 砸寨 · 讲堂试法 where none is).
//
// A task row declares it (tasks/*.json): `alt: [{ needs: { camera: true }, demo?, game, deal, title?, how? }]` — the
// first alt this device may play is the board (every need met, or a `demo` alt, which shows itself where the need is
// missing); none → the row's own, untouched. The rule itself is board-choice.js (the phone's rules door calls the
// same one). The choice is the PAGE's: the
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
import { chooseBoard, fallBack, meets, withCaps } from './board-choice.js';

/* Each capability a row may need, and how the page finds it out. `camera`: a camera, and the WebGL the on-device
   hand model runs on (games/jieyin/eye.js) — a camera nothing can see through is no camera for a board. */
const PROBES = {
  camera: (win) => handsSeen(win),
};

/* Dev only, the live check's seams: `?dev=1&feed=1` plays 结印 on hands fed from the console (games/jieyin.js), so
   it counts as a camera; `?dev=1&caps=none` plays as a device without any (a `demo` alt is still dealt, and its game
   finds no camera by itself: 结印's lesson shown, then the row's own board). */
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

export { chooseBoard, fallBack, meets, withCaps };

/** Lay a fallback over the page's caps (probed once; this is the only later change). */
export async function fellBack(taskId, result, deal, win = globalThis) {
  const next = fallBack(await probeCaps(win), taskId, result, deal);
  if (next) probed = Promise.resolve(next);
  return Boolean(next);
}
