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
import * as lines from './fightline.js';

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
export const dealt = (st, who, n, element, target) => n === 0 ? 0 : Math.max(1, Math.round(n * clash(element, target) * (st.scale?.[who] ?? 1)));
/* Levels (batch 3, rules/power.mjs). A fight is reckoned in HIS units: his 气血 at full is P₁'s (练气一层's, 21), and every
   number in the fight is a card number as at 练气一层 — so a fight of two sides at one level is the fight at 练气一层, turn for
   turn and number for number, rounding and all. A beast of another level stands P(its level) ÷ P(his) to him (`f`, its
   side's level factor): its 气血, every blow it deals (st.scale), and every amount it has that is weighed against 气血
   (`scaled`: a body's 血 as it stands, a 增益's +血, a heal, a glance's `lands`, a lift's 抗). What the page shows is all of it
   × P(his level) ÷ P₁ (`st.unit`, `shown`): the numbers grow with his level, the fight does not change. No level on the door
   (零层, and a fight opened before levels were — its setup carries none): factor 1, unit 1, today's numbers. */
export const unitOf = st => st?.unit ?? 1;
/* A fight number as the page and the rules' results show it: × P(his level) ÷ P₁, a whole number (0 stays 0). */
export const shown = (st, n) => (!n || typeof n !== 'number' || (unitOf(st) === 1 && Number.isInteger(n)) ? n : Math.max(1, Math.round(n * unitOf(st))));
/* A side of view(st) as the rules' results hand it out (the phone and the page read them): its 气血, 护体, members and bodies × the
   unit — the numbers the room showed. */
export function shownSide(v, side) {
  if (!side || unitOf(v) === 1) return side;
  const S = n => shown(v, n);
  return { ...side, hp: S(side.hp), hpMax: S(side.hpMax), armor: S(side.armor), powerHit: S(side.powerHit),
    ...(side.allies ? { allies: side.allies.map(a => ({ ...a, hp: S(a.hp), hpMax: S(a.hpMax) })) } : {}),
    ...(side.board ? { board: side.board.map(m => ({ ...m, atk: S(m.atk), hp: S(m.hp), hpMax: S(m.hpMax) })) } : {}) };
}
/* A log entry's numbers as the page shows them (the floats, 上一手): its 气血 amounts × the unit. */
const SHOWN_LOG = ['amount', 'absorbed', 'heal', 'hp', 'armor', 'atk'];
export const shownEntry = (t, unit = 1) => (unit === 1 || !t ? t : { ...t, ...Object.fromEntries([...SHOWN_LOG, ...(t.act === 'drought' ? ['n'] : [])].filter(k => typeof t[k] === 'number' && t[k] > 0).map(k => [k, Math.max(1, Math.round(t[k] * unit))])) });
/* What a card does, as its face states it in this fight (the page's card text): every amount × the unit, a beast's ×
   its own level factor too — so 「打 3 点」 reads what it is worth at his level. A blow's number on a card is the card's, not
   what it lands on a root (the badges and 「→ 对它 n」 say that). */
const SHOWN_KEYS = ['damage', 'sweep', 'heal', 'drought'];
export function shownEffect(st, side, e) {
  if (!e || (unitOf(st) === 1 && levelOf(side) === 1)) return e;
  const n = v => shown(st, scaled(side, v));
  const out = { ...e };
  for (const k of SHOWN_KEYS) if (typeof out[k] === 'number') out[k] = n(out[k]);
  for (const k of ['buff', 'rally']) if (out[k]) out[k] = { ...out[k], ...(out[k].atk ? { atk: n(out[k].atk) } : {}), ...(out[k].hp ? { hp: n(out[k].hp) } : {}) };
  return out;
}
export const levelOf = side => side?.f ?? 1;
export const scaled = (side, n) => (levelOf(side) === 1 || !n ? n : Math.max(1, Math.round(n * levelOf(side))));

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
export const KEYWORDS = ['taunt', 'battlecry']; // 护主 · 入阵 — the only two in v1 (大旱 is a verb that stands, not a keyword)

/* The closed vocabulary. An effect is one of these, with `at` naming what it
   may point at. Growing this list is a considered act: every verb multiplies
   the interactions the gate has to hold. */
export const EFFECTS = {
  armor: { at: 'none' }, // 护体: add to the lead's armor
  hold: { at: 'minion' }, // 定身: one opposing body misses its next turn
  poison: { at: 'minion' }, // 毒: one opposing body
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
  // Four more, 2026-09-25 — the chapter bosses' legends, each a verb any card
  // may carry (the gate weighs them: tools/battle-sim.mjs § 首领牌).
  chain: { at: 'minion' }, //   锁 (无支祁, chained under 龟山): one of its rank sits out its next turn
  swallow: { at: 'minion' }, // 吞 {swallow: N} (巴蛇): one of its rank with 攻 ≤ N is gone
  drain: { at: 'none' }, //     灵力 −N (夔's drum): the other side has N less on its next turn only
  drought: { at: 'none' }, //   大旱 (肥遗): a STANDING verb — at the end of its side's every turn, N to each of the other rank
  // Two more, 2026-10-16 (cards.md § 4) — a mortal's first hand and the book's 回气丹:
  dodge: { at: 'none' }, //     一滚 (三试): the next N blows at the lead are turned aside
  mana: { at: 'none' }, //      回气丹 (「丹田空了吞一颗」): N 灵力 back this turn, never past the cap
  // One more, 2026-11-07 (Hanli: 蛫's 「可以御火」 must be true — option a): 御 {element, half, turns} — blows of that
  // element at its lead land halved (round down, at least 1) until the end of the other side's next `turns` turns.
  ward: { at: 'none' },
  furWard: { at: 'none' },
  turnRally: { at: 'none' },
};

/* One standing beast state beside the card verbs, 2026-10-16 — 装睡 (犰狳,
   见人则眠: it falls down playing dead when people near). Declared on the
   beast (creatures.json `feint`), never named here:
     { name, turns, lands, pierce: [element…], per_glance, pierce_binds? }
   For its first `turns` turns it lies still — it plays nothing and strikes
   with nothing, and it never gathers. A blow at it of an element not in
   `pierce` glances: it lands `lands` (the page prints the same, `landed`)
   and is counted. When the sleep runs out it wakes with its 杀招, `per_glance`
   harder for every blow that glanced — a careless player feeds the trap. A
   shell-hider or any beast that plays dead declares the same.
   `pierce_binds` (2026-10-16): a card that binds (cards.json `binds` — 青藤缚,
   无支祁's 锁) played at the beast itself, not at its rank, holds it: every
   blow of that turn goes in whole, the bind's own first (阿禾 binds it, 小满 strikes). */
export const asleep = side => Boolean(side?.feint && side.feint.left > 0);
export const pierces = (side, element) => Boolean(side?.feint?.bound) || (Boolean(element) && (side?.feint?.pierce ?? []).includes(element));
/* A bind played at a sleeper that lets binds through (§ asleep): held for the rest of this turn. */
function bindAt(st, them, c, target) {
  if (!c?.binds || target?.kind === 'minion' || !asleep(them) || !them.feint.pierce_binds) return;
  them.feint.bound = true;
  st.log.push({ act: 'bound', who: them.who, id: c.id });
}
const glances = (side, element) => asleep(side) && !pierces(side, element);
/* Its 杀招 as it will land: on waking, `per_glance` more per blow that glanced. */
export function sigEffect(side) {
  const e = side?.signature?.effect ?? {}, f = side?.feint;
  if (!f?.per_glance || e.damage == null || !f.glanced) return e;
  return { ...e, damage: e.damage + f.per_glance * f.glanced };
}

/* Does this body fit the aimed verb? 吞 takes only what is small enough to
   swallow; 锁 takes anything. */
export const fits = (e, m) => Boolean(m) && (e?.swallow == null || m.atk <= e.swallow);

/* ── A small stable hash: the same day, creature and 名字 shuffle the same ── */

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
   { mode, seed, you: { tier, step, root, deck, extra, power?, armor?, ward?, boost?, wounds?, lifts?, insight?, fatigue? (false: a dry deck costs nothing) }, foe: { tier, root, deck, hp?, signature?, feint? } }
   `lifts` is { cardId: { atk, hp, heal, damage, taunt } } — a card that stands
   taller for this side (银月 by the realm and the cauldrons found,
   rules/companion.mjs herLifts): its body (`bodyOf`), a number added to what
   it does (`effectOf`; a `damage` it lacked is a blow at the beast itself, no
   aim asked), 护主 (`keywordsOf`), and `ward` { element: n } — a blow of that
   element lands n lighter on the body (`minionLands`, at least 1: her 佩).
   `power` is what a worn 法器 adds to 主灵根一击; `boost` is the day's cast
   asked about fights — { element, n }: that element's 功法 hit n harder
   (or softer, n < 0). Both are locked at the door like the rest.
   `armor` is 护体 from a worn 法衣 (its 防): a pool that takes a blow on the
   hero before 气血 does, spent as it goes, never mended in the fight — and
   never carried out of it. `ward` is a 佩's 抗,
   { element: n }: a blow of that element lands n lighter on the hero (at
   least 1 — 抗 never negates). All of it from the world's gear (rules.mjs
   § 装备入局); the fight only reads the numbers.
   `stars` is { cardId: n } — a 功法 tempered in 闭关 (rules/seclusion.mjs):
   each ★ takes 1 off its 灵力 while it costs more than 1, and past that adds
   1 to its number (`costOf`, `effectOf`). Locked at the door like the rest.
   `foe.hp` is a multiple of its mode's share of 气血 (creatures.json `hp`, a pool
   entry's own over it — how one beast is weighed; tools/story-fights.mjs).
   `signature` is the beast's 杀招 (creatures.json): { id, name, effect }.
   `catalog` is the card rows by id. Nothing else reaches the fight. */
/* 小队 (cards.md § 5, Hanli 2026-10-16): a side is a ROW of members. The lead's
   own numbers stay on the side itself (every reader — the page, the sims, the
   rules' settle — reads `side.hp`), and the members beside it are `allies`,
   from `cfg.party`: [{ id, name, root, hp (a share of the lead's 气血), taunt?,
   deck }]. A lone beast is a party of one (no allies). Each member keeps its
   own deck, drawn in turn into the side's one hand; a card is its owner's by
   data (cards.json `owner`), so the hand stays a list of ids and the seal is
   read off the card. A member at 0 is 退: its cards leave the hand and its
   deck stops. The lead's 退 is the side's: the fight is his (小满's), the
   others stand with him. One 灵力 for the side. Kept per member so a later
   seat can be another person's (co-op · PvP). */
/* 丹囊 — the pills a member carries into a fight (Hanli 2026-10-16: 灵石 buys them): up to three,
   each { id, heal } (回春丹: 气血 to the member chosen) or { id, mana } (回气丹, 「丹田空了吞一颗」: 灵力
   this turn). One a turn, free of 灵力; a pill taken is gone (the rules take it from the bag at the
   settle). Kept per member (a seat may be another person's later); a beast never has one. */
export const POUCH_MAX = 3;
const pouchOf = list => (list ?? []).slice(0, POUCH_MAX).map(p => ({ id: p.id, ...(p.heal ? { heal: p.heal } : {}), ...(p.mana ? { mana: p.mana } : {}) }));
const allyOf = (a, hp, seed, who) => {
  const max = Math.max(1, Math.round(hp * (a.hp ?? 0.5)));
  return { id: a.id, name: a.name ?? null, root: a.root ?? null, hp: max, hpMax: max, taunt: Boolean(a.taunt), gone: false, deck: shuffle(a.deck ?? [], `${seed}|${who}|${a.id}`), pouch: pouchOf(a.pouch) };
};
function sideOf(who, cfg, catalog, mode, seed) {
  const realm = REALMS[cfg.tier] ?? REALMS.qi;
  // `base`: 气血 at the side's level (begin, from `pow`); none, the old realm's row and half a point a step.
  const hp = Math.max(1, Math.round((cfg.base ?? realm.hp + (cfg.step ?? 0) * 0.5) * (cfg.hpScale ?? 1)));
  // `wounds`: only a fight whose door was opened before 伤势 was cut
  // (2026-09-24) still carries them in its locked setup; the rules give none now.
  const now = Math.max(1, hp - Math.max(0, cfg.wounds ?? 0));
  const deck = shuffle(cfg.deck ?? [], `${seed}|${who}`);
  return {
    who, tier: cfg.tier, root: cfg.root ?? null, ...(cfg.f != null && cfg.f !== 1 ? { f: cfg.f } : {}), ...(cfg.level != null ? { level: cfg.level } : {}),
    hp: now, hpMax: hp, mana: 0, manaMax: (mode.startMana ?? 1) - 1, manaCap: realm.mana, powerHit: realm.power + (cfg.power ?? 0), boost: cfg.boost ?? null,
    armor: Math.max(0, cfg.armor ?? 0), ward: cfg.ward ?? null, ...(cfg.skill ? { skill: cfg.skill } : {}),
    deck, hand: [...(cfg.extra ?? [])], board: [], laid: [], laidSpent: [], fatigue: 0, ...(cfg.fatigue === false ? { tireless: true } : {}), powerUsed: false, played: [],
    signature: cfg.signature ?? null, charge: null, lifts: cfg.lifts ?? null, insight: cfg.insight ?? 0, intent: null,
    stars: cfg.stars ?? null, drain: 0,
    // 斗法 v4 (the fit): the line that plays this seat when it is a beast's (battle.js lineOf, scripts/fightline.js); none: the foe policy below.
    ai: cfg.ai ?? null, ...(cfg.wit != null ? { wit: cfg.wit } : {}),
    // A 试 (a story trial, creatures.json `trial`): the beast is not driven
    // off, it is PASSED — it yields at `yield` of its 气血, and a player
    // still standing when its cards run out has passed too (not withdrawn).
    trial: cfg.trial ?? null,
    // 装睡 (§ asleep): the turns it lies still, and the blows that glanced off it.
    feint: cfg.feint ? { ...cfg.feint, left: Math.max(0, cfg.feint.turns ?? 1), glanced: 0 } : null,
    allies: (cfg.party ?? []).map(a => allyOf(a, hp, seed, who)), next: 0, dodge: 0,
    // 丹囊 (§ pills): the pills carried in, each its number locked at the door; one a turn, no 灵力.
    pouch: pouchOf(cfg.pouch), pillUsed: false,
    // § heal: how often this side may heal in the fight and how much at most, locked at the door
    // (balance.json fight_length, rules/cards.mjs fightLength); none given, as before: no limit.
    healsLeft: Number.isInteger(cfg.heals) ? cfg.heals : null, healMax: cfg.healMax ?? null,
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
  [...(setup?.you?.deck ?? []), ...(setup?.you?.extra ?? []), ...(setup?.you?.party ?? []).flatMap(a => a.deck ?? []), ...(setup?.foe?.deck ?? []), ...(setup?.foe?.signature?.effect?.summon ? [setup.foe.signature.effect.summon.id] : [])]
    .filter((id, i, all) => all.indexOf(id) === i && !catalog?.[id]);

export function begin(setup, catalog) {
  // `setup.even` (rules/cards.mjs fightSetup, 斗法 v4): the two sides on one sheet — the beast's 气血 its own whole number,
  // its deck the same size as his, and a dry deck costs it 反噬 as it costs him (no withdrawing).
  const base = MODES[setup.mode] ?? MODES.pve;
  const mode = setup.even ? { ...base, foeHp: 1, foeDeck: base.deck, foeDry: null } : base;
  const seed = setup.seed ?? 'x';
  const unknown = missingCards(setup, catalog);
  if (unknown.length) throw new Error(`no card row for ${unknown.join(', ')}`);
  // Levels (§ unitOf): his 气血 is P₁'s (`anchor`); a beast's its class share of 零层's 20 × P(its level) ÷ P(his) (`ff`), and so
  // its blows. None given (零层, an old fight): today's numbers.
  const levelled = setup.anchor && setup.you?.pow != null && setup.foe?.pow != null;
  const fy = levelled ? 1 : null, ff = levelled ? setup.foe.pow / setup.you.pow : null;
  const you = sideOf('you', { ...setup.you, ...(levelled ? { base: setup.anchor, f: 1 } : {}) }, catalog, mode, seed);
  // Every beast stands at the mode's share of its 气血; an elite is only its
  // harder deck (redesign-v2 § 四 — its full 气血 was cut with its own rules).
  // `foe.hp` (creatures.json `hp`) scales that share for one beast: the
  // story's fights are weighed one by one (tools/story-fights.mjs), and a
  // beast too frail to threaten anyone stands taller by data, never by name.
  // `foe.hp_fixed` (rules/cards.mjs duelFoe): 斗法 on fixed numbers — the beast's 气血 as a whole number, read off its level.
  const foe = sideOf('foe', { ...setup.foe, hpScale: mode.foeHp * (setup.foe.hp ?? 1), ...(ff != null ? { base: (REALMS[setup.you.tier] ?? REALMS.qi).hp * ff, f: ff } : {}), ...(setup.foe.hp_fixed != null ? { base: setup.foe.hp_fixed, step: 0, hpScale: 1 } : {}) }, catalog, mode, seed);
  // `uid`: each body that stands gets its own number, in the order it arrives —
  // two of the same card on one rank are two bodies, and the log and the
  // screen must tell them apart (Hanli, 2026-10-15: hitting the second 夫诸 lit
  // the first). Counted, never random, so a replay numbers them the same.
  const st = { mode, catalog, seed, you, foe, ...(levelled && setup.you.pow !== setup.anchor ? { unit: setup.you.pow / setup.anchor } : {}), turn: 0, whose: mode.youFirst ? 'you' : 'foe', outcome: 'open', log: [], uid: 0 };
  for (let i = 0; i < mode.hand; i += 1) drawFrom(st, you, null);
  for (const a of you.allies) drawFrom(st, you, a);
  for (let i = 0; i < mode.foeHand; i += 1) draw(st, foe);
  for (let i = 0; i < (mode.headStart ?? 0); i += 1) draw(st, you);
  const [mine, theirs] = mode.suppress ? suppression(setup.you.tier, setup.foe.tier) : [1, 1];
  // `foe.might`: a beast whose 气血 the door cut to keep the fight short hits that much harder (rules/cards.mjs fightLength).
  // 境界压制 (a realm between them) stays on top of the levels' factor: the two multiply.
  st.scale = { you: mine * (fy ?? 1), foe: theirs * (setup.foe.might ?? 1) * (ff ?? 1) };
  startTurn(st);
  return st;
}

/* ── The turn ── */

function startTurn(st) {
  const side = st[st.whose];
  st.turnMoves = 0;
  side.manaMax = Math.min(side.manaCap, side.manaMax + 1);
  // 夔's drum: a drain laid on this side takes off this turn's 灵力, then is gone.
  side.mana = Math.max(0, side.manaMax - (side.drain ?? 0));
  side.drain = 0;
  side.powerUsed = false;
  side.pillUsed = false;
  for (const m of [...side.board]) {
    if (!m.poison) continue;
    st.log.push({ act: 'poison', who: side.who, id: m.id, uid: m.uid, n: m.poison });
    hurtMinion(st, side, m, m.poison, { from: 'poison' });
  }
  for (const m of side.board) m.sick = false;
  for (const m of side.board) m.struck = false;
  // 锁: a body chained on the other side's turn sits out this one, exactly this one.
  for (const m of side.board) { m.held = Boolean(m.chain); m.chain = 0; }
  if (side.charge?.phase === 'ready') unleash(st, side);
  if (asleep(side)) stir(st, side);
  if (st.outcome !== 'open') return;
  if (st.turn > 0 || st.whose === 'foe') draw(st, side);
  st.turn += 1;
  if (st.whose === 'you') plan(st);
}

/* A copy of a fight to think on (the beast's plan, the careful line's tries): plain data copied by hand, the catalog
   shared, the log begun empty — nothing reads a fight's log back (it is the page's story), and copying the whole of it
   at every turn of every try was most of a Look's time at a pool (structuredClone, and the phone's slower shim of it:
   a Look at 后山 after a scene's exit, ~6 s on the Mac, longer on the phone). `origin` and `history` stay behind. */
const plainCopy = v => {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(plainCopy);
  const out = {};
  for (const k in v) out[k] = plainCopy(v[k]);
  return out;
};
export function simCopy(st) {
  const { catalog, origin, history, log, ...rest } = st;
  const copy = Object.assign(plainCopy(rest), { catalog, log: [] });
  // A thinking copy holds the beast to its base policy: a line that reads ahead must not call a line that reads ahead inside it.
  if (copy.foe) copy.foe.ai = null;
  return copy;
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
  // A beast played by a line (斗法 v4) commits to nothing: its turn is thought when it comes, so no plan is shown that it would not keep.
  if (st.foe.ai && lineOf(st.foe.ai)) { st.foe.intent = null; return; }
  const sim = Object.assign(simCopy(st), { planning: true });
  sim.foe.intent = null;
  endTurn(sim);
  const cards = [];
  let power = false;
  let skill = false;
  for (let guard = 0; guard < 20 && sim.outcome === 'open' && sim.whose === 'foe'; guard += 1) {
    const did = foeStep(sim);
    if (did?.kind === 'play') cards.push(sim.foe.played[sim.foe.played.length - 1]);
    else if (did?.kind === 'power') power = true;
    else if (did?.kind === 'skill') skill = true;
    else break;
  }
  st.foe.intent = { cards, power, ...(st.foe.skill ? { skill } : {}), gathering: sim.foe.charge?.phase === 'gathering' && st.foe.charge?.phase === 'gathering' };
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
  if (!side.signature || asleep(side) || side.charge || side.hp <= 0 || side.hp > side.hpMax * (st.mode.sigAt ?? 0)) return;
  side.charge = { phase: 'gathering' };
  st.log.push({ act: 'charge', who: side.who, id: side.signature.id });
}

function unleash(st, side) {
  side.charge = { phase: 'spent' };
  st.log.push({ act: 'unleash', who: side.who, id: side.signature.id });
  resolve(st, side, { ...sigEffect(side), element: side.root }, guardOf(other(st, side)));
}

/* 装睡, one of its turns gone (§ asleep): the last one, it wakes — with its 杀招
   if it has one (once a fight, as ever: the half-气血 gather does not come again). */
function stir(st, side) {
  side.feint.bound = false; // a bind holds for the turn it was played in
  side.feint.left -= 1;
  if (side.feint.left > 0) {
    st.log.push({ act: 'feint', who: side.who, left: side.feint.left });
    return;
  }
  st.log.push({ act: 'woke', who: side.who, glanced: side.feint.glanced });
  if (side.signature && !side.charge) unleash(st, side);
}

/* 反噬 — a deck run dry costs 1, then 2, then 3. The creature does not bleed
   that way in PvE: its twelve cards spent, it withdraws into the mist, and the
   fight is over with nothing paid (see MODES.pve). */
/* One card off one member's pile (null: the lead's) into the side's hand. */
function drawFrom(st, side, ally) {
  const pile = ally ? ally.deck : side.deck;
  if (!pile.length) return false;
  side.hand.push(pile.shift());
  // Written down so the screen can fly a card off the pile: the animator
  // only ever replays what the rules recorded.
  st.log.push({ act: 'drew', who: side.who, left: side.deck.length, ...(ally ? { member: ally.id } : {}) });
  return true;
}
/* The members draw in turn (the lead, then each one standing beside him),
   skipping a member whose pile is spent; only when every pile is spent does
   反噬 (or the beast's withdrawal) come. A lone side draws as it always did. */
function draw(st, side, { effect = false } = {}) {
  const row = [null, ...side.allies.filter(a => !a.gone)];
  for (let k = 0; k < row.length; k += 1) {
    if (drawFrom(st, side, row[(side.next + k) % row.length])) { side.next = (side.next + k + 1) % row.length; return; }
  }
  // A beast's 入阵 抽 N 张 on a spent pile draws nothing and costs nothing (Hanli 11-04 — 狰's draw was 反噬 in an
  // eight-card hand, a curse on the card that promised a card). A spell's draw (吐纳) still pays 反噬: overdrawing is
  // the 三试's own lesson, and the turn's draw is unchanged.
  if (effect) return;
  // A fight whose setup says `fatigue: false` (a teaching fight): a dry deck draws nothing and costs nothing.
  if (side.tireless) return;
  side.fatigue += 1;
  // A trial outlasted is a trial passed: he stood through every move it had.
  if (side.who === 'foe' && side.trial?.outlast) {
    if (st.outcome === 'open') {
      st.outcome = 'won';
      st.log.push({ act: 'trial-passed', how: 'outlast' });
    }
    return;
  }
  if (side.who === 'foe' && st.mode.foeDry === 'withdraw') {
    if (st.outcome === 'open') {
      st.outcome = 'withdrew';
      st.log.push({ act: 'foe-withdrew' });
    }
    return;
  }
  hurt(st, side, scaled(side, side.fatigue), { kind: 'fatigue' });
}

export function endTurn(st) {
  const done = st[st.whose];
  if (done.charge?.phase === 'gathering') done.charge = { phase: 'ready' };
  parch(st, done);
  if (st.outcome !== 'open') return;
  outlived(st, done);
  if (st.outcome !== 'open') return;
  for (const m of done.board) {
    m.held = false;
    if (m.turnAtk) { m.atk -= m.turnAtk; delete m.turnAtk; }
  }
  // 御: a ward on the other side lasts to the end of this side's turn, `left` of them.
  const opp = other(st, done);
  if (opp.wards?.length) {
    for (const w of opp.wards) w.left -= 1;
    for (const w of opp.wards.filter(x => x.left <= 0)) st.log.push({ act: 'ward-off', who: opp.who, element: w.element });
    opp.wards = opp.wards.filter(x => x.left > 0);
  }
  st.whose = st.whose === 'you' ? 'foe' : 'you';
  startTurn(st);
}

/* A 试 of nerve (`trial.survive`, 三试 · 蠪侄): stood through N of its turns, he has passed. */
function outlived(st, side) {
  if (side.who !== 'foe' || !side.trial?.survive) return;
  side.endured = (side.endured ?? 0) + 1;
  if (side.endured < side.trial.survive) return;
  st.outcome = 'won';
  st.log.push({ act: 'trial-passed', how: 'survive' });
}

/* 大旱 — 肥遗, where it is seen the land parches: at the end of its side's
   turn every body of the other rank takes its number, in its element. The
   one standing verb; it acts while the body stands, never when it is played. */
function parch(st, side) {
  const them = other(st, side);
  for (const m of [...side.board]) {
    if (!m.drought || !side.board.includes(m)) continue;
    st.log.push({ act: 'drought', who: side.who, id: m.id, uid: m.uid, n: m.drought });
    for (const t of [...them.board]) hurtMinion(st, them, t, dealt(st, side.who, m.drought, m.element, t.element), { from: 'drought', element: m.element });
  }
}

/* ── Damage ── */

/* What a blow of n, of this element, takes off the OTHER side's hero once
   its 佩 has turned it: `dealt`, less the 抗 of that element, at least 1.
   The page prints this for a blow at the hero, the rules land it. */
export const wardOf = (side, element) => (element && side?.ward?.[element]) || 0;
/* 御 (the `ward` verb, § EFFECTS): a ward that halves this element's blows at the lead, while it lasts. */
export const shieldOf = (side, element) => (element && (side?.wards ?? []).find(w => w.element === element && w.left > 0 && w.half)) || null;
export const landed = (st, who, n, element) => {
  const them = who === 'you' ? st.foe : st.you;
  if (glances(them, element)) return Math.max(0, scaled(st[who], them.feint.lands ?? 1));
  const d = dealt(st, who, n, element, them.root);
  const h = shieldOf(them, element) ? Math.max(1, Math.floor(d / 2)) : d;
  return Math.max(1, h - wardOf(them, element));
};

function triggerLaid(st, owner, when) {
  const i = (owner.laid ?? []).findIndex(x => x.when === when);
  if (i < 0 || (st.laidChoice && st.laidChoice !== owner.laid[i])) return null;
  const [laid] = owner.laid.splice(i, 1);
  (owner.laidSpent ??= []).push({ id: laid.id, uid: laid.uid, when: laid.when });
  st.log.push({ act: 'laid-off', who: owner.who, id: laid.id, uid: laid.uid, when });
  return laid;
}

function hurt(st, side, amount, why = {}) {
  if (amount > 0 && (why.from === 'attack' || why.from === 'spell') && triggerLaid(st, side, 'struck')) return;
  // 一滚: a blow at the lead turned aside while a dodge is held (never 反噬).
  if (side.dodge > 0 && why.from) {
    side.dodge -= 1;
    st.log.push({ act: 'dodged', who: side.who, amount, ...why });
    return;
  }
  // A blow that glanced off a sleeper (§ asleep) is counted: it feeds the waking.
  if (why.from && glances(side, why.element)) {
    side.feint.glanced += 1;
    st.log.push({ act: 'glanced', who: side.who, glanced: side.feint.glanced });
  }
  // 护体 takes it first (the 法衣): what it holds never reaches 气血.
  const absorbed = Math.min(side.armor ?? 0, amount);
  if (absorbed) side.armor -= absorbed;
  side.hp = Math.max(0, side.hp - (amount - absorbed));
  if (side.hp === 0 && side.lendWard > 0 && why.from) {
    side.hp = 1; side.lendWard = 0;
    if (side.ward === 1) side.ward = null;
    st.log.push({ act: 'ward', who: side.who });
  }
  st.log.push({ act: 'hurt', who: side.who, amount: amount - absorbed, hp: side.hp, ...(absorbed ? { absorbed, armor: side.armor } : {}), ...why });
  settle(st);
  if (st.outcome === 'open') gather(st, side);
}

/* A blow at a body, less the 抗 its lift gives for that element (her 佩, rules/companion.mjs herGear), at least 1. */
export const minionLands = (side, minion, amount, element) => {
  const ward = scaled(side, (element && side?.lifts?.[minion?.id]?.ward?.[element]) || 0);
  return ward && amount > 0 ? Math.max(1, amount - ward) : amount;
};
function hurtMinion(st, side, minion, amount, why = {}) {
  amount = minionLands(side, minion, amount, why.element);
  if (amount > 0 && minion.shield) {
    minion.shield = false;
    st.log.push({ act: 'shield-off', who: side.who, id: minion.id, uid: minion.uid });
    return;
  }
  minion.hp -= amount;
  st.log.push({ act: 'hurt-minion', who: side.who, id: minion.id, uid: minion.uid, amount, hp: minion.hp, ...why });
  if (minion.hp <= 0) withdraw(st, side, minion);
}

/* A member beside the lead, struck (§ sideOf): at 0 it is 退, and its cards leave the hand. */
function hurtAlly(st, side, ally, amount, why = {}) {
  if (!ally || ally.gone) return;
  ally.hp = Math.max(0, ally.hp - amount);
  st.log.push({ act: 'hurt-ally', who: side.who, id: ally.id, amount, hp: ally.hp, ...why });
  if (ally.hp > 0) return;
  ally.gone = true;
  side.hand = side.hand.filter(id => st.catalog[id]?.owner !== ally.id);
  st.log.push({ act: 'ally-withdrew', who: side.who, id: ally.id });
}

/* A minion at 0 is 退 — driven off, never killed. */
function withdraw(st, side, minion) {
  side.board = side.board.filter(m => m !== minion);
  st.log.push({ act: 'withdrew', who: side.who, id: minion.id, uid: minion.uid });
}

/* A body taking its place on a rank, with its own number (§ begin, `uid`). */
function stand(st, side, m) {
  st.uid = (st.uid ?? 0) + 1;
  m.uid = st.uid;
  if (keywordsOf(side, st.catalog[m.id]).includes('shield')) m.shield = true;
  side.board.push(m);
  if (triggerLaid(st, other(st, side), 'enters')) m.chain = 1;
  return m;
}

function settle(st) {
  if (st.outcome !== 'open') return;
  // A trial yields once it has seen enough (`trial.yield` of its 气血).
  if (st.foe.trial?.yield && st.foe.hp > 0 && st.foe.hp <= st.foe.hpMax * st.foe.trial.yield) {
    st.outcome = 'won';
    st.log.push({ act: 'trial-passed', how: 'yield' });
    return;
  }
  if (st.foe.hp <= 0) st.outcome = 'won';
  else if (st.you.hp <= 0) st.outcome = 'lost';
}

/* ── Effects — the closed vocabulary ── */

const other = (st, side) => (side.who === 'you' ? st.foe : st.you);

function resolve(st, side, effect, target, { arrival = false, leadHeal = false } = {}) {
  if (!effect) return;
  const them = other(st, side);
  const hit = (n, element, root) => dealt(st, side.who, n, element, root);
  if (effect.damage != null) {
    if (target?.kind === 'minion') {
      const m = them.board[target.index];
      if (m) hurtMinion(st, them, m, hit(effect.damage, effect.element, m.element), { from: 'spell', element: effect.element ?? null });
    } else if (target?.kind === 'ally') {
      const a = them.allies[target.index];
      if (a) hurtAlly(st, them, a, hit(effect.damage, effect.element, a.root), { from: 'spell', element: effect.element ?? null });
    } else {
      hurt(st, them, landed(st, side.who, effect.damage, effect.element), { from: 'spell', element: effect.element ?? null });
    }
  }
  if (effect.poison != null && target?.kind === 'minion') {
    const m = them.board[target.index];
    if (m) m.poison = Math.max(m.poison ?? 0, effect.poison);
  }
  if (effect.sweep != null) {
    for (const m of [...them.board]) hurtMinion(st, them, m, hit(effect.sweep, effect.element, m.element), { from: 'sweep', element: effect.element ?? null });
  }
  if ((effect.chain != null || effect.hold != null || effect.swallow != null) && target?.kind === 'minion') {
    const m = them.board[target.index];
    if (m && (effect.chain != null || effect.hold != null)) {
      m.chain = 1;
      st.log.push({ act: 'chained', who: them.who, id: m.id, uid: m.uid });
    }
    if (fits(effect, m) && effect.swallow != null) {
      st.log.push({ act: 'swallowed', who: them.who, id: m.id, uid: m.uid, by: side.who });
      withdraw(st, them, m);
    }
  }
  if (effect.armor != null) {
    side.armor += scaled(side, effect.armor);
    st.log.push({ act: 'armor', who: side.who, amount: scaled(side, effect.armor), armor: side.armor });
  }
  if (effect.drain) {
    them.drain = (them.drain ?? 0) + effect.drain;
    st.log.push({ act: 'drained', who: them.who, amount: effect.drain });
  }
  if (effect.heal != null && side.healsLeft !== 0) {
    // A side whose heals the door counted (a beast: balance.json fight_length) heals that often and
    // never past `healMax` (Hanli 2026-11-07: a fight within 3 minutes) — the card's other verbs still land.
    const n = side.healMax != null ? Math.min(scaled(side, effect.heal), side.healMax) : scaled(side, effect.heal);
    if (side.healsLeft != null) side.healsLeft -= 1;
    // The most wounded of the row (阿禾 heals whoever needs it); the lead on a tie.
    const m = target?.kind === 'minion' && target.side === 'mine' ? side.board[target.index] : null;
    const a = m || leadHeal ? null : woundedAlly(side);
    if (m) {
      m.hp = Math.min(m.hpMax, m.hp + n);
      st.log.push({ act: 'heal', who: side.who, id: m.id, uid: m.uid, amount: n, hp: m.hp });
      if (m.poison) {
        m.poison = 0;
        st.log.push({ act: 'cleanse', who: side.who, id: m.id, uid: m.uid });
      }
    } else if (a) {
      a.hp = Math.min(a.hpMax, a.hp + n);
      st.log.push({ act: 'heal', who: side.who, member: a.id, amount: n, hp: a.hp });
    } else {
      side.hp = Math.min(side.hpMax, side.hp + n);
      st.log.push({ act: 'heal', who: side.who, amount: n, hp: side.hp });
    }
  }
  if (effect.dodge) {
    side.dodge = (side.dodge ?? 0) + effect.dodge;
    st.log.push({ act: 'dodge', who: side.who, n: effect.dodge });
  }
  if (effect.ward?.element) {
    // 御: one ward an element, laid anew (never stacked); counted down as the other side's turns end (§ endTurn).
    const w = { element: effect.ward.element, half: effect.ward.half !== false, left: Math.max(1, effect.ward.turns ?? 1) };
    side.wards = [...(side.wards ?? []).filter(x => x.element !== w.element), w];
    st.log.push({ act: 'ward', who: side.who, element: w.element, turns: w.left });
  }
  if (effect.mana) {
    side.mana = Math.min(side.manaCap, side.mana + effect.mana);
    st.log.push({ act: 'mana', who: side.who, amount: effect.mana, mana: side.mana });
  }
  if (effect.draw != null) for (let i = 0; i < effect.draw; i += 1) draw(st, side, { effect: arrival });
  if (effect.summon) {
    const { id, n = 1 } = effect.summon;
    const c = st.catalog[id];
    for (let i = 0; i < n && c && side.board.length < st.mode.board; i += 1) {
      const hp = scaled(side, c.hp);
      const m = stand(st, side, { id, name: c.name, element: c.element, atk: c.atk, hp, hpMax: hp, taunt: Boolean(c.keywords?.includes('taunt')), sick: true, struck: false });
      st.log.push({ act: 'summoned', who: side.who, id, uid: m.uid });
    }
  }
  if (effect.furWard) side.lendWard = 1;
  if (effect.turnRally) for (const m of side.board) {
    m.atk += effect.turnRally;
    m.turnAtk = (m.turnAtk ?? 0) + effect.turnRally;
  }
  if (effect.rally) {
    for (const m of side.board) {
      m.atk += effect.rally.atk ?? 0;
      m.hp += scaled(side, effect.rally.hp ?? 0);
      m.hpMax += scaled(side, effect.rally.hp ?? 0);
    }
    if (side.board.length) st.log.push({ act: 'rally', who: side.who, ...effect.rally, on: side.board.length });
  }
  if (effect.buff) {
    const m = side.board[target?.index ?? 0];
    if (m) {
      m.atk += effect.buff.atk ?? 0;
      m.hp += scaled(side, effect.buff.hp ?? 0);
      m.hpMax += scaled(side, effect.buff.hp ?? 0);
      st.log.push({ act: 'buff', who: side.who, id: m.id, uid: m.uid, ...effect.buff });
    }
  }
  settle(st);
}

/* ── What may come next ── */

/* The member a heal goes to: one beside the lead wounded more than he is, else none (the lead). */
function woundedAlly(side) {
  const lack = m => m.hpMax - m.hp;
  const a = (side.allies ?? []).filter(x => !x.gone && lack(x) > 0).sort((x, y) => lack(y) - lack(x))[0];
  return a && lack(a) > side.hpMax - side.hp ? a : null;
}

const card = (st, id) => st.catalog[id];
/* 护主 · 嘲讽: a body on the rank, or a member standing in the row (孙二狗's 山根桩). */
const tauntAlly = side => (side.allies ?? []).findIndex(a => a.taunt && !a.gone);
const hasTaunt = side => side.board.some(m => m.taunt) || tauntAlly(side) >= 0;
/* Where a blow must go while 护主 stands: a guarding body first, else a guarding member. */
export function guardOf(side) {
  const m = side.board.findIndex(x => x.taunt);
  if (m >= 0) return { kind: 'minion', index: m };
  const a = tauntAlly(side);
  return a >= 0 ? { kind: 'ally', index: a } : undefined;
}
const guards = (side, target) => (target?.kind === 'minion' ? Boolean(side.board[target.index]?.taunt)
  : target?.kind === 'ally' ? Boolean(side.allies?.[target.index]?.taunt && !side.allies[target.index].gone) : false);
const allyGone = (side, target) => target?.kind === 'ally' && (!side.allies?.[target.index] || side.allies[target.index].gone);
/* A card of a member who has 退 is not played (its cards leave the hand anyway). */
const ownerGone = (side, c) => Boolean(c?.owner && (side.allies ?? []).find(x => x.id === c.owner)?.gone);

function skillTargetWhy(side, them, effect, target) {
  const at = EFFECTS[Object.keys(EFFECTS).find(k => effect?.[k] != null)]?.at;
  if (effect?.heal != null && target && (target.kind !== 'minion' || target.side !== 'mine' || !side.board[target.index])) return 'no-target';
  if (at === 'friendly') {
    if (!side.board.length) return 'no-friendly';
    if (target && (target.kind !== 'minion' || target.side === 'theirs' || !side.board[target.index])) return 'no-target';
  }
  if (at === 'minion') {
    if (!them.board.length) return 'no-target';
    if (!target || target.kind !== 'minion' || target.side === 'mine' || !them.board[target.index]) return 'no-target';
    if (!fits(effect, them.board[target.index])) return 'too-big';
  }
  return null;
}

export function legal(st, action, who = 'you') {
  if (st.outcome !== 'open') return 'fight-over';
  if (st.whose !== who) return 'not-your-turn';
  const side = st[who];
  const them = other(st, side);
  if (action.kind === 'end') return null;
  if (action.kind === 'pill') {
    const pill = side.pouch?.[action.index];
    if (!pill) return 'no-pill';
    if (side.pillUsed) return 'pill-used';
    if (action.target && !pill.heal) return 'no-target';
    if (action.target?.kind === 'ally' && (!side.allies[action.target.index] || side.allies[action.target.index].gone)) return 'no-target';
    if (action.target && action.target.kind !== 'ally') return 'no-target';
    return null;
  }
  if (action.kind === 'skill') {
    if (!side.skill) return 'no-skill';
    if (side.powerUsed) return 'power-used';
    if (side.mana < POWER_COST) return 'no-mana';
    return skillTargetWhy(side, them, side.skill.effect, action.target);
  }
  if (action.kind === 'power') {
    if (side.powerUsed) return 'power-used';
    if (side.mana < POWER_COST) return 'no-mana';
    if (action.target?.kind === 'minion' && !them.board[action.target.index]) return 'no-target';
    if (allyGone(them, action.target)) return 'no-target';
    if (action.target?.kind !== 'minion' && hasTaunt(them) && !guards(them, action.target)) return 'taunt';
    return null;
  }
  if (action.kind === 'play') {
    const id = side.hand[action.index];
    const c = id && card(st, id);
    if (!c) return 'not-in-hand';
    if (ownerGone(side, c)) return 'member-gone';
    if (side.mana < costOf(side, c)) return 'no-mana';
    if (c.lay && (side.laid ?? []).some(x => x.id === id)) return 'laid-same';
    if (c.lay && (side.laid ?? []).length >= 2) return 'laid-full';
    if (c.lay) return null;
    if (c.kind === 'minion' && side.board.length >= st.mode.board) return 'board-full';
    const at = EFFECTS[Object.keys(EFFECTS).find(k => c.effect?.[k] != null)]?.at;
    if (c.effect?.heal != null && action.target?.side === 'mine' && (action.target.kind !== 'minion' || !side.board[action.target.index])) return 'no-target';
    if ((c.effect?.poison != null || c.effect?.hold != null) && (!action.target || action.target.kind !== 'minion' || action.target.side === 'mine' || !them.board[action.target.index])) return 'no-target';
    if (at === 'enemy' && action.target?.kind === 'minion' && !them.board[action.target.index]) return 'no-target';
    if (at === 'friendly' && !side.board.length) return 'no-friendly';
    if (at === 'minion') {
      // 锁 and 吞 point at one of its rank: a body that does not fit is
      // refused by name, and while one fits the card must be aimed at it.
      const e = effectOf(side, c);
      const aimed = action.target?.kind === 'minion' ? them.board[action.target.index] : null;
      if (action.target?.kind === 'minion' && !aimed) return 'no-target';
      if (aimed && !fits(e, aimed)) return 'too-big';
      if (!aimed && them.board.some(m => fits(e, m))) return 'aim-one';
    }
    return null;
  }
  if (action.kind === 'attack') {
    const m = side.board[action.index];
    if (!m) return 'not-on-board';
    if (m.sick) return 'just-arrived';
    if (m.held) return 'chained';
    if (m.struck) return 'already-struck';
    if (m.atk <= 0) return 'no-attack';
    if (action.target?.kind === 'minion' && !them.board[action.target.index]) return 'no-target';
    if (allyGone(them, action.target)) return 'no-target';
    // A body on the rank may always be struck (as before the row); the lead or a
    // member only while no 护主 stands, or the member is the guard.
    if (action.target?.kind === 'minion') return null;
    return hasTaunt(them) && !guards(them, action.target) ? 'taunt' : null;
  }
  return 'bad-action';
}

/* What a card does in this side's hands: a 功法 of the day's element hits
   `boost.n` harder (never below 1). The page draws the card from this too, so
   the number on the card is the number that lands. */
export function effectOf(side, c) {
  return starred(lifted(boostedOf(side, c), side?.lifts?.[c?.id]), starLift(side, c));
}
/* A lift on what the card does: each number it names added on, a 齐心 it
   lacked given (her ③ heals more and mends the rank, her ⑨ strikes the beast
   — rewards.json `her_card`). */
const LIFTED = ['heal', 'damage', 'rally'];
const addOn = (v, n) => (typeof n === 'number' ? (v ?? 0) + n : Object.fromEntries([...new Set([...Object.keys(v ?? {}), ...Object.keys(n)])].map(k => [k, (v?.[k] ?? 0) + (n[k] ?? 0)])));
function lifted(e, l) {
  const on = LIFTED.filter(k => l?.[k]);
  if (!e || !on.length) return e;
  return { ...e, ...Object.fromEntries(on.map(k => [k, addOn(e[k], l[k])])) };
}
/* A card's keywords in this side's hands: its own, and 护主 when a lift gives it (her ⑥). */
export const keywordsOf = (side, c) => {
  const own = c?.keywords ?? [];
  return side?.lifts?.[c?.id]?.taunt && !own.includes('taunt') ? [...own, 'taunt'] : own;
};

/* ── ★ — a 功法 tempered in 闭关 (his, 2026-09-24: 闭关修炼, one pick) ──
   Each star takes 1 off the card's 灵力 while it costs more than 1; a star
   past that adds 1 to what it does. Only this side's, only a 功法 — the
   beast's cards are its own. The gate weighs it (tools/battle-sim.mjs). */
export const starsOf = () => 0;
const starCut = (side, c) => Math.min(starsOf(side, c), Math.max(0, (c?.cost ?? 0) - 1));
export const costOf = (side, c) => (c?.cost ?? 0) - starCut(side, c);
const starLift = (side, c) => starsOf(side, c) - starCut(side, c);
/* One number per effect, lifted by n: the effect's own count. */
const STAR_LIFT = {
  damage: (v, n) => v + n, sweep: (v, n) => v + n, heal: (v, n) => v + n, draw: (v, n) => v + n,
  buff: (v, n) => ({ ...v, atk: (v.atk ?? 0) + n }), rally: (v, n) => ({ ...v, atk: (v.atk ?? 0) + n }),
  summon: (v, n) => ({ ...v, n: (v.n ?? 1) + n }),
};
function starred(e, n) {
  if (!e || !n) return e;
  const key = Object.keys(STAR_LIFT).find(k => e[k] != null);
  return key ? { ...e, [key]: STAR_LIFT[key](e[key], n) } : e;
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
  st.turnMoves = (st.turnMoves ?? 0) + 1;
  const side = st[who];
  const them = other(st, side);
  if (action.kind === 'end') { endTurn(st); return { ok: true }; }
  if (action.kind === 'pill') { takePill(st, side, action); return { ok: true }; }
  if (action.kind === 'skill') {
    side.mana -= POWER_COST;
    side.powerUsed = true;
    st.log.push({ act: 'skill', who: side.who, id: side.skill.id, effect: side.skill.effect });
    resolve(st, side, side.skill.effect, action.target, { leadHeal: true });
    return { ok: true };
  }
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
    side.mana -= costOf(side, c);
    side.played.push(id);
    if (c.lay) {
      st.uid = (st.uid ?? 0) + 1;
      (side.laid ??= []).push({ id, uid: st.uid, when: c.lay.when, effect: c.lay.effect });
      st.log.push({ act: 'laid', who: side.who });
      return { ok: true };
    }
    bindAt(st, them, c, action.target);
    if (c.kind === 'minion') {
      const { atk, hp: raw } = bodyOf(side, c), hp = scaled(side, raw), keys = keywordsOf(side, c);
      const drought = effectOf(side, c)?.drought;
      const m = { id, name: c.name, element: c.element, atk, hp, hpMax: hp, taunt: keys.includes('taunt'), sick: true, struck: false, ...(drought ? { drought } : {}) };
      const cry = keys.includes('battlecry') ? effectOf(side, c) : null;
      const kinds = ['enters'];
      if (cry?.damage > 0 && !action.target) kinds.push('struck');
      st.laidChoice = (them.laid ?? []).find(x => kinds.includes(x.when)) ?? null;
      stand(st, side, m);
      st.log.push({ act: 'played', who: side.who, id, uid: m.uid, kind: 'minion' });
      if (cry) resolve(st, side, { ...cry, element: c.element }, action.target, { arrival: true });
      delete st.laidChoice;
    } else {
      st.log.push({ act: 'played', who: side.who, id, kind: 'spell' });
      const e = effectOf(side, c);
      const kinds = ['casts'];
      if (e?.damage != null && !action.target && e.damage > 0) kinds.push('struck');
      if (e?.summon && side.board.length < st.mode.board && st.catalog[e.summon.id] && (e.summon.n ?? 1) > 0) kinds.push('enters');
      st.laidChoice = (them.laid ?? []).find(x => kinds.includes(x.when)) ?? null;
      resolve(st, side, { ...e, element: c.element }, action.target);
      const cast = st.laidChoice?.when === 'casts' ? triggerLaid(st, them, 'casts') : null;
      if (cast?.effect?.damage) hurt(st, side, landed(st, them.who, cast.effect.damage, cast.effect.element), { from: 'laid', element: cast.effect.element ?? null });
      delete st.laidChoice;
    }
    return { ok: true };
  }
  // 攻击 — both sides take the other's 攻, which is the whole of the exchange.
  const m = side.board[action.index];
  m.struck = true;
  if (action.target?.kind === 'minion') {
    const t = them.board[action.target.index];
    hurtMinion(st, them, t, dealt(st, side.who, m.atk, m.element, t.element), { from: 'attack', element: m.element ?? null });
    if (t.atk > 0) hurtMinion(st, side, m, Math.max(1, Math.round(t.atk * clash(t.element, m.element) * levelOf(them))), { from: 'return', element: t.element ?? null });
  } else if (action.target?.kind === 'ally') {
    const a = them.allies[action.target.index];
    hurtAlly(st, them, a, dealt(st, side.who, m.atk, m.element, a.root), { from: 'attack', element: m.element ?? null });
  } else {
    hurt(st, them, landed(st, side.who, m.atk, m.element), { from: 'attack', element: m.element ?? null });
  }
  return { ok: true };
}

/* A pill from the pouch: 回春丹 to the member chosen (the lead when none), 回气丹 灵力 now, never past the cap. */
function takePill(st, side, action) {
  const [pill] = side.pouch.splice(action.index, 1);
  side.pillUsed = true;
  const ally = action.target?.kind === 'ally' ? side.allies[action.target.index] : null;
  if (pill.heal) {
    const m = ally ?? side;
    m.hp = Math.min(m.hpMax, m.hp + pill.heal);
    st.log.push({ act: 'pill', who: side.who, id: pill.id, heal: pill.heal, hp: m.hp, ...(ally ? { member: ally.id } : {}) });
  }
  if (pill.mana) {
    side.mana = Math.min(side.manaCap, side.mana + pill.mana);
    st.log.push({ act: 'pill', who: side.who, id: pill.id, mana: pill.mana, now: side.mana });
  }
}

/* ── The creature's side: a policy, never a die ── */

/* ONE move of the creature's, and then it hands the screen back. A whole turn
   taken between two renders is a turn the player never sees — three seconds of
   nothing, which reads as a hang (his, 2026-09-18: 对方不打呢, 卡住了). The page
   loops on this, drawing and animating each move as it lands.
   Order: play what it can afford, biggest first; then its 主灵根一击; then send
   each body at whatever stands in the way. Its deck order is its personality —
   the twelve cards it holds are what this beast IS. */
/* The lines a seat can be played by (`side.ai`: 'careful' · 'lookahead' · 'mix'), scripts/fightline.js: each is (st, who) → an action,
   or null to end the turn. Imported here, not registered from there, so the page and the rules that replay its fight always play
   the same beast (a registry filled only where fightline.js happened to load let the two settle different fights). Read at call
   time: the import is a cycle, and fightline.js touches nothing of this file at its top level. A name not here plays the foe policy. */
const lineOf = name => ({ careful: lines.carefulFor, lookahead: lines.lookaheadFor, mix: (st, who) => lines.mixFor(st, who, { wit: st[who].wit ?? 0 }) })[name] ?? null;
export function foeStep(st) {
  if (st.outcome !== 'open' || st.whose !== 'foe') return null;
  const side = st.foe;
  const line = side.ai ? lineOf(side.ai) : null;
  if (line && !asleep(side) && side.charge?.phase !== 'gathering') {
    side.intent = null;
    const action = line(st, 'foe') ?? { kind: 'end' };
    if (!act(st, action, 'foe').ok) act(st, { kind: 'end' }, 'foe');
    return action;
  }
  // 装睡: it lies still — nothing played, nothing struck (§ asleep).
  if (asleep(side)) {
    side.intent = null;
    act(st, { kind: 'end' }, 'foe');
    return { kind: 'end' };
  }
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
      // A planned card whose mark is gone since (its rank driven off, its wound healed) is let go too.
      if (legal(st, action, 'foe') || !worthPlaying(st, side, c)) continue;
      act(st, action, 'foe');
      return action;
    }
  }
  const playable = gathering || intent ? [] : side.hand
    .map((id, index) => ({ index, c: card(st, id) }))
    .filter(({ c }) => c && costOf(side, c) <= side.mana && worthPlaying(st, side, c))
    .sort((a, b) => costOf(side, b.c) - costOf(side, a.c));
  const next = playable.find(({ index, c }) => !legal(st, { kind: 'play', index, target: aimFor(st, side, c) }, 'foe'));
  if (next) {
    const action = { kind: 'play', index: next.index, target: aimFor(st, side, next.c) };
    act(st, action, 'foe');
    return action;
  }
  const strikes = intent ? (intent.power || intent.skill) && !gathering : !gathering;
  const skillAction = side.skill ? { kind: 'skill', target: aimFor(st, side, side.skill) } : null;
  const powerAction = { kind: 'power', target: aimPower(st, side) };
  if (strikes && skillAction && (intent?.skill || legal(st, powerAction, 'foe')) && !legal(st, skillAction, 'foe')) {
    if (intent) intent.skill = false;
    act(st, skillAction, 'foe');
    return skillAction;
  }
  if (intent) intent.power = false;
  if (strikes && !legal(st, { kind: 'power', target: aimPower(st, side) }, 'foe')) {
    const action = { kind: 'power', target: aimPower(st, side) };
    act(st, action, 'foe');
    return action;
  }
  for (let i = 0; i < side.board.length; i += 1) {
    const target = hasTaunt(st.you) ? guardOf(st.you) : bestAttack(st, side, i);
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

/* Does this card do anything now? A beast never spends a turn on nothing
   (his, 2026-10-15: 野猪 played 厚土 on an empty rank and never struck): a
   body always stands; a spell is held while every verb it carries would
   land on nothing — a 厚土/饥啸 with no rank of its own, a heal at full 气血,
   a sweep at an empty rank, a 锁/吞 with nothing it fits, a draw from an
   empty pile (which would send it into the mist). */
const VERB_USE = {
  armor: () => true,
  hold: (st, side) => other(st, side).board.length > 0,
  damage: () => true,
  poison: (st, side) => other(st, side).board.length > 0,
  drain: () => true,
  summon: (st, side) => side.board.length < st.mode.board,
  rally: (st, side) => side.board.length > 0,
  buff: (st, side) => side.board.length > 0,
  heal: (st, side) => side.hp < side.hpMax && side.healsLeft !== 0,
  sweep: (st, side) => other(st, side).board.length > 0,
  chain: (st, side, e) => other(st, side).board.some(m => fits(e, m)),
  swallow: (st, side, e) => other(st, side).board.some(m => fits(e, m)),
  draw: (st, side) => side.deck.length > 0,
  drought: () => true,
  dodge: () => true,
  mana: (st, side) => side.mana < side.manaCap,
};
/* Why a spell would land on nothing now, by its first idle verb — null when it does something (worthPlaying). */
const IDLE_WHY = { hold: 'none-fits', poison: 'none-fits', sweep: 'rank-empty', heal: 'hp-full', draw: 'pile-empty', mana: 'mana-full', chain: 'none-fits', swallow: 'none-fits', summon: 'board-full', rally: 'no-friendly', buff: 'no-friendly' };
export function idleWhy(st, side, c) {
  if (!c || worthPlaying(st, side, c)) return null;
  const e = effectOf(side, c);
  return IDLE_WHY[Object.keys(e ?? {}).find(v => VERB_USE[v] && e[v] != null)] ?? 'does-nothing';
}
/* The offers as the PLAYER's page shows them (games/kapai.js): a spell that would land on nothing is greyed with
   its why and not played (Hanli 11-04: 痒痒针 on an empty rank spent 3 灵力 for nothing). The rules' own `offers`
   and `legal` are unchanged — the bands' lines (fightline.js, trial-sim.mjs) read those. */
export function playerOffers(st) {
  return offers(st).map(o => {
    if (!o.ok || o.action.kind !== 'play') return o;
    const m = o.action.target?.side === 'mine' ? st.you.board[o.action.target.index] : null;
    const why = m && o.card.effect?.heal != null && st.you.healsLeft !== 0 && (m.hp < m.hpMax || m.poison) ? null : idleWhy(st, st.you, o.card);
    return why ? { ...o, ok: false, why } : o;
  });
}
export function worthPlaying(st, side, c) {
  if (c.kind === 'minion' || c.lay) return true;
  const e = effectOf(side, c);
  const verbs = Object.keys(e ?? {}).filter(k => VERB_USE[k] && e[k] != null);
  return !verbs.length || verbs.some(k => VERB_USE[k](st, side, e));
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
  // A bite (`effect.bite`) is a beast's own teeth, not a spell: it goes where a strike must — the 护主 first
  // (Hanli 10-22: 「护主牌没发挥作用」 — 00-fox's 「挡住它咬」).
  if (c.effect?.bite) return guardOf(them);
  // 锁 / 吞: the hardest hitter it may take — for 锁 one not already chained.
  if (c.effect?.hold != null || c.effect?.poison != null || c.effect?.chain != null || c.effect?.swallow != null) {
    const e = effectOf(side, c);
    const ok = them.board.map((m, index) => ({ m, index })).filter(({ m }) => fits(e, m))
      .sort((a, b) => (Boolean(a.m.chain) - Boolean(b.m.chain)) || (b.m.atk - a.m.atk) || (b.m.hp - a.m.hp));
    return ok.length ? { kind: 'minion', index: ok[0].index } : undefined;
  }
  if (c.effect?.damage == null) return undefined;
  // A blow goes where it does the most: the hero when it is close to the end;
  // else the hardest-hitting body it drives off; else the hero (a spell
  // never minds a 护主). A blow that only grazes a body is a blow wasted.
  const n = effectOf(side, c).damage;
  if (them.hp <= n * 2 * levelOf(side)) return undefined;
  const kills = them.board.map((m, index) => ({ m, index })).filter(({ m }) => dealt(st, side.who, n, c.element, m.element) >= m.hp)
    .sort((a, b) => (b.m.atk - a.m.atk) || (b.m.hp - a.m.hp));
  return kills.length ? { kind: 'minion', index: kills[0].index } : undefined;
}

function aimPower(st, side) {
  return guardOf(other(st, side));
}

/* Trade where the trade is good — a minion it can drive off and survive —
   otherwise the hero. */
function bestAttack(st, side, index) {
  const m = side.board[index];
  const them = other(st, side);
  const kills = them.board
    .map((t, i) => ({ i, t, dealt: Math.round(m.atk * clash(m.element, t.element) * levelOf(side)), back: Math.round(t.atk * clash(t.element, m.element) * levelOf(them)) }))
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
  if (a.kind === 'power' || a.kind === 'skill') return `${a.kind}${at}`;
  if (a.kind === 'pill') return `pill:${a.index}${a.target?.kind === 'ally' ? `@a${a.target.index}` : ''}`;
  return 'end';
}

export function actionOf(token) {
  const [head, aim] = String(token).split('@');
  const [kind, index] = head.split(':');
  const target = !aim ? undefined : aim[0] === 'a' ? { kind: 'ally', index: Number(aim.slice(1)) } : { kind: 'minion', index: Number(aim.slice(1)), side: aim[0] === 'm' ? 'mine' : 'theirs' };
  if (kind === 'pill') return { kind: 'pill', index: Number(index), ...(target ? { target } : {}) };
  if (kind === 'play' || kind === 'attack') return { kind, index: Number(index), target };
  if (kind === 'power' || kind === 'skill') return { kind, target };
  return { kind: 'end' };
}

/* ── Replay: the one truth both readers share ── */

/* `actions` are the player's, in order; the creature's turns are played by the
   policy whenever it is its turn. Give it the same setup and the same actions
   and it lands in the same place, every time, on either side of the wire. */
/* The moves already made, played into a fight begun from its setup — the same loop as `battle`, on the state itself:
   a room reopened mid-fight (a cold reload) stands where it stood, turn, hands, piles, boards and the rng's place. */
export function replayInto(st, actions) {
  for (const raw of actions ?? []) {
    const action = typeof raw === 'string' ? actionOf(raw) : raw;
    while (st.whose === 'foe' && st.outcome === 'open') foeTurn(st);
    if (st.outcome !== 'open') break;
    if (!act(st, action, 'you').ok) break;
  }
  while (st.whose === 'foe' && st.outcome === 'open') foeTurn(st);
  return st;
}
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
function skillView(st, side) {
  const targets = effectTargets(st, side, side.skill.effect);
  const reasons = targets.map(target => legal(st, { kind: 'skill', target }, side.who));
  const why = reasons.find(x => x === null) === null ? null : reasons[0];
  return { id: side.skill.id, name: side.skill.name, ready: why === null, ...(why ? { why } : {}) };
}

export function view(st) {
  const side = s => ({
    hp: s.hp, hpMax: s.hpMax, mana: s.mana, manaMax: s.manaMax, manaCap: s.manaCap,
    root: s.root, deck: s.deck.length, hand: s.hand.length, fatigue: s.fatigue, ...(s.level != null ? { level: s.level } : {}), ...(s.f ? { f: s.f } : {}),
    ...(s.skill ? { skill: skillView(st, s) } : {}),
    powerUsed: s.powerUsed, powerHit: s.powerHit, boost: s.boost, armor: s.armor ?? 0, ward: s.ward ?? null,
    signature: s.signature, charge: s.charge?.phase ?? null, lifts: s.lifts, stars: s.stars ?? null, drain: s.drain ?? 0,
    ...(s.trial ? { trial: s.trial, ...(s.trial.survive ? { endured: s.endured ?? 0 } : {}) } : {}),
    ...(s.feint ? { feint: { ...s.feint } } : {}),
    ...(s.allies?.length ? { allies: s.allies.map(a => ({ id: a.id, name: a.name, root: a.root, hp: a.hp, hpMax: a.hpMax, taunt: a.taunt, gone: a.gone, deck: a.deck.length })) } : {}),
    ...(s.dodge ? { dodge: s.dodge } : {}),
    ...(s.wards?.length ? { wards: s.wards.map(w => ({ ...w })) } : {}),
    ...(s.pouch?.length || s.pillUsed ? { pouch: s.pouch.map(p => ({ ...p })), pillUsed: s.pillUsed } : {}),
    board: s.board.map(m => ({ id: m.id, uid: m.uid ?? null, name: m.name, element: m.element, atk: m.atk, hp: m.hp, hpMax: m.hpMax, taunt: m.taunt, shield: Boolean(m.shield), poison: m.poison ?? 0, ready: !m.sick && !m.struck && !m.held, chained: Boolean(m.chain || m.held), drought: m.drought ?? 0 })),
  });
  // 望气术: the plan is shown only to a player who can read it (setup.you.insight).
  const sight = st.you.insight ?? 0;
  const intent = sight && st.foe.intent ? { sight, cards: st.foe.intent.cards.filter(id => !st.catalog[id]?.lay), power: st.foe.intent.power, gathering: st.foe.intent.gathering } : null;
  return { outcome: st.outcome, turn: st.turn, whose: st.whose, you: { ...side(st.you), hand: st.you.hand, laid: (st.you.laid ?? []).map(x => ({ id: x.id, uid: x.uid, name: st.catalog[x.id]?.name, when: x.when })) }, foe: { ...side(st.foe), laid: (st.foe.laid ?? []).length, ...(intent ? { intent } : {}) }, log: st.log, scale: st.scale, ...(st.outcome !== 'open' && ((st.you.laidSpent ?? []).length || (st.you.laid ?? []).length || (st.foe.laidSpent ?? []).length || (st.foe.laid ?? []).length) ? { laidResult: { you: { spent: st.you.laidSpent ?? [], unspent: (st.you.laid ?? []).map(({ id, uid, when }) => ({ id, uid, when })) }, foe: { spent: st.foe.laidSpent ?? [], unspent: (st.foe.laid ?? []).map(({ id, uid, when }) => ({ id, uid, when })) } } } : {}), ...(st.unit ? { unit: st.unit } : {}) };
}

/* Nothing left but to end the turn — no card affordable, no body that may
   strike, no 主灵根一击. The page shows it and, after a beat, ends the turn by
   itself: a turn with an empty purse is not a decision, and he read one as the
   fight having hung (2026-09-18). A pill (丹囊) is never a reason to wait: it is free, one a turn, and stays in the
   pouch till taken, so a turn ended without it loses nothing — the next turn offers it again (Hanli 11-09: 「斗法不自动结束回合了,
   带了回春丹后」; the pouch, 10-16, came after this rule and had held every turn open for good). Read off the page's own
   offers (playerOffers): a card greyed there as landing on nothing is never played by the room, so it is no reason either. */
const waits = o => o.ok && o.action.kind !== 'end' && o.action.kind !== 'pill';
export const idle = st => st.outcome === 'open' && st.whose === 'you' && !playerOffers(st).some(waits);

/* ── The buttons ── */

/* Every action the player could take right now, each ok or with its why and
   what it spends. The card draws only what is here; nothing hides in a tooltip. */
export function effectTargets(st, side, effect) {
  const them = other(st, side);
  const at = EFFECTS[Object.keys(EFFECTS).find(k => effect?.[k] != null)]?.at;
  if (effect?.heal != null && at === 'none') return [undefined, ...side.board.map((m, index) => ({ kind: 'minion', index, side: 'mine' }))];
  if (at === 'enemy' || at === 'minion') return [undefined, ...them.board.map((m, index) => ({ kind: 'minion', index }))];
  if (at === 'friendly') return side.board.length ? side.board.map((m, index) => ({ kind: 'minion', index })) : [undefined];
  return [undefined];
}

export function offers(st) {
  const out = [];
  const them = st.foe;
  // A card ALWAYS gets at least one row, even when it has nowhere to point:
  // otherwise the card face has no refusal to show and a card nobody can play
  // looks playable (seen in the browser, 2026-09-18 — 焰心 with an empty rank).
  st.you.hand.forEach((id, index) => {
    const c = card(st, id);
    if (!c) return;
    for (const target of effectTargets(st, st.you, c.effect)) {
      const action = { kind: 'play', index, target };
      const why = legal(st, action, 'you');
      out.push({ action, card: c, id, cost: costOf(st.you, c), why, ok: why === null });
    }
  });
  for (const target of [undefined, ...them.board.map((m, index) => ({ kind: 'minion', index }))]) {
    const action = { kind: 'power', target };
    const why = legal(st, action, 'you');
    out.push({ action, cost: POWER_COST, why, ok: why === null });
  }
  if (st.you.skill) {
    for (const target of effectTargets(st, st.you, st.you.skill.effect)) {
      const action = { kind: 'skill', target };
      const why = legal(st, action, 'you');
      out.push({ action, cost: POWER_COST, why, ok: why === null });
    }
  }
  st.you.board.forEach((m, index) => {
    for (const target of [undefined, ...them.board.map((t, i) => ({ kind: 'minion', index: i }))]) {
      const action = { kind: 'attack', index, target };
      const why = legal(st, action, 'you');
      out.push({ action, minion: m, cost: 0, why, ok: why === null });
    }
  });
  // 丹囊: each pill, at the lead and (a heal) at each member standing beside him.
  (st.you.pouch ?? []).forEach((p, index) => {
    const at = p.heal ? [undefined, ...st.you.allies.map((a, i) => (a.gone ? null : { kind: 'ally', index: i })).filter(Boolean)] : [undefined];
    for (const target of at) {
      const action = { kind: 'pill', index, ...(target ? { target } : {}) };
      const why = legal(st, action, 'you');
      out.push({ action, pill: p, cost: 0, why, ok: why === null });
    }
  });
  out.push({ action: { kind: 'end' }, cost: 0, why: null, ok: true });
  return out;
}
