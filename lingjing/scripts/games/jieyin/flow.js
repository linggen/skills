// flow.js — 师父传印's lesson and drill as a state machine (pure; Hanli 2026-11-10: 「看 · 跟 · 考」, and 「没有摄像头也能完成」).
// The page (lesson.js) draws it and feeds it the hands — a camera's gestures or a player's taps — and the clock; nothing
// here knows a DOM, a camera or the rules.
//
//   a lesson   watch (the master's demonstration, a figure at a time, `watchMs` each)
//              follow (the gestures one by one, each confirmed)
//              exam (the whole seal, in order, against the clock — `limit` ms; the time out is only a try again)
//   a drill    chain (the named seals' key gestures in order, against the clock; the time out the same)
//   input      'camera' | 'tap' — the same steps both ways; only the confirming differs (a held gesture / a tapped figure)
//
//   begin(plan, { input, exam }) → state          exam: chuanyin.json `exam` — { hands, tap, strikes, watch } ms
//   tick(state, dt)    → { state, events }     the clock: a watch step goes on by itself; the exam's time runs out
//   confirm(state, figure?) → { state, events } a gesture made (camera) or tapped (tap): the right one goes on; `figure`
//                           (a tap) of the wrong kind is only a 'wrong' event
//   next(state)        → { state, events }     a tap on the demonstration goes on
//   switchTo(state, input) → state              the camera failed or was put aside: the same step, by tapping
//   trayOf(state, decoys, pickFn) → ids         the figures a tap exam offers: the wanted ones and `decoys` others, shuffled by `pickFn`
// Events: { type: 'phase', phase } · 'step' (a figure confirmed) · 'wrong' · 'timeout' · 'passed' · 'again'.
const DEFAULTS = { watchMs: 2500, exam: { hands: 16000, tap: 10000, strikes: 2 } };
const keyOf = (input) => (input === 'tap' ? 'tap' : 'hands'); // the data's keys: made with the hands at the lens, or tapped

/** The figures a plan asks for: a lesson's seal gestures in order; a drill's — each named seal's key (last) gesture. */
export function figuresOf(plan) {
  if (plan?.mode === 'lesson') return [...(plan.seal?.figures ?? [])];
  if (plan?.mode === 'drill') return (plan.seals ?? []).map((r) => r.figures.at(-1));
  return [];
}

/** The seals this plan makes clean casts of when it is passed: a lesson's one (the 考 is a cast), a drill's each. */
export const castsOf = (plan) => (plan?.mode === 'lesson' ? [plan.seal.id] : plan?.mode === 'drill' ? plan.seals.map((r) => r.id) : []);

const limitOf = (s) => {
  const base = s.exam[keyOf(s.input)] ?? DEFAULTS.exam[keyOf(s.input)];
  // A drill's chain is as many gestures as seals: the clock scales with them (two make the base, three half again).
  return s.kind === 'drill' ? Math.round((base * Math.max(2, s.figures.length)) / 2) : base;
};

export function begin(plan, { input = 'tap', exam = {} } = {}) {
  const kind = plan.mode === 'drill' ? 'drill' : 'lesson', figures = figuresOf(plan);
  return {
    kind, input, figures, phase: kind === 'drill' ? 'chain' : 'watch', at: 0, t: 0, watchMs: exam.watch ?? DEFAULTS.watchMs, strikes: 0, passes: 0,
    exam: { ...DEFAULTS.exam, ...exam }, clock: 0, wrong: 0, made: 0, done: false,
  };
}

/** How long the exam / chain has, and how much is left. */
export const limit = (s) => limitOf(s);
export const left = (s) => Math.max(0, limitOf(s) - s.clock);
export const timed = (s) => s.phase === 'exam' || s.phase === 'chain';

const into = (s, phase) => ({ ...s, phase, at: 0, t: 0, clock: 0 });

export function tick(s, dt) {
  if (s.done) return { state: s, events: [] };
  if (s.phase === 'watch') {
    const t = s.t + dt;
    return t >= s.watchMs ? next(s) : { state: { ...s, t }, events: [] };
  }
  if (timed(s)) {
    const clock = s.clock + dt;
    if (clock >= limitOf(s)) return { state: { ...s, at: 0, clock: 0, strikes: s.strikes + 1 }, events: [{ type: 'timeout', strikes: s.strikes + 1 }, { type: 'again' }] };
    return { state: { ...s, clock }, events: [] };
  }
  return { state: s, events: [] };
}

/** A tap on the demonstration (or its clock running out): the next figure, then the follow. */
export function next(s) {
  if (s.phase !== 'watch') return { state: s, events: [] };
  if (s.at + 1 < s.figures.length) return { state: { ...s, at: s.at + 1, t: 0 }, events: [] };
  return { state: into(s, 'follow'), events: [{ type: 'phase', phase: 'follow' }] };
}

/** The figure wanted now. */
export const wanted = (s) => (s.done || s.phase === 'watch' ? null : s.figures[s.at] ?? null);

/** A gesture made. In 'tap' the figure tapped must be the one wanted. In 'camera' the hands already judged it. */
export function confirm(s, figure = null) {
  if (s.done || s.phase === 'watch') return { state: s, events: [] };
  const want = wanted(s);
  if (s.input === 'tap' && figure !== want) return { state: { ...s, wrong: s.wrong + 1 }, events: [{ type: 'wrong', figure }] };
  const at = s.at + 1, made = s.made + 1;
  if (at < s.figures.length) return { state: { ...s, at, made }, events: [{ type: 'step', at: s.at, figure: want }] };
  if (s.phase === 'follow') return { state: { ...into(s, 'exam'), made }, events: [{ type: 'step', at: s.at, figure: want }, { type: 'phase', phase: 'exam' }] };
  return { state: { ...s, at, made, done: true, passes: s.passes + 1 }, events: [{ type: 'step', at: s.at, figure: want }, { type: 'passed' }] };
}

/** The same step by another input (a camera that failed, or "改用点选"). */
export const switchTo = (s, input) => (s.input === input ? s : { ...s, input, ...(timed(s) ? { at: 0, clock: 0 } : {}) });

/** Whether the camera's time-outs have run out its patience: `strikes` tries without the whole seal → 「改用点选」 is offered. */
export const offerTap = (s) => s.input === 'camera' && s.strikes >= (s.exam.strikes ?? DEFAULTS.exam.strikes);

/** The tray a tap exam shows: the wanted figures and `decoys` others (from `pool`), in an order `shuffle` gives. */
export function trayOf(s, pool, decoys, shuffle = (a) => a) {
  const want = [...new Set(s.figures)], others = pool.filter((id) => !want.includes(id)).slice(0, decoys);
  return shuffle([...want, ...others]);
}
