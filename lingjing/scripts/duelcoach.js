// Facts for the duel's coach. All simulations are copies and use seeded shuffles.
import { act, dealt, effectOf, offers, shuffle, simCopy } from './battle.js';
import { careful, playOut } from './fightline.js';

export function unseen(st, seed) {
  const copy = simCopy(st);
  const handSize = copy.foe.hand.length;
  const pool = shuffle([...copy.foe.hand, ...copy.foe.deck], `${seed}|foe`);
  copy.foe.hand = pool.slice(0, handSize);
  copy.foe.deck = pool.slice(handSize);
  copy.you.deck = shuffle(copy.you.deck, `${seed}|you`);
  return copy;
}

export function honestBest(st, { samples = 4, seed = 1 } = {}) {
  if (!Number.isInteger(samples) || samples < 1) throw new RangeError('samples must be a positive integer');
  if (st.outcome !== 'open' || st.whose !== 'you') return { action: null, value: null, all: [] };
  const actions = [...offers(st).filter(o => o.ok && o.action.kind !== 'end').map(o => o.action), { kind: 'end' }];
  const all = actions.map(action => {
    let total = 0;
    for (let i = 0; i < samples; i += 1) {
      const copy = unseen(st, `${seed}|${i}`);
      act(copy, action, 'you');
      total += playOut(copy, careful);
    }
    return { action, value: total / samples };
  });
  const best = all.reduce((a, b) => b.value > a.value ? b : a);
  return { action: best.action, value: best.value, all };
}

export const newCoach = () => ({ gaps: [] });
const key = a => JSON.stringify([a.kind, a.index ?? null, a.target?.kind ?? null, a.target?.index ?? null, a.target?.side ?? null]);
const result = (st, action) => { const c = simCopy(st); return act(c, action, 'you').ok ? c : null; };
const bodyTarget = a => a.target?.kind === 'minion' && a.target.side !== 'mine';
function damage(st, a) {
  if (a.kind === 'attack') { const m = st.you.board[a.index]; return m && { n: m.atk, element: m.element }; }
  if (a.kind === 'power') return { n: st.you.powerHit, element: st.you.root };
  if (a.kind === 'skill') { const e = st.you.skill?.effect; return e?.damage != null ? { n: e.damage, element: e.element } : null; }
  if (a.kind === 'play') {
    const c = st.catalog[st.you.hand[a.index]], e = c && effectOf(st.you, c);
    if (e?.damage != null && (c.kind !== 'minion' || c.keywords?.includes('battlecry'))) return { n: e.damage, element: c.element };
  }
  return null;
}
function snapshot(st, played = false) {
  const board = s => [s.board.length, s.board.reduce((n, m) => n + m.atk, 0), s.board.reduce((n, m) => n + m.hp, 0)];
  return JSON.stringify([st.you.hp, st.foe.hp, board(st.you), board(st.foe), st.you.hand.length + (played ? 1 : 0)]);
}
function describe(st, a) {
  const card = a.kind === 'play' ? st.catalog[st.you.hand[a.index]] : null;
  const out = { kind: a.kind };
  if (card) { out.card = card.id; if (card.name) out.name = card.name; }
  if (bodyTarget(a)) out.target = 'body';
  else if (!a.target && damage(st, a)) out.target = 'face';
  return out;
}
function lesson(st, did, better) {
  const d = result(st, did), b = result(st, better);
  if (b?.outcome === 'won' && d?.outcome !== 'won') return 'kill';
  if (did.kind === 'end' && better.kind !== 'end') return 'unspent';
  if (did.kind === 'play' && d && snapshot(st) === snapshot(d, true)) return 'wasted';
  if (!did.target && damage(st, did) && bodyTarget(better)) return 'trade';
  if (st.foe.board.some((m, i) => m.taunt && !b?.foe.board.some(x => x.uid === m.uid) && d?.foe.board.some(x => x.uid === m.uid))) return 'guard';
  const x = damage(st, did), y = damage(st, better);
  if (x && y && keyTarget(did) === keyTarget(better)) {
    const root = bodyTarget(better) ? st.foe.board[better.target.index]?.element : better.target?.kind === 'ally' ? st.foe.allies[better.target.index]?.root : st.foe.root;
    if (x.element !== y.element && dealt(st, 'you', y.n, y.element, root) > dealt(st, 'you', x.n, x.element, root)
      && dealt(st, 'you', y.n, y.element, root) > dealt(st, 'you', y.n, x.element, root)) return 'element';
  }
  return 'other';
}
const keyTarget = a => JSON.stringify([a.target?.kind ?? 'face', a.target?.index ?? null, a.target?.side ?? null]);
export function note(coach, st, action, opts) {
  const best = honestBest(st, opts);
  const chosen = best.all.find(x => key(x.action) === key(action));
  if (!chosen) return;
  const gap = best.value - chosen.value;
  if (gap <= 0) return;
  coach.gaps.push({ turn: st.turn, lesson: lesson(st, action, best.action), gap, did: describe(st, action), better: describe(st, best.action) });
  coach.gaps.sort((a, b) => b.gap - a.gap);
  coach.gaps.length = Math.min(2, coach.gaps.length);
}
export function summary(coach, st) {
  return { outcome: st.outcome, foe_hp_left: st.foe.hp, foe_hp_max: st.foe.hpMax,
    near: st.outcome === 'lost' && st.foe.hp <= st.foe.hpMax * 0.25,
    gaps: coach.gaps.map(g => ({ ...g, did: { ...g.did }, better: { ...g.better } })),
    pills_left: (st.you.pouch?.length ?? 0) + (st.you.allies ?? []).reduce((n, a) => n + (a.pouch?.length ?? 0), 0) };
}
