// The human-like player for 喂饭桶 · 割藤 (games/fantongcut.js; tools/board-bots.mjs): it plays the
// plan the level was proved with (rope-gen.js), each move once the thing has hung still a moment —
// thought, never reflexes. A miss lays the level again; it plays the plan again.
const CALM_MS = 400;
let calm = 0, lastT = -1;

function move(s, m) {
  if (m.g === 'cut') return { g: 'cut', v: String(m.v), k: String(Math.floor(s.swing.vines[m.v].joints.length / 2)) };
  if (m.g === 'pop') return { g: 'pop', i: String(m.i ?? 0) };
  return { g: m.g };
}

export function bot(s, see = {}) {
  const t = see.t ?? 0;
  if (t < lastT) { calm = 0; lastT = -1; }
  const dt = lastT < 0 ? 0 : t - lastT;
  lastT = t;
  if (s.won || !s.live || s.phase !== 'play' || !s.plan) { calm = 0; return null; }
  const w = s.swing;
  calm = w.bread.speed < 0.12 && Math.abs(w.bread.angularSpeed) < 0.02 ? calm + dt : 0;
  if (s.moves >= s.plan.length || calm < CALM_MS) return null;
  calm = 0;
  return move(s, s.plan[s.moves]);
}
