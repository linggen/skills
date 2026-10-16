// fightline.js — the attentive line of play, for the playtest crawler (tools/playtest.mjs) through
// the page's scratch-only seam: of everything the rules let through now, the move that does the
// most — read off a copy of the fight, never an opinion (the same measure as tools/battle-sim.mjs).
// Pure; it never touches the fight it reads. The crawler then makes that move with real taps.
import { act, foeTurn, offers } from './battle.js';

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
/// The move to make now — a turn thought ahead (lookahead, below): the fights are tuned to be
/// lost by a careless line, and the crawl must play on past them.
export function bestMove(st) {
  if (!st || st.outcome !== 'open' || st.whose !== 'you') return null;
  const action = lookahead(st);
  if (action.kind === 'end') return { kind: 'end' };
  const card = action.kind === 'play' ? st.catalog?.[st.you.hand[action.index]] : null;
  return { ...action, buff: Boolean(card?.effect?.buff) };
}

/* A player who thinks a turn ahead: every move tried on a copy and the
   fight played out from there by a plain line (bodies, then spells, then the
   root strike, every body at the beast) — the move whose ending is best is
   made. Deterministic and much stronger than `careful`; the tests that need a
   fight WON to test what follows (a win the exit takes, a guard passed) play
   with it, so a fight tuned to 60% for `careful` does not make them flaky. */
/* 丹囊 (battle.js § pills) in the plain line: a 回春丹 when he is down to half, a 回气丹 when it lets a
   card in hand be played that the 灵力 now cannot pay. */
const pillNow = (st, os) => os.find(o => o.ok && o.action.kind === 'pill' && !o.action.target && (
  (o.pill.heal && st.you.hp <= st.you.hpMax / 2)
  || (o.pill.mana && st.you.hand.some(id => { const c = st.catalog?.[id]; return c && c.cost > st.you.mana && c.cost <= st.you.mana + o.pill.mana; }))));
const plain = st => { const os = offers(st); return pillNow(st, os) ?? os.find(o => o.ok && o.action.kind === 'play') ?? os.find(o => o.ok && o.action.kind === 'attack') ?? os.find(o => o.ok && o.action.kind === 'power'); };
const copyOf = st => { const c = structuredClone({ ...st, catalog: undefined }); c.catalog = st.catalog; return c; };
function playOut(st, line) {
  for (let g = 0; g < 300 && st.outcome === 'open'; g += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    const o = line(st);
    act(st, o ? o.action : { kind: 'end' }, 'you');
  }
  return st.outcome === 'won' ? 1000 + st.you.hp : st.outcome === 'lost' ? -1000 - st.foe.hp : -st.foe.hp;
}
/* The careful line, in small: every legal move weighed by what it leaves on the board. */
const bodyOf = side => side.board.reduce((n, m) => n + m.atk + m.hp * 0.6 + (m.taunt ? 2 : 0), 0);
function careful(st) {
  let best = null, top = 0.5;
  for (const o of offers(st).filter(x => x.ok && x.action.kind !== 'end')) {
    const copy = copyOf(st);
    if (!act(copy, o.action, 'you').ok) continue;
    const v = (st.foe.hp - copy.foe.hp) * 2 + (copy.you.hp - st.you.hp) + (bodyOf(copy.you) - bodyOf(st.you)) * 1.2 + (bodyOf(st.foe) - bodyOf(copy.foe));
    if (v > top) { top = v; best = o; }
  }
  return best;
}

export function lookahead(st, { deep = false } = {}) {
  let best = { kind: 'end' }, top = -Infinity;
  for (const o of [...offers(st).filter(x => x.ok && x.action.kind !== 'end'), { action: { kind: 'end' } }]) {
    const c = copyOf(st);
    if (!act(c, o.action, 'you').ok) continue;
    const v = playOut(c, deep ? careful : plain);
    if (v > top) { top = v; best = o.action; }
  }
  return best;
}
