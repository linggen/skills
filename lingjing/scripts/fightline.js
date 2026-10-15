// fightline.js — the attentive line of play, for the playtest crawler (tools/playtest.mjs) through
// the page's scratch-only seam: of everything the rules let through now, the move that does the
// most — read off a copy of the fight, never an opinion (the same measure as tools/battle-sim.mjs).
// Pure; it never touches the fight it reads. The crawler then makes that move with real taps.
import { act, offers } from './battle.js';

const sum = (board, f) => board.reduce((n, m) => n + f(m), 0);
const snap = (st) => ({
  foeHp: st.foe.hp, youHp: st.you.hp, foeBoard: st.foe.board.length, youBoard: st.you.board.length,
  mine: sum(st.you.board, (m) => m.atk + m.hp * 0.6 + (m.taunt ? 2 : 0)), theirs: sum(st.foe.board, (m) => m.atk),
});

/// What one move is worth: damage and clears, bodies left standing, what it costs us.
export function worth(st, action) {
  const copy = JSON.parse(JSON.stringify(st));
  if (!act(copy, action, 'you').ok) return -Infinity;
  if (copy.outcome !== 'open') return copy.outcome === 'won' || copy.outcome === 'win' ? 1e6 : -1e6;
  const a = snap(st), b = snap(copy);
  return (a.foeHp - b.foeHp) * 2 + (a.foeBoard - b.foeBoard) * 2 + (b.mine - a.mine) * 1.5 + (a.theirs - b.theirs)
    - (a.youBoard - b.youBoard) * 2 - (a.youHp - b.youHp) + (b.youHp - a.youHp > 0 ? b.youHp - a.youHp : 0);
}

/// The move to make now: the best that is worth anything, else the end of the turn.
export function bestMove(st) {
  if (!st || st.outcome !== 'open' || st.whose !== 'you') return null;
  const best = offers(st).filter((o) => o.ok && o.action.kind !== 'end').map((o) => ({ o, v: worth(st, o.action) })).sort((x, y) => y.v - x.v)[0];
  if (!best || best.v <= 0) return { kind: 'end' };
  return { ...best.o.action, buff: Boolean(best.o.card?.effect?.buff) };
}
