// A human-like player for a 割绳子 level with a written answer (the story's beats): the plan for the
// level's id, each move once the thing has hung still a moment — thought, never reflexes. A miss
// lays the level again; it plays the plan again. (The 饭桶's bot plays the plan the level carries.)
const CALM_MS = 400;

function move(s, m) {
  if (m.g === 'cut') return { g: 'cut', v: String(m.v), k: String(Math.floor(s.swing.vines[m.v].joints.length / 2)) };
  if (m.g === 'pop') return { g: 'pop', i: String(m.i ?? 0) };
  return { g: m.g };
}

/** A bot for `plans` ({ levelId: [moves] }), or for the plan a state carries when none is named. */
export function planBot(plans = {}) {
  let calm = 0, lastT = -1;
  return function bot(s, see = {}) {
    const t = see.t ?? 0;
    if (t < lastT) { calm = 0; lastT = -1; }
    const dt = lastT < 0 ? 0 : t - lastT;
    lastT = t;
    if (s.won || !s.live || s.phase !== 'play') { calm = 0; return null; }
    const plan = plans[s.level?.id] ?? s.plan;
    if (!plan) return null;
    const w = s.swing;
    calm = w.bread.speed < 0.12 && Math.abs(w.bread.angularSpeed) < 0.02 ? calm + dt : 0;
    if (s.moves >= plan.length || calm < CALM_MS) return null;
    calm = 0;
    return move(s, plan[s.moves]);
  };
}
