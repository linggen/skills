// The human-like player for 喂饼 (games/bread.js; tools/board-bots.mjs). Thought, not reflexes:
// it knows each level's answer (the order of cuts and puffs) and makes every move only once the
// 饼 has hung still a moment — never on the swing. A corner missed is played again once.
const PLANS = {
  one: [['cut', 0]],
  two: [['cut', 0], ['cut', 1]],
  stone: [['cut', 1], ['cut', 0]],
  gust: [['gust'], ['cut', 0], ['gust']],
};
export const plans = PLANS;
const CALM_SPEED = 0.12, CALM_MS = 400;

let calm = 0, lastT = -1, again = 0;

function move(s, [g, v]) {
  if (g === 'gust') return { g: 'gust' };
  const joints = s.swing.vines[v].joints.length;
  return { g: 'cut', v: String(v), k: String(Math.floor(joints / 2)) };
}

export function bot(s, see = {}) {
  const t = see.t ?? 0;
  if (t < lastT) { calm = 0; again = 0; } // a fresh game
  const dt = lastT < 0 ? 0 : t - lastT;
  lastT = t;
  if (s.won || !s.live) return null;
  if (s.phase === 'clear') {
    if (again < 1 && s.levels[s.li].piece && !s.got[s.li]) { again++; return { g: 'retry' }; }
    return { g: 'next' };
  }
  if (s.phase !== 'play') { calm = 0; return null; }
  calm = s.swing.bread.speed < CALM_SPEED ? calm + dt : 0;
  const plan = PLANS[s.levels[s.li].id] ?? [];
  if (s.moves >= plan.length || calm < CALM_MS) return null;
  calm = 0;
  return move(s, plan[s.moves]);
}
