// fightline.js — the attentive line of play, for the playtest crawler (tools/playtest.mjs) through
// the page's scratch-only seam: of everything the rules let through now, the move that does the
// most — read off a copy of the fight, never an opinion (the same measure as tools/battle-sim.mjs).
// Pure; it never touches the fight it reads. The crawler then makes that move with real taps.
import { EFFECTS, LINES, act, foeTurn, legal, offers, simCopy } from './battle.js';

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
  (o.pill.heal && st.you.hp <= st.you.hpMax - o.pill.heal)
  || (o.pill.mana && st.you.hand.some(id => { const c = st.catalog?.[id]; return c && c.cost > st.you.mana && c.cost <= st.you.mana + o.pill.mana; }))));
export const plain = st => { const os = offers(st); return pillNow(st, os) ?? os.find(o => o.ok && o.action.kind === 'play') ?? os.find(o => o.ok && o.action.kind === 'attack') ?? os.find(o => o.ok && o.action.kind === 'power') ?? os.find(o => o.ok && o.action.kind === 'skill'); };
const copyOf = simCopy; // battle.js: the fight copied to think on (its log left behind)
export function playOut(st, line) {
  for (let g = 0; g < 300 && st.outcome === 'open'; g += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    const o = line(st);
    act(st, o ? o.action : { kind: 'end' }, 'you');
  }
  return st.outcome === 'won' ? 1000 + st.you.hp : st.outcome === 'lost' ? -1000 - st.foe.hp : -st.foe.hp;
}
/* The careful line, in small: every legal move weighed by what it leaves on the board. */
const bodyOf = side => side.board.reduce((n, m) => n + m.atk + m.hp * 0.6 + (m.taunt ? 2 : 0), 0);
export function careful(st) {
  let best = null, top = 0.5;
  for (const o of offers(st).filter(x => x.ok && x.action.kind !== 'end')) {
    const copy = copyOf(st);
    if (!act(copy, o.action, 'you').ok) continue;
    const v = (st.foe.hp - copy.foe.hp) * 2 + (copy.you.hp - st.you.hp) + (bodyOf(copy.you) - bodyOf(st.you)) * 1.2 + (bodyOf(st.foe) - bodyOf(copy.foe));
    if (v > top) { top = v; best = o; }
  }
  return best;
}

/* Which line plays the fight out from a move tried. `plain` is a face-rush that reads no board and no pile — enough
   where the beast's 气血 is cut and it WITHDRAWS when its deck runs dry (MODES.pve: it can never out-last him, so a
   quick strike is all a rollout needs). Where both sides stand on one sheet and a dry deck costs the beast 反噬 as it costs
   him (`mode.foeDry` is not 'withdraw': 斗法 v4, setup.even; pvp), trades, the cards left in the pile and the beast's
   board decide the fight, and a face-rush playout mis-values every move (it plays 吐纳 on an empty pile, never trades a
   body, never holds a card): the rollout is `careful`'s. Read off the fight given, never assumed; `deep` forces either. */
export const fairMode = st => Boolean(st?.mode) && st.mode.foeDry !== 'withdraw';

export function lookahead(st, { deep = fairMode(st) } = {}) {
  let best = { kind: 'end' }, top = -Infinity;
  for (const o of [...offers(st).filter(x => x.ok && x.action.kind !== 'end'), { action: { kind: 'end' } }]) {
    const c = copyOf(st);
    if (!act(c, o.action, 'you').ok) continue;
    const v = playOut(c, deep ? careful : plain);
    if (v > top) { top = v; best = o.action; }
  }
  return best;
}

/* ── The same lines for either seat (斗法 v4, the fit: a beast's seat is played by a line chosen by its class) ──
   `offers` and the lines above read the `you` seat; these read the seat asked for — its hand, its pile, its 灵力, the other seat's board. */

/// Every legal play, strike and root strike for `who`.
export function movesOf(st, who = 'you') {
  const me = st[who], them = st[who === 'you' ? 'foe' : 'you'], out = [];
  const aims = [undefined, ...them.board.map((m, index) => ({ kind: 'minion', index }))];
  me.hand.forEach((id, index) => {
    const c = st.catalog[id], at = c && EFFECTS[Object.keys(EFFECTS).find(k => c.effect?.[k] != null)]?.at;
    const targets = at === 'enemy' || at === 'minion' ? aims : at === 'friendly' && me.board.length ? me.board.map((m, i) => ({ kind: 'minion', index: i })) : [undefined];
    for (const target of targets) out.push({ kind: 'play', index, target });
  });
  for (const target of aims) out.push({ kind: 'power', target });
  me.board.forEach((m, index) => { for (const target of aims) out.push({ kind: 'attack', index, target }); });
  return out.filter(a => legal(st, a, who) === null);
}

/// The careful line for `who`: the move that leaves the best board, or null (end the turn).
export function carefulFor(st, who = 'you') {
  const opp = who === 'you' ? 'foe' : 'you';
  let best = null, top = 0.5;
  for (const a of movesOf(st, who)) {
    const copy = copyOf(st);
    if (!act(copy, a, who).ok) continue;
    const v = (st[opp].hp - copy[opp].hp) * 2 + (copy[who].hp - st[who].hp) + (bodyOf(copy[who]) - bodyOf(st[who])) * 1.2 + (bodyOf(st[opp]) - bodyOf(copy[opp]));
    if (v > top) { top = v; best = a; }
  }
  return best;
}

/// The first-card line for `who`: the first card that can be played, the first body to strike, the root strike.
export function plainFor(st, who = 'you') {
  const ms = movesOf(st, who);
  return ms.find(a => a.kind === 'play') ?? ms.find(a => a.kind === 'attack') ?? ms.find(a => a.kind === 'power') ?? null;
}

function rolloutFor(st, who, depth) {
  const opp = who === 'you' ? 'foe' : 'you';
  for (let g = 0; g < depth && st.outcome === 'open'; g += 1) {
    const w = st.whose;
    act(st, carefulFor(st, w) ?? { kind: 'end' }, w);
  }
  if (st.outcome === 'open') return -st[opp].hp;
  return (st.outcome === 'won' ? 'you' : 'foe') === who ? 1000 + st[who].hp : -1000 - st[opp].hp;
}
/// The lookahead line for `who`: each move tried on a copy and the fight played out from there by the careful line on both seats (a cap of `depth`
/// moves bounds the cost: the fight to its end by default, 300); the best ending is played. null ends the turn.
export function lookaheadFor(st, who = 'you', { depth = 300 } = {}) {
  let best = null, top = -Infinity;
  for (const a of [...movesOf(st, who), { kind: 'end' }]) {
    const copy = copyOf(st);
    if (!act(copy, a, who).ok) continue;
    const v = rolloutFor(copy, who, depth);
    if (v > top) { top = v; best = a; }
  }
  return best?.kind === 'end' ? null : best;
}
Object.assign(LINES, { careful: carefulFor, lookahead: lookaheadFor });
