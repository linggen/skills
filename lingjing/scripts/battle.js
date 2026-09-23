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

/* What a blow of n, of this element, takes off a target of that one — THE
   one formula: the fight settles with it and the page prints it, so the
   number on the screen is the number that lands (his, 2026-09-22: 五行 is
   too much to reckon with four roots — 让页面算). `who` is the striker. */
export const dealt = (st, who, n, element, target) => Math.max(1, Math.round(n * clash(element, target) * (st.scale?.[who] ?? 1)));

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
  // 灵力 opens at TWO, not one. Hearthstone starts at one because it plays ten
  // turns; ours plays six, and a first turn where the only honest move is to
  // pass is a sixth of the fight spent watching (his first play, 2026-09-18:
  // "我只能放一个牌上去").
  // A daily 降妖. The creature holds twelve cards, and when they run out it
  // WITHDRAWS — the fight ends in neither a win nor a loss, the day is spent
  // and there is no prize. That is the difference between a bounded fight and
  // a farmable one: the gate found that letting its empty deck bleed it meant
  // a player who did nothing at all won one fight in eight (2026-09-18), which
  // is the turtling hole the old 斗法 had. A fight must be WON to pay. It stands at full 气血 at
  // its own realm: the SHORTNESS of a daily fight comes from 境界压制, not from
  // a weak beast (the gate, 2026-09-18: at 0.7 even playing cards blindly won
  // 81% — a fight nobody can lose is not a fight).
  pve: { deck: 10, hand: 3, foeDeck: 12, foeHand: 3, board: 4, suppress: true, youFirst: true, headStart: 0, foeHp: 0.7, foeDry: 'withdraw', startMana: 2, sigAt: 0.5 },
  // 斗法 at the table: both sides level. Fairness can only come from one mana
  // curve and ten cards each — never from the realm.
  pvp: { deck: 10, hand: 3, foeDeck: 10, foeHand: 4, board: 4, suppress: false, youFirst: true, headStart: 0, foeHp: 1, startMana: 2 },
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
   { mode, seed, you: { tier, step, root, deck, extra, power?, boost?, wounds?, lifts?, insight? }, foe: { tier, root, deck, hp?, signature?, elite? } }
   `lifts` is { cardId: { atk, hp, heal } } — a body that stands taller for this
   side (银月 by the bond, rules.mjs § 羁绊); `bodyOf` is the one reading.
   `power` is what a worn 法器 adds to 主灵根一击; `boost` is the day's cast
   asked about fights — { element, n }: that element's 功法 hit n harder
   (or softer, n < 0). Both are locked at the door like the rest.
   `signature` is the beast's 杀招 (creatures.json): { id, name, effect }.
   `catalog` is the card rows by id. Nothing else reaches the fight. */
function sideOf(who, cfg, catalog, mode, seed) {
  const realm = REALMS[cfg.tier] ?? REALMS.qi;
  const hp = Math.max(1, Math.round((realm.hp + (cfg.step ?? 0) * 0.5) * (cfg.hpScale ?? 1)));
  // 伤势: the player walks in carrying yesterday's fight (rules.mjs § 伤势).
  const now = Math.max(1, hp - Math.max(0, cfg.wounds ?? 0));
  const deck = shuffle(cfg.deck ?? [], `${seed}|${who}`);
  return {
    who, tier: cfg.tier, root: cfg.root ?? null,
    hp: now, hpMax: hp, mana: 0, manaMax: (mode.startMana ?? 1) - 1, manaCap: realm.mana, powerHit: realm.power + (cfg.power ?? 0), boost: cfg.boost ?? null,
    deck, hand: [...(cfg.extra ?? [])], board: [], fatigue: 0, powerUsed: false, played: [],
    signature: cfg.signature ?? null, charge: null, lifts: cfg.lifts ?? null, insight: cfg.insight ?? 0, intent: null,
  };
}

/* Every card the door locked in that this catalog cannot name. A fight begun
   without its cards is not a hard fight, it is a DEAD one: the hand is dealt,
   nothing in it may be played, and the only two buttons that still answer are
   主灵根一击 and 结束回合. That is the exact fight he lost on 2026-09-18 —
   twenty taps, nine cards still in hand — because the page he was playing on
   was built before it read cards.json. It cost a fight, a day's 体力 and the
   day's encounter, and nothing anywhere said a word. So it is loud here. */
export const missingCards = (setup, catalog) =>
  [...(setup?.you?.deck ?? []), ...(setup?.you?.extra ?? []), ...(setup?.foe?.deck ?? []), ...(setup?.foe?.signature?.effect?.summon ? [setup.foe.signature.effect.summon.id] : [])]
    .filter((id, i, all) => all.indexOf(id) === i && !catalog?.[id]);

export function begin(setup, catalog) {
  const mode = MODES[setup.mode] ?? MODES.pve;
  const seed = setup.seed ?? 'x';
  const unknown = missingCards(setup, catalog);
  if (unknown.length) throw new Error(`no card row for ${unknown.join(', ')}`);
  const you = sideOf('you', setup.you, catalog, mode, seed);
  // 精英 stand at their full 气血 (creatures.json `elite`); the rest at the mode's share.
  const foe = sideOf('foe', { ...setup.foe, hpScale: setup.foe.elite ? 1 : mode.foeHp }, catalog, mode, seed);
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
  if (side.charge?.phase === 'ready') unleash(st, side);
  if (st.outcome !== 'open') return;
  if (st.turn > 0 || st.whose === 'foe') draw(st, side);
  st.turn += 1;
  if (st.whose === 'you') plan(st);
}

/* ── 意图 — what the beast will do, decided at the start of your turn ──
   His call, 2026-09-23: the beast commits to its next turn before you move
   (Slay the Spire's intent), and 望气术 is what lets a player SEE it — the
   plan is made for everyone, so a player who can read it reads something
   true. It is the cards it will play, in order, and whether it strikes with
   its root; its turn then does exactly that where it still may (a target gone
   is re-aimed, a card that can no longer be played is let go — never
   replaced by another). Its rank still strikes as it always did. */
function plan(st) {
  if (st.planning || st.outcome !== 'open') return;
  const { catalog, origin, history, ...rest } = st;
  const sim = Object.assign(structuredClone(rest), { catalog, planning: true });
  sim.foe.intent = null;
  endTurn(sim);
  const cards = [];
  let power = false;
  for (let guard = 0; guard < 20 && sim.outcome === 'open' && sim.whose === 'foe'; guard += 1) {
    const did = foeStep(sim);
    if (did?.kind === 'play') cards.push(sim.foe.played[sim.foe.played.length - 1]);
    else if (did?.kind === 'power') power = true;
    else break;
  }
  st.foe.intent = { cards, power, gathering: sim.foe.charge?.phase === 'gathering' && st.foe.charge?.phase === 'gathering' };
}

/* ── 杀招 — the one turn in every fight that decides it ──
   The gate, 2026-09-23: at 筑基 the player lost 0.7% of fights and bled a
   median 12% — the beast never threatened, so no turn mattered (even doing
   nothing on turn one still won). His call: every fight has a key turn, and
   it comes when the beast falls to half its 气血 (so every fight that is won
   meets it, midway). Then it GATHERS: its next turn it plays nothing — its
   rank still strikes — and the page shows what is coming, in the numbers
   that will land. The turn after is yours, whole, to answer it: finish it
   first, stand a 护主 (the blow takes the guard first), heal, or hold your
   bodies back from a sweep. Then it lets go, once a fight. */
function gather(st, side) {
  if (!side.signature || side.charge || side.hp <= 0 || side.hp > side.hpMax * (st.mode.sigAt ?? 0)) return;
  side.charge = { phase: 'gathering' };
  st.log.push({ act: 'charge', who: side.who, id: side.signature.id });
}

function unleash(st, side) {
  side.charge = { phase: 'spent' };
  st.log.push({ act: 'unleash', who: side.who, id: side.signature.id });
  const them = other(st, side);
  const guard = them.board.findIndex(m => m.taunt);
  resolve(st, side, { ...side.signature.effect, element: side.root }, guard >= 0 ? { kind: 'minion', index: guard } : undefined);
}

/* 反噬 — a deck run dry costs 1, then 2, then 3. The creature does not bleed
   that way in PvE: its twelve cards spent, it withdraws into the mist, and the
   fight is over with nothing paid (see MODES.pve). */
function draw(st, side) {
  if (side.deck.length) {
    side.hand.push(side.deck.shift());
    // Written down so the screen can fly a card off the pile: the animator
    // only ever replays what the rules recorded.
    st.log.push({ act: 'drew', who: side.who, left: side.deck.length });
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
  const done = st[st.whose];
  if (done.charge?.phase === 'gathering') done.charge = { phase: 'ready' };
  st.whose = st.whose === 'you' ? 'foe' : 'you';
  startTurn(st);
}

/* ── Damage ── */

function hurt(st, side, amount, why = {}) {
  side.hp = Math.max(0, side.hp - amount);
  st.log.push({ act: 'hurt', who: side.who, amount, hp: side.hp, ...why });
  settle(st);
  if (st.outcome === 'open') gather(st, side);
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
  const hit = (n, element, root) => dealt(st, side.who, n, element, root);
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

/* What a card does in this side's hands: a 功法 of the day's element hits
   `boost.n` harder (never below 1). The page draws the card from this too, so
   the number on the card is the number that lands. */
export function effectOf(side, c) {
  // A lift on the card's own number (银月铃: her battlecry heals one more).
  const e = boostedOf(side, c), h = side?.lifts?.[c?.id]?.heal;
  return h && e?.heal != null ? { ...e, heal: e.heal + h } : e;
}

/* The day's cast alone — the card says why its number moved. */
export function boostedOf(side, c) {
  const e = c?.effect;
  const b = side?.boost;
  if (!e || c.kind !== 'spell' || !b?.n || b.element !== c.element) return e;
  const lift = n => (n == null ? n : Math.max(1, n + b.n));
  return { ...e, ...(e.damage != null ? { damage: lift(e.damage) } : {}), ...(e.sweep != null ? { sweep: lift(e.sweep) } : {}) };
}

/* A minion's body in this side's hands: the card's, lifted by `lifts`. The
   page draws the hand from this too, so the numbers on the card are the ones
   that stand. */
export function bodyOf(side, c) {
  const l = side?.lifts?.[c?.id];
  return { atk: (c?.atk ?? 0) + (l?.atk ?? 0), hp: (c?.hp ?? 0) + (l?.hp ?? 0) };
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
      const { atk, hp } = bodyOf(side, c);
      const m = { id, name: c.name, element: c.element, atk, hp, hpMax: hp, taunt: Boolean(c.keywords?.includes('taunt')), sick: true, struck: false };
      side.board.push(m);
      st.log.push({ act: 'played', who: side.who, id, kind: 'minion' });
      if (c.keywords?.includes('battlecry')) resolve(st, side, { ...effectOf(side, c), element: c.element }, action.target);
    } else {
      st.log.push({ act: 'played', who: side.who, id, kind: 'spell' });
      resolve(st, side, { ...effectOf(side, c), element: c.element }, action.target);
    }
    return { ok: true };
  }
  // 攻击 — both sides take the other's 攻, which is the whole of the exchange.
  const m = side.board[action.index];
  m.struck = true;
  if (action.target?.kind === 'minion') {
    const t = them.board[action.target.index];
    hurtMinion(st, them, t, dealt(st, side.who, m.atk, m.element, t.element), { from: 'attack' });
    if (t.atk > 0) hurtMinion(st, side, m, Math.max(1, Math.round(t.atk * clash(t.element, m.element))), { from: 'return' });
  } else {
    hurt(st, them, dealt(st, side.who, m.atk, m.element, them.root), { from: 'attack' });
  }
  return { ok: true };
}

/* ── The creature's side: a policy, never a die ── */

/* ONE move of the creature's, and then it hands the screen back. A whole turn
   taken between two renders is a turn the player never sees — three seconds of
   nothing, which reads as a hang (his, 2026-09-18: 对方不打呢, 卡住了). The page
   loops on this, drawing and animating each move as it lands.
   Order: play what it can afford, biggest first; then its 主灵根一击; then send
   each body at whatever stands in the way. Its deck order is its personality —
   the twelve cards it holds are what this beast IS. */
export function foeStep(st) {
  if (st.outcome !== 'open' || st.whose !== 'foe') return null;
  const side = st.foe;
  const gathering = side.charge?.phase === 'gathering';
  // A plan made at the start of your turn is kept (§ 意图); with none (the
  // plan being drawn up, or a fight begun before plans) it chooses as it goes.
  const intent = st.planning ? null : side.intent;
  // Gathering, it plays nothing — whatever it meant to (§ 杀招).
  if (intent && !gathering) {
    while (intent.cards.length) {
      const id = intent.cards.shift();
      const index = side.hand.indexOf(id);
      const c = card(st, id);
      if (index < 0 || !c) continue;
      const action = { kind: 'play', index, target: aimFor(st, side, c) };
      if (legal(st, action, 'foe')) continue;
      act(st, action, 'foe');
      return action;
    }
  }
  const playable = gathering || intent ? [] : side.hand
    .map((id, index) => ({ index, c: card(st, id) }))
    .filter(({ c }) => c && c.cost <= side.mana)
    .sort((a, b) => b.c.cost - a.c.cost);
  const next = playable.find(({ index, c }) => !legal(st, { kind: 'play', index, target: aimFor(st, side, c) }, 'foe'));
  if (next) {
    const action = { kind: 'play', index: next.index, target: aimFor(st, side, next.c) };
    act(st, action, 'foe');
    return action;
  }
  const strikes = intent ? intent.power && !gathering : !gathering;
  if (intent) intent.power = false;
  if (strikes && !legal(st, { kind: 'power', target: aimPower(st, side) }, 'foe')) {
    const action = { kind: 'power', target: aimPower(st, side) };
    act(st, action, 'foe');
    return action;
  }
  for (let i = 0; i < side.board.length; i += 1) {
    const target = hasTaunt(st.you) ? { kind: 'minion', index: st.you.board.findIndex(m => m.taunt) } : bestAttack(st, side, i);
    const action = { kind: 'attack', index: i, target };
    if (!legal(st, action, 'foe')) {
      act(st, action, 'foe');
      return action;
    }
  }
  side.intent = null;
  act(st, { kind: 'end' }, 'foe');
  return { kind: 'end' };
}

/* Its whole turn at once — for the rules, the gate and anything with no screen
   to draw on. The page uses `foeStep`. */
export function foeTurn(st) {
  for (let guard = 0; guard < 40 && st.outcome === 'open' && st.whose === 'foe'; guard += 1) {
    if (foeStep(st)?.kind === 'end') return;
  }
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

/* ── Actions as text — the wire between the page and the rules ──
   The page sends what the player did as a list of small strings, and the rules
   replay the same list to settle it. Same shape as the old bout's picks, so
   `duel --picks=…` did not have to change its skin:
     play:2        play:2@e0      play:2@m1
     attack:0      attack:0@e1    power     power@e0     end               */

export function tokenOf(a) {
  const at = a.target ? `@${a.target.side === 'mine' ? 'm' : 'e'}${a.target.index}` : '';
  if (a.kind === 'play') return `play:${a.index}${at}`;
  if (a.kind === 'attack') return `attack:${a.index}${at}`;
  if (a.kind === 'power') return `power${at}`;
  return 'end';
}

export function actionOf(token) {
  const [head, aim] = String(token).split('@');
  const [kind, index] = head.split(':');
  const target = aim ? { kind: 'minion', index: Number(aim.slice(1)), side: aim[0] === 'm' ? 'mine' : 'theirs' } : undefined;
  if (kind === 'play' || kind === 'attack') return { kind, index: Number(index), target };
  if (kind === 'power') return { kind: 'power', target };
  return { kind: 'end' };
}

/* ── Replay: the one truth both readers share ── */

/* `actions` are the player's, in order; the creature's turns are played by the
   policy whenever it is its turn. Give it the same setup and the same actions
   and it lands in the same place, every time, on either side of the wire. */
export function battle(actions, setup, catalog) {
  const st = begin(setup, catalog);
  for (const raw of actions) {
    const action = typeof raw === 'string' ? actionOf(raw) : raw;
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
    powerUsed: s.powerUsed, powerHit: s.powerHit, boost: s.boost,
    signature: s.signature, charge: s.charge?.phase ?? null, lifts: s.lifts,
    board: s.board.map(m => ({ id: m.id, name: m.name, element: m.element, atk: m.atk, hp: m.hp, hpMax: m.hpMax, taunt: m.taunt, ready: !m.sick && !m.struck })),
  });
  // 望气术: the plan is shown only to a player who can read it (setup.you.insight).
  const sight = st.you.insight ?? 0;
  const intent = sight && st.foe.intent ? { sight, cards: [...st.foe.intent.cards], power: st.foe.intent.power, gathering: st.foe.intent.gathering } : null;
  return { outcome: st.outcome, turn: st.turn, whose: st.whose, you: { ...side(st.you), hand: st.you.hand }, foe: { ...side(st.foe), ...(intent ? { intent } : {}) }, log: st.log, scale: st.scale };
}

/* Nothing left but to end the turn — no card affordable, no body that may
   strike, no 主灵根一击. The page shows it and, after a beat, ends the turn by
   itself: a turn with an empty purse is not a decision, and he read one as the
   fight having hung (2026-09-18). */
export const idle = st => st.outcome === 'open' && st.whose === 'you' && !offers(st).some(o => o.ok && o.action.kind !== 'end');

/* ── The buttons ── */

/* Every action the player could take right now, each ok or with its why and
   what it spends. The card draws only what is here; nothing hides in a tooltip. */
export function offers(st) {
  const out = [];
  const them = st.foe;
  // A card ALWAYS gets at least one row, even when it has nowhere to point:
  // otherwise the card face has no refusal to show and a card nobody can play
  // looks playable (seen in the browser, 2026-09-18 — 焰心 with an empty rank).
  const targets = c => {
    const at = EFFECTS[Object.keys(EFFECTS).find(k => c.effect?.[k] != null)]?.at;
    if (at === 'enemy') return [undefined, ...them.board.map((m, index) => ({ kind: 'minion', index }))];
    if (at === 'friendly') return st.you.board.length ? st.you.board.map((m, index) => ({ kind: 'minion', index })) : [undefined];
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
