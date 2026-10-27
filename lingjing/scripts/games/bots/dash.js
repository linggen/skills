// 几何冲刺's bot (tools/board-bots.mjs shape: `bot(state, see)` → { hold } | { release } | null): a short forward
// search in the pure model — the runner carried on by the rules themselves, the press it would make tried in turn:
// nothing, a tap, a hold — each for a short stretch, then the same again, to a little under a second ahead; the first
// way that lives is taken (nothing before a tap before a hold). `see.lead` (the hand's delay) is played out first.
import { STEP_MS, tick } from '../dash.js';

const SEG = 7; //    steps a stretch (~117 ms)
const DEPTH = 7; //  stretches ahead (~0.8 s)

const copy = (s) => ({ ...s });
function run(s, steps, input) {
  for (let i = 0; i < steps; i++) {
    if (i === 0 && input !== 'none') { if (!s.holding) s.pressed = true; s.holding = true; }
    if (input === 'tap' && i === 1) s.holding = false;
    if (input === 'none') s.holding = false;
    tick(s, STEP_MS);
    if (s.phase === 'dead') return false;
    if (s.won) return true;
  }
  return true;
}
/** Does some way of pressing live from `s` for `depth` stretches more? */
function lives(s, depth) {
  if (depth === 0 || s.won) return true;
  for (const input of ['none', 'tap', 'hold']) {
    const c = copy(s);
    if (run(c, SEG, input) && lives(c, depth - 1)) return true;
  }
  return false;
}
/** The first input that lives, now. */
export function choose(s) {
  for (const input of ['none', 'tap', 'hold']) {
    const c = copy(s);
    if (run(c, SEG, input) && lives(c, DEPTH - 1)) return input;
  }
  return 'tap';
}

export function bot(s, see = {}) {
  if (!s.live || s.won) return s.holding ? { release: true } : null;
  if (s.phase === 'ready') return s.first ? { hold: {} } : null;
  if (s.phase === 'dead') return s.holding ? { release: true } : null;
  const p = copy(s);
  if (see.lead) tick(p, see.lead);
  if (p.phase !== 'play') return null;
  const want = choose(p);
  if (want === 'none') return s.holding ? { release: true } : null;
  if (!s.holding) return { hold: {} };
  return want === 'tap' && s.grounded ? { release: true } : null;
}
