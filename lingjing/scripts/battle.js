// battle.js — 斗法 v3, the card game (design.md § 斗法 v3). One core, three
// sets of knobs: PvE today, PvP and the raid later.
//
// Two laws hold this file together:
//
//   1. A CARD IS DATA. Every card is a row in `cards.json`: cost, element, a
//      body, and one effect from the closed vocabulary below. The engine runs
//      the effect; no card carries code of its own. That is what lets one
//      person balance a hundred cards — a new card can move the numbers, never
//      the rules. A card that needs a new verb is a change HERE, with tests.
//   2. ONE TRUTH, TWO READERS. `legal` says what may come next, `offers` draws
//      the buttons, `battle` replays the whole thing from the actions so far.
//      The page shows only what may come; the rules replay the same actions to
//      decide. Nothing is random at play time: the shuffle is seeded, and the
//      creature's side is a policy, not a die.
//
// There is no death in this world, only 退 — a minion driven off, a beast
// withdrawing into the mist.

/* ── The five roots ── */

export const ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth'];
// 相克: 木克土 · 土克水 · 水克火 · 火克金 · 金克木
export const BEATS = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };
/* What a blow is worth into a root. The only 五行 rule in v1 — 相生 (the 势)
   waits.
   ×1.5 and ×0.75, not ×2 and ×0.5. You walk to the beast's haunt, so you know
   what you will fight and you bring the root that overcomes it — and at double
   that choice DECIDED the fight: a deck of the countering element won 92.9%
   where the countered one won 18.3% (the gate, 2026-09-18). A choice worth
   making is not a choice that plays the game for you. */
export const OVER = 1.5;
export const UNDER = 0.75;
export const clash = (element, root) => (!element || !root ? 1 : BEATS[element] === root ? OVER : BEATS[root] === element ? UNDER : 1);

/* ── The realms ── */

/* `power` is what 主灵根一击 hits for — and it is deliberately BELOW a spell of
   the same cost, because it costs nothing to hold and 五行 can double it. The
   gate caught this one: at 2/3/4/5 the free hit was the strongest card in the
   game (4–10 damage for two 灵力 against the root it overcomes, while a 2-cost
   spell deals 3), and the player won nine fights in ten. */
export const REALMS = {
  qi: { hp: 20, mana: 6, power: 1 },
  foundation: { hp: 26, mana: 8, power: 2 },
  core: { hp: 32, mana: 10, power: 2 },
  nascent: { hp: 40, mana: 10, power: 3 },
};
export const TIERS = ['qi', 'foundation', 'core', 'nascent'];

/* 境界压制 — PvE only. A realm above the creature and a daily fight is over in
   a few rounds, which is the point: the day has tasks waiting. A realm below
   and it cuts the other way, so a challenge above your station is a real risk
   with a real prize. */
export const SUPPRESS = { 2: [2, 0.5], 1: [1.5, 0.7], 0: [1, 1], '-1': [0.7, 1.5], '-2': [0.5, 2] };
export function suppression(mine, theirs) {
  const gap = Math.max(-2, Math.min(2, TIERS.indexOf(mine) - TIERS.indexOf(theirs)));
  return SUPPRESS[gap] ?? [1, 1];
}

/* ── The knobs, one set per mode ── */

export const MODES = {
  // A daily 降妖. The creature holds eight cards, and when they run out it
  // WITHDRAWS — the fight ends in neither a win nor a loss, the day is spent
  // and there is no prize. That is the difference between a bounded fight and
  // a farmable one: the gate found that letting its empty deck bleed it meant
  // a player who did nothing at all won one fight in eight (2026-09-18), which
  // is the turtling hole the old 斗法 had. A fight must be WON to pay. It stands at full 气血 at
  // its own realm: the SHORTNESS of a daily fight comes from 境界压制, not from
  // a weak beast (the gate, 2026-09-18: at 0.7 even playing cards blindly won
  // 81% — a fight nobody can lose is not a fight).
  pve: { deck: 10, hand: 3, foeDeck: 12, foeHand: 3, board: 4, suppress: true, youFirst: true, headStart: 0, foeHp: 0.7, foeDry: 'withdraw' },
  // 斗法 at the table: both sides level. Fairness can only come from one mana
  // curve and ten cards each — never from the realm.
  pvp: { deck: 10, hand: 3, foeDeck: 10, foeHand: 4, board: 4, suppress: false, youFirst: true, headStart: 0, foeHp: 1 },
};

export const POWER_COST = 2; // 主灵根一击
export const KEYWORDS = ['taunt', 'battlecry']; // 护主 · 入阵 — the only two in v1

/* The closed vocabulary. An effect is one of these, with `at` naming what it
   may point at. Growing this list is a considered act: every verb multiplies
   the interactions the gate has to hold. */
export const EFFECTS = {
  damage: { at: 'enemy' }, //   打 N 点，可指向随从或对方英雄
  sweep: { at: 'none' }, //     群伤：对方阵前每一个
  heal: { at: 'none' }, //      回自己 N 点气血
  draw: { at: 'none' }, //      抽 N 张
  buff: { at: 'friendly' }, //  给自己一个随从 +攻/+血
  // Two verbs added 2026-09-18, and only two: the gate said deck-building was
  // worth 4.4 points, which is another way of saying every deck played the
  // same. A verb that pays off a SHAPE of deck is what makes a choice — these
  // two pay off the swarm, so a wide deck and a tall deck are different games.
  summon: { at: 'none' }, //    召来 {id, n}：阵前多几个小东西
  rally: { at: 'none' }, //     己方阵前全体 +攻/+血
};

/* ── A small stable hash: the same day, creature and 道号 shuffle the same ── */

export function hashOf(text) {
  let h = 7;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) % 2147483647;
  return h;
}

/* A deck order from a seed. Fisher–Yates off a linear congruential stream —
   the page and the rules must land on the same order or they would disagree
   about a fight neither of them can re-run. */
export function shuffle(ids, seed) {
  const out = [...ids];
  let s = (hashOf(seed) % 2147483646) + 1;
  const next = () => (s = (s * 48271) % 2147483647) / 2147483647;
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ── Setup ── */

/* `setup` is the configuration locked at the door (design.md § 副本契约):
   { mode, seed, you: { tier, step, root, deck, extra }, foe: { tier, root, deck, hp? } }
   `catalog` is the card rows by id. Nothing else reaches the fight. */
function sideOf(who, cfg, catalog, mode, seed) {
  const realm = REALMS[cfg.tier] ?? REALMS.qi;
  const hp = Math.max(1, Math.round((realm.hp + (cfg.step ?? 0) * 0.5) * (cfg.hpScale ?? 1)));
  const deck = shuffle(cfg.deck ?? [], `${seed}|${who}`);
  return {
    who, tier: cfg.tier, root: cfg.root ?? null,
    hp, hpMax: hp, mana: 0, manaMax: 0, manaCap: realm.mana, powerHit: realm.power,
    deck, hand: [...(cfg.extra ?? [])], board: [], fatigue: 0, powerUsed: false, played: [],
  };
}

export function begin(setup, catalog) {
  const mode = MODES[setup.mode] ?? MODES.pve;
  const seed = setup.seed ?? 'x';
  const you = sideOf('you', setup.you, catalog, mode, seed);
  const foe = sideOf('foe', { ...setup.foe, hpScale: mode.foeHp }, catalog, mode, seed);
  const st = { mode, catalog, seed, you, foe, turn: 0, whose: mode.youFirst ? 'you' : 'foe', outcome: 'open', log: [] };
  for (let i = 0; i < mode.hand; i += 1) draw(st, you);
  for (let i = 0; i < mode.foeHand; i += 1) draw(st, foe);
  for (let i = 0; i < (mode.headStart ?? 0); i += 1) draw(st, you);
  const [mine, theirs] = mode.suppress ? suppression(setup.you.tier, setup.foe.tier) : [1, 1];
  st.scale = { you: mine, foe: theirs };
  startTurn(st);
  return st;
}

/* ── The turn ── */

function startTurn(st) {
  const side = st[st.whose];
  side.manaMax = Math.min(side.manaCap, side.manaMax + 1);
  side.mana = side.manaMax;
  side.powerUsed = false;
  for (const m of side.board) m.sick = false;
  for (const m of side.board) m.struck = false;
  if (st.turn > 0 || st.whose === 'foe') draw(st, side);
  st.turn += 1;
}

/* 反噬 — a deck run dry costs 1, then 2, then 3. The creature does not bleed
   that way in PvE: its eight cards spent, it withdraws into the mist, and the
   fight is over with nothing paid (see MODES.pve). */
function draw(st, side) {
  if (side.deck.length) {
    side.hand.push(side.deck.shift());
    return;
  }
  side.fatigue += 1;
  if (side.who === 'foe' && st.mode.foeDry === 'withdraw') {
    if (st.outcome === 'open') {
      st.outcome = 'withdrew';
      st.log.push({ act: 'foe-withdrew' });
    }
    return;
  }
  hurt(st, side, side.fatigue, { kind: 'fatigue' });
}

export function endTurn(st) {
  st.whose = st.whose === 'you' ? 'foe' : 'you';
  startTurn(st);
}

/* ── Damage ── */

function hurt(st, side, amount, why = {}) {
  side.hp = Math.max(0, side.hp - amount);
  st.log.push({ act: 'hurt', who: side.who, amount, hp: side.hp, ...why });
  settle(st);
}

function hurtMinion(st, side, minion, amount, why = {}) {
  minion.hp -= amount;
  st.log.push({ act: 'hurt-minion', who: side.who, id: minion.id, amount, hp: minion.hp, ...why });
  if (minion.hp <= 0) withdraw(st, side, minion);
}

/* A minion at 0 is 退 — driven off, never killed. */
function withdraw(st, side, minion) {
  side.board = side.board.filter(m => m !== minion);
  st.log.push({ act: 'withdrew', who: side.who, id: minion.id });
}

function settle(st) {
  if (st.outcome !== 'open') return;
  if (st.foe.hp <= 0) st.outcome = 'won';
  else if (st.you.hp <= 0) st.outcome = 'lost';
}

/* ── Effects — the closed vocabulary ── */

const other = (st, side) => (side.who === 'you' ? st.foe : st.you);

function resolve(st, side, effect, target) {
  if (!effect) return;
  const them = other(st, side);
  const scale = st.scale?.[side.who] ?? 1;
  const hit = (n, element, root) => Math.max(1, Math.round(n * clash(element, root) * scale));
  if (effect.damage != null) {
    if (target?.kind === 'minion') {
      const m = them.board[target.index];
      if (m) hurtMinion(st, them, m, hit(effect.damage, effect.element, m.element), { from: 'spell' });
    } else {
      hurt(st, them, hit(effect.damage, effect.element, them.root), { from: 'spell' });
    }
  }
  if (effect.sweep != null) {
    for (const m of [...them.board]) hurtMinion(st, them, m, hit(effect.sweep, effect.element, m.element), { from: 'sweep' });
  }
  if (effect.heal != null) {
    side.hp = Math.min(side.hpMax, side.hp + effect.heal);
    st.log.push({ act: 'heal', who: side.who, amount: effect.heal, hp: side.hp });
  }
  if (effect.draw != null) for (let i = 0; i < effect.draw; i += 1) draw(st, side);
  if (effect.summon) {
    const { id, n = 1 } = effect.summon;
    const c = st.catalog[id];
    for (let i = 0; i < n && c && side.board.length < st.mode.board; i += 1) {
      side.board.push({ id, name: c.name, element: c.element, atk: c.atk, hp: c.hp, hpMax: c.hp, taunt: Boolean(c.keywords?.includes('taunt')), sick: true, struck: false });
      st.log.push({ act: 'summoned', who: side.who, id });
    }
  }
  if (effect.rally) {
    for (const m of side.board) {
      m.atk += effect.rally.atk ?? 0;
      m.hp += effect.rally.hp ?? 0;
      m.hpMax += effect.rally.hp ?? 0;
    }
    if (side.board.length) st.log.push({ act: 'rally', who: side.who, ...effect.rally, on: side.board.length });
  }
  if (effect.buff) {
    const m = side.board[target?.index ?? 0];
    if (m) {
      m.atk += effect.buff.atk ?? 0;
      m.hp += effect.buff.hp ?? 0;
      m.hpMax += effect.buff.hp ?? 0;
      st.log.push({ act: 'buff', who: side.who, id: m.id, ...effect.buff });
    }
  }
  settle(st);
}

/* ── What may come next ── */

const card = (st, id) => st.catalog[id];
const hasTaunt = side => side.board.some(m => m.taunt);

export function legal(st, action, who = 'you') {
  if (st.outcome !== 'open') return 'fight-over';
  if (st.whose !== who) return 'not-your-turn';
  const side = st[who];
  const them = other(st, side);
  if (action.kind === 'end') return null;
  if (action.kind === 'power') {
    if (side.powerUsed) return 'power-used';
    if (side.mana < POWER_COST) return 'no-mana';
    if (action.target?.kind === 'minion' && !them.board[action.target.index]) return 'no-target';
    if (action.target?.kind !== 'minion' && hasTaunt(them)) return 'taunt';
    return null;
  }
  if (action.kind === 'play') {
    const id = side.hand[action.index];
    const c = id && card(st, id);
    if (!c) return 'not-in-hand';
    if (side.mana < c.cost) return 'no-mana';
    if (c.kind === 'minion' && side.board.length >= st.mode.board) return 'board-full';
    const at = EFFECTS[Object.keys(EFFECTS).find(k => c.effect?.[k] != null)]?.at;
    if (at === 'enemy' && action.target?.kind === 'minion' && !them.board[action.target.index]) return 'no-target';
    if (at === 'friendly' && !side.board.length) return 'no-friendly';
    return null;
  }
  if (action.kind === 'attack') {
    const m = side.board[action.index];
    if (!m) return 'not-on-board';
    if (m.sick) return 'just-arrived';
    if (m.struck) return 'already-struck';
    if (m.atk <= 0) return 'no-attack';
    if (action.target?.kind === 'minion') {
      if (!them.board[action.target.index]) return 'no-target';
      return null;
    }
    return hasTaunt(them) ? 'taunt' : null;
  }
  return 'bad-action';
}

/* ── Doing it ── */

export function act(st, action, who = 'you') {
  const why = legal(st, action, who);
  if (why) return { ok: false, why };
  const side = st[who];
  const them = other(st, side);
  if (action.kind === 'end') { endTurn(st); return { ok: true }; }
  if (action.kind === 'power') {
    side.mana -= POWER_COST;
    side.powerUsed = true;
    resolve(st, side, { damage: side.powerHit, element: side.root }, action.target);
    st.log.push({ act: 'power', who: side.who, element: side.root });
    return { ok: true };
  }
  if (action.kind === 'play') {
    const id = side.hand[action.index];
    const c = card(st, id);
    side.hand.splice(action.index, 1);
    side.mana -= c.cost;
    side.played.push(id);
    if (c.kind === 'minion') {
      const m = { id, name: c.name, element: c.element, atk: c.atk, hp: c.hp, hpMax: c.hp, taunt: Boolean(c.keywords?.includes('taunt')), sick: true, struck: false };
      side.board.push(m);
      st.log.push({ act: 'played', who: side.who, id, kind: 'minion' });
      if (c.keywords?.includes('battlecry')) resolve(st, side, { ...c.effect, element: c.element }, action.target);
    } else {
      st.log.push({ act: 'played', who: side.who, id, kind: 'spell' });
      resolve(st, side, { ...c.effect, element: c.element }, action.target);
    }
    return { ok: true };
  }
  // 攻击 — both sides take the other's 攻, which is the whole of the exchange.
  const m = side.board[action.index];
  m.struck = true;
  const scale = st.scale?.[side.who] ?? 1;
  if (action.target?.kind === 'minion') {
    const t = them.board[action.target.index];
    hurtMinion(st, them, t, Math.max(1, Math.round(m.atk * clash(m.element, t.element) * scale)), { from: 'attack' });
    if (t.atk > 0) hurtMinion(st, side, m, Math.max(1, Math.round(t.atk * clash(t.element, m.element))), { from: 'return' });
  } else {
    hurt(st, them, Math.max(1, Math.round(m.atk * clash(m.element, them.root) * scale)), { from: 'attack' });
  }
  return { ok: true };
}

/* ── The creature's side: a policy, never a die ── */

/* It plays what it can afford, biggest first; then every minion strikes — a
   护主 in the way, or the hero. Its deck order is its personality: the eight
   cards it holds are what this beast IS. */
export function foeTurn(st) {
  const side = st.foe;
  for (let guard = 0; guard < 24 && st.outcome === 'open'; guard += 1) {
    const playable = side.hand
      .map((id, index) => ({ index, c: card(st, id) }))
      .filter(({ c }) => c && c.cost <= side.mana)
      .sort((a, b) => b.c.cost - a.c.cost);
    const next = playable.find(({ index, c }) => !legal(st, { kind: 'play', index, target: aimFor(st, side, c) }, 'foe'));
    if (!next) break;
    act(st, { kind: 'play', index: next.index, target: aimFor(st, side, next.c) }, 'foe');
  }
  if (st.outcome === 'open' && !legal(st, { kind: 'power', target: aimPower(st, side) }, 'foe')) {
    act(st, { kind: 'power', target: aimPower(st, side) }, 'foe');
  }
  for (let i = 0; i < side.board.length && st.outcome === 'open'; i += 1) {
    const target = hasTaunt(st.you) ? { kind: 'minion', index: st.you.board.findIndex(m => m.taunt) } : bestAttack(st, side, i);
    if (!legal(st, { kind: 'attack', index: i, target }, 'foe')) act(st, { kind: 'attack', index: i, target }, 'foe');
  }
  if (st.outcome === 'open') act(st, { kind: 'end' }, 'foe');
}

/* Where a creature points a card: a sweep needs no aim, a buff takes its own
   biggest body, and anything that hurts goes at the 护主 first, then the hero. */
function aimFor(st, side, c) {
  const them = other(st, side);
  if (c.effect?.buff) return { kind: 'minion', index: 0 };
  if (c.effect?.damage == null) return undefined;
  const taunt = them.board.findIndex(m => m.taunt);
  if (taunt >= 0) return { kind: 'minion', index: taunt };
  return them.hp <= c.effect.damage * 2 ? undefined : (them.board.length ? { kind: 'minion', index: 0 } : undefined);
}

function aimPower(st, side) {
  const them = other(st, side);
  const taunt = them.board.findIndex(m => m.taunt);
  return taunt >= 0 ? { kind: 'minion', index: taunt } : undefined;
}

/* Trade where the trade is good — a minion it can drive off and survive —
   otherwise the hero. */
function bestAttack(st, side, index) {
  const m = side.board[index];
  const them = other(st, side);
  const kills = them.board
    .map((t, i) => ({ i, t, dealt: Math.round(m.atk * clash(m.element, t.element)), back: Math.round(t.atk * clash(t.element, m.element)) }))
    .filter(o => o.dealt >= o.t.hp)
    .sort((a, b) => (a.back - b.back) || (b.t.atk - a.t.atk));
  return kills.length && kills[0].back < m.hp ? { kind: 'minion', index: kills[0].i } : undefined;
}

/* ── Replay: the one truth both readers share ── */

/* `actions` are the player's, in order; the creature's turns are played by the
   policy whenever it is its turn. Give it the same setup and the same actions
   and it lands in the same place, every time, on either side of the wire. */
export function battle(actions, setup, catalog) {
  const st = begin(setup, catalog);
  for (const action of actions) {
    while (st.whose === 'foe' && st.outcome === 'open') foeTurn(st);
    if (st.outcome !== 'open') break;
    const out = act(st, action, 'you');
    if (!out.ok) return { ...view(st), refused: { action, why: out.why } };
  }
  while (st.whose === 'foe' && st.outcome === 'open') foeTurn(st);
  return view(st);
}

/* What the page draws and the rules read — never the whole state. */
export function view(st) {
  const side = s => ({
    hp: s.hp, hpMax: s.hpMax, mana: s.mana, manaMax: s.manaMax, manaCap: s.manaCap,
    root: s.root, deck: s.deck.length, hand: s.hand.length, fatigue: s.fatigue,
    powerUsed: s.powerUsed, powerHit: s.powerHit,
    board: s.board.map(m => ({ id: m.id, name: m.name, element: m.element, atk: m.atk, hp: m.hp, hpMax: m.hpMax, taunt: m.taunt, ready: !m.sick && !m.struck })),
  });
  return { outcome: st.outcome, turn: st.turn, whose: st.whose, you: { ...side(st.you), hand: st.you.hand }, foe: side(st.foe), log: st.log, scale: st.scale };
}

/* ── The buttons ── */

/* Every action the player could take right now, each ok or with its why and
   what it spends. The card draws only what is here; nothing hides in a tooltip. */
export function offers(st) {
  const out = [];
  const them = st.foe;
  const targets = c => {
    const at = EFFECTS[Object.keys(EFFECTS).find(k => c.effect?.[k] != null)]?.at;
    if (at === 'enemy') return [undefined, ...them.board.map((m, index) => ({ kind: 'minion', index }))];
    if (at === 'friendly') return st.you.board.map((m, index) => ({ kind: 'minion', index }));
    return [undefined];
  };
  st.you.hand.forEach((id, index) => {
    const c = card(st, id);
    if (!c) return;
    for (const target of targets(c)) {
      const action = { kind: 'play', index, target };
      const why = legal(st, action, 'you');
      out.push({ action, card: c, id, cost: c.cost, why, ok: why === null });
    }
  });
  for (const target of [undefined, ...them.board.map((m, index) => ({ kind: 'minion', index }))]) {
    const action = { kind: 'power', target };
    const why = legal(st, action, 'you');
    out.push({ action, cost: POWER_COST, why, ok: why === null });
  }
  st.you.board.forEach((m, index) => {
    for (const target of [undefined, ...them.board.map((t, i) => ({ kind: 'minion', index: i }))]) {
      const action = { kind: 'attack', index, target };
      const why = legal(st, action, 'you');
      out.push({ action, minion: m, cost: 0, why, ok: why === null });
    }
  });
  out.push({ action: { kind: 'end' }, cost: 0, why: null, ok: true });
  return out;
}
