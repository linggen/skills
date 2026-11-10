// auto.js — a teaching level shown by itself, where the camera is missing, refused or failing (Hanli 2026-11-10:
// 「结印课堂…是很重要的课堂. 如果用户不开摄像头, 就改成自动演示给用户demo结印」). The level says so in data
// (levels/jieyin.json `auto`: { stepMs, castMs, endMs }); a level without it leaves at once, as before.
//
// The lesson as steps, each standing `ms` (a tap goes on sooner; the shell's pause holds the clock):
//   show   { at, seal }   one seal of the level's sequence: its icon, its name, the level's own line for it
//   gather {}             the seals learned: the closing `cast`'s line, its row of seals laid out
//   press  { at, seal }   the cast's seals, one after another
//   cast   { used }       the 火蛋 at the dummy
// Then the game leaves (`unable`) and the row's own board is dealt (board-choice.js) — never a dead end.
//
//   autoOf(level)                 → the level's knobs, or null (not a teaching level, or no `auto`)
//   autoSteps(kit, level, set)    → the steps (pure)
//   whyLine(reason, lang, input)  → the one line that says why, and where the OS lets him turn the camera on
//   pace(steps, { apply, paused }) → { done: Promise<bool>, next(), stop() }   the clock
//   panelHtml(why, skip)          → the demo's card in the field
import { forInput } from '../kit/device.js';
import { sequenceFor } from './sets.js';

const KNOBS = { stepMs: 3600, castMs: 700, endMs: 1400 };

/** The level's demo knobs: a teaching level that declares `auto`, else null. */
export const autoOf = (level) => (level?.mode === 'one' && level.auto ? { ...KNOBS, ...(level.auto === true ? {} : level.auto) } : null);

/** The lesson as the demo plays it, for a set (the device's seals). */
export function autoSteps(kit, level, set) {
  const k = autoOf(level);
  if (!k) return [];
  const steps = sequenceFor(kit, level, set).map((seal, at) => ({ kind: 'show', at, seal, ms: k.stepMs }));
  if (!level.cast) return steps;
  const used = sequenceFor(kit, level.cast, set);
  return [...steps, { kind: 'gather', ms: k.stepMs }, ...used.map((seal, at) => ({ kind: 'press', at, seal, ms: k.castMs })), { kind: 'cast', used, ms: k.endMs }];
}

/* Why the lesson shows itself, by the eye's reason (eye.js start: 'denied' | 'nocamera' | 'model'). A refusal names
   where the camera is turned on: iOS asks once and never again, so a phone's line points to Settings. */
const WHY = {
  zh: {
    nocamera: '这里没有摄像头，先看一遍演示。',
    denied: { desk: '摄像头没开，先看一遍演示。想自己结印：在浏览器或系统设置里允许摄像头。', touch: '摄像头没开，先看一遍演示。想自己结印：到 设置 › Linggen 打开相机。' },
    failed: '摄像头没接上，先看一遍演示。',
  },
  en: {
    nocamera: 'No camera here — watch the seals shown once.',
    denied: 'Camera is off — watch the demo.',
    failed: 'The camera did not start — watch the demo.',
  },
};
export const whyLine = (reason, lang = 'zh', input = 'desk') => {
  const w = WHY[lang === 'en' ? 'en' : 'zh'];
  return forInput(w[reason] ?? w.failed, input);
};

/** The steps on their clock: `apply(step)` (awaited — a 火蛋 in flight), then the step stands its `ms`. `next()` ends
    the wait now, `stop()` ends the run; `done` → true when it played to its end. Paused, the clock holds. */
export function pace(steps, { apply, paused = () => false, env = globalThis, tickMs = 100 } = {}) {
  let stopped = false, endWait = null;
  const wait = (ms) => new Promise((resolve) => {
    let left = ms;
    const end = () => { env.clearInterval(timer); endWait = null; resolve(); };
    const timer = env.setInterval(() => { if (!paused()) left -= tickMs; if (left <= 0) end(); }, tickMs);
    endWait = end;
  });
  const done = (async () => {
    for (const step of steps) {
      if (stopped) break;
      await apply(step);
      if (stopped) break;
      await wait(step.ms);
    }
    return !stopped;
  })();
  return { done, next: () => endWait?.(), stop: () => { stopped = true; endWait?.(); } };
}

const plain = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The demo's parts in the field: why (one line), the seal shown (icon and name, filled by the game), and the way past. */
export function panelHtml(why, skip) {
  return `<p class="jy-auto-why" role="status">${plain(why)}</p>`
    + `<div class="jy-auto-card"><span class="jy-auto-hand"></span><b class="jy-auto-name"></b></div>`
    + `<button type="button" class="gshell-btn jy-auto-skip">${plain(skip)}</button>`;
}
