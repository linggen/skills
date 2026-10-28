// The human-like player for 象棋残局 (games/xiangqi.js; tools/board-bots.mjs): read the position through — a red move
// after which every black reply still loses within the moves left (the board's own search, redMates) — then pick the
// piece and set it down. Black's turn is the board's (think/answer, the page's Worker; the harness lays it in).
import { legalMoves, redMates } from '../xiangqi.js';

const W = 9;
const after = (b, f, t) => { const a = b.split(''); a[t] = a[f]; a[f] = '.'; return a.join(''); };
const at = (i) => `${i % W},${Math.floor(i / W)}`;
const wins = (b, left) => legalMoves(b, 'r').find(([f, t]) => {
  const n = after(b, f, t), replies = legalMoves(n, 'b');
  return !replies.length || (left > 1 && replies.every(([g, h]) => redMates(after(n, g, h), left - 1)));
});

export function bot(s) {
  if (!s || s.outcome !== 'open' || s.wait) return null;
  const m = wins(s.board, s.left);
  if (!m) return null;
  return s.sel === m[0] ? { g: 'go', at: at(m[1]) } : { g: 'pick', at: at(m[0]) };
}
