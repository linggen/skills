// rules/cards.mjs — 斗法 v3 and 得牌: the deck a player takes in, and the cards they have obtained.
// Part of the rules engine; rules.mjs is its one door.
import { MODES, REALMS as CARD_REALMS, shuffle } from '../battle.js';
import { dayKey, pick } from '../state.mjs';
import { duelSeed, wornOf } from './arms.mjs';
import { bondLifts, FIT_TO_FIGHT, hasCompanion } from './companion.mjs';
import { clone, refuse } from './core.mjs';
import { herAway } from './daily.mjs';
import { gearBrief } from './errands.mjs';
import { boutFortune } from './fortune.mjs';
import { hashOf } from './travel.mjs';
import { creatureOf } from './world.mjs';

/* ── 斗法 v3: the ten cards a player takes in ──
   Until the skill tree picks a deck, the deck is WHO THEY ARE: the cards of
   their own roots, and the ones no root claims, ten of them in a stable order.
   Deterministic, so the same player takes the same deck into the same fight —
   and so the rules and the page never disagree about what was held. */
/* 组牌 — the ten he picks himself (his, 2026-09-23). state.deck is his pick,
   kept in the order picked; a card no longer usable drops out, and under ten
   the rules fill the rest along the realm's curve as before. */
export function deckFor(content, state) {
  const auto = autoDeck(content, state);
  if (!Array.isArray(state.deck)) return auto;
  const owned = new Set(ownedCards(content, state)), roots = new Set(state.traits ?? []), catalog = cardCatalog(content);
  const picked = [...new Set(state.deck)].filter(id => owned.has(id) && catalog[id] && id !== 'yinyue' && usable(catalog[id], roots)).slice(0, MODES.pve.deck);
  // A card he took out stays out — the fill never puts it back (seen on a
  // copy of his save, 2026-09-23: 土偶 taken out, filled straight back in).
  const out = new Set(state.deck_out ?? []);
  // The fill is dealt along the curve from what is left: not his picks, not
  // what he took out.
  const left = ownedCards(content, state).filter(id => !out.has(id) && !picked.includes(id));
  const fill = autoDeck(content, { ...state, cards: [...left, ...(ownedCards(content, state).includes('yinyue') ? ['yinyue'] : [])] });
  return [...picked, ...fill].slice(0, MODES.pve.deck);
}
const pickedCards = (content, state) => (Array.isArray(state.deck) ? deckFor(content, state).filter(id => state.deck.includes(id)) : []);

export function deck(state, content, ctx, args) {
  const lang = state.lang, action = String(args.action ?? 'toggle');
  const s = clone(state);
  if (action === 'auto') { delete s.deck; delete s.deck_out; return { state: s, result: { ok: true, gear: gearBrief(content, s) } }; }
  if (action !== 'toggle') return refuse('unknown-action', null, { actions: ['toggle', 'auto'] });
  const id = String(args.id ?? ''), c = cardCatalog(content)[id];
  if (!c || !ownedCards(content, state).includes(id)) return refuse('not-held', null);
  if (id === 'yinyue') return refuse('always-in-hand', pick({ zh: '银月开局就在手上，不占这十张。', en: 'Yinyue starts in hand; she is not one of the ten.' }, lang));
  if (!usable(c, new Set(state.traits ?? []))) return refuse('off-root', pick({ zh: '灵根不合，修不得这门功法。', en: 'A spell of a root you lack.' }, lang));
  // The first pick starts from the ten he has been dealt, not from nothing.
  const now = Array.isArray(s.deck) ? pickedCards(content, s) : deckFor(content, s);
  // Lit is his: a lit card taken out stays out (the fill never puts it
  // back); any other card tapped becomes his, room allowing. (A first cut
  // treated a filled card as lit, and a tap meant to keep it threw it out.)
  if (now.includes(id)) {
    s.deck = now.filter(x => x !== id);
    s.deck_out = [...new Set([...(s.deck_out ?? []), id])];
  } else if (now.length >= MODES.pve.deck) return refuse('deck-full', pick({ zh: '十张已满，先取下一张。', en: 'Ten already — take one out first.' }, lang));
  else {
    s.deck = [...now, id];
    s.deck_out = (s.deck_out ?? []).filter(x => x !== id);
  }
  return { state: s, result: { ok: true, gear: gearBrief(content, s) } };
}

function autoDeck(content, state) {
  // Only what has been obtained (his, 2026-09-22) — 得牌 below.
  const owned = new Set(ownedCards(content, state));
  const pool = (content.cards?.cards ?? []).filter(c => !c._token && c.id !== 'yinyue' && owned.has(c.id));
  const roots = new Set(state.traits ?? []);
  // A root decides which 功法 he can cast, not which beast will follow him:
  // 韩立 had no 金 root and raised 噬金虫 all the same (his, 2026-09-22). So a
  // spell of a root he lacks stays out; a 灵兽 of any element comes in.
  const mine = pool.filter(c => usable(c, roots));
  // A DECK, not a pile. The gate measured the difference and it is the whole
  // game: a curve deck won 84% where ten cards drawn at random won 47%
  // (2026-09-18). So the ten are dealt along a curve, and the curve BENDS WITH
  // THE REALM: 练气 caps at six 灵力 and a fight lasts about six rounds, so a
  // five-cost card there is a card that never gets played — the first curve
  // written (Hearthstone's, for a ten-turn game) lost fights the pile had won.
  const CURVES = {
    qi: [1, 1, 1, 2, 2, 2, 3, 3, 4, 4],
    foundation: [1, 1, 2, 2, 2, 3, 3, 4, 4, 5],
    core: [1, 2, 2, 2, 3, 3, 4, 4, 5, 5],
    nascent: [1, 2, 2, 3, 3, 4, 4, 5, 5, 6],
  };
  const CURVE = CURVES[state.tier] ?? CURVES.qi;
  const byCost = new Map();
  for (const c of shuffle(mine.map(x => x.id), `deck|${state.name ?? ''}`)) {
    const cost = Math.min(6, Math.max(1, pool.find(x => x.id === c).cost));
    byCost.set(cost, [...(byCost.get(cost) ?? []), c]);
  }
  const deck = [];
  for (const rung of CURVE) {
    // the rung asked for, else the nearest one that still has a card left
    for (const cost of [rung, rung - 1, rung + 1, rung - 2, rung + 2, 1, 2, 3, 4, 5, 6]) {
      const row = byCost.get(cost);
      if (row?.length) { deck.push(row.shift()); break; }
    }
  }
  return deck.slice(0, MODES.pve.deck);
}

/* What goes through the door of a fight, and nothing else (design.md § 副本契约):
   the realm, the main root, the ten cards, the beast's own twelve. 银月 rides
   along in hand when she walks with the player. */
const WEAPON_POWER = 1;
export const hpMaxOf = state => Math.round((CARD_REALMS[state.tier] ?? CARD_REALMS.qi).hp + (state.step ?? 0) * 0.5);
function woundsNow(content, state, now) {
  const w = state.wounds;
  if (!w?.n) return 0;
  const hours = Math.max(0, (now - new Date(w.at)) / 3600000);
  const mended = Math.floor((hpMaxOf(state) * hours) / content.rewards.stamina.refill_hours);
  return Math.max(0, w.n - mended);
}
/* When the wounds will have mended to `left` or fewer. */
function mendsBy(content, state, now, left) {
  const n = woundsNow(content, state, now);
  if (n <= left) return now;
  const perHour = hpMaxOf(state) / content.rewards.stamina.refill_hours;
  return new Date(now.getTime() + Math.ceil(((n - left) / perHour) * 3600000));
}
function healthBrief(content, state, now) {
  const max = hpMaxOf(state), n = woundsNow(content, state, now);
  return { now: max - n, max, ...(n ? { full_at: mendsBy(content, state, now, 0).toISOString() } : {}) };
}
const fitToFight = (content, state, now) => hpMaxOf(state) - woundsNow(content, state, now) >= Math.ceil(hpMaxOf(state) * FIT_TO_FIGHT);

/* The fight open on the save, when it is THIS one (`game` its id) — a door
   left open on another creature holds nothing for this fight. */
const openFight = (state, game) => (game && state.fight?.game === game ? state.fight : null);

/* Everything a fight is given at the door. Once the door is open it is the
   save's (`state.fight.setup`), not the hour's: a 谈心 that crosses a bond
   threshold, a 问斗法 cast, a scroll learned or an hour of mending between
   the page's play and the settle must not replay the fight against other
   numbers — a different result, or a legal turn refused. A save whose fight
   was opened before the setup was kept falls back to the live reading, with
   its wounds still the door's. */
export function fightSetup(content, state, creature, now, game = null) {
  const open = openFight(state, game);
  if (open?.setup) return open.setup;
  const fortune = now ? boutFortune(content, state, now) : null;
  const boost = fortune?.card ? { element: fortune.root, n: fortune.card } : null;
  const main = state.fate?.element?.id ?? state.fate?.element ?? (state.traits ?? [])[0] ?? 'wood';
  // Out on a 历练, she is not at his side (§ 历练).
  const withHer = ownedCards(content, state).includes('yinyue') && !herAway(state, now ?? new Date());
  return {
    mode: 'pve',
    seed: duelSeed(state, creature, now),
    you: {
      tier: state.tier, step: state.step ?? 0, root: main, deck: deckFor(content, state), extra: withHer ? ['yinyue'] : [],
      // Locked at the door with the rest: the page and the settle replay the
      // same fight even if an hour of mending passes between them.
      wounds: open?.wounds ?? (now ? woundsNow(content, state, now) : 0),
      ...(withHer && bondLifts(content, state) ? { lifts: bondLifts(content, state) } : {}),
      // 望气术: how much of the beast's plan he can read (items `learn`).
      ...(state.insight ? { insight: state.insight } : {}),
      // 法器 stay in the world as gear and give 主灵根一击 +1 (design.md § 斗法
      // v3 牌型) — the sword on the belt, or the 本命法宝 it became.
      ...(wornOf(content, state, 'weapon') || state.treasure ? { power: WEAPON_POWER } : {}),
      // 问斗法: the lower trigram's element, its 功法 lifted or lowered today.
      ...(boost ? { boost } : {}),
    },
    foe: { tier: state.tier, root: creature.root, deck: creature.deck ?? [], ...(creature.signature ? { signature: creature.signature } : {}), ...(creature.elite ? { elite: true } : {}) },
  };
}

const cardCatalog = content => Object.fromEntries((content.cards?.cards ?? []).map(c => [c.id, c]));

/* ── 得牌: a player fights only with the cards they have obtained ──
   His rule, 2026-09-22: 用户只能使用已经获得的牌, 包括银月, 法术, 武器等. Roots
   used to hand out every card of their element — so 精卫, never met, sat in
   his ten while the 夫诸 and 狍鸮 that walk with him did not. Now `state.cards`
   is what he holds: the starter at the root test, 银月 when she joins, a beast
   when it joins, a card from each win, and whatever a grant names. A save
   from before is read as what it would hold (`ownedAtStart`) until the first
   card is gained, and then that is written down. 法器 are worn, not held —
   the sword was always the one on the belt. */
const isBeastCard = (content, id) => Boolean(creatureOf(content, id));
/* A 功法 wants its root; a 灵兽 of any element answers anyone who holds it. */
const usable = (c, roots) => c.kind !== 'spell' || !c.element || roots.has(c.element);
const starterOf = (content, traits) => {
  const catalog = cardCatalog(content), roots = new Set(traits ?? []);
  return (content.cards?.starter ?? []).filter(id => catalog[id] && (!catalog[id].element || roots.has(catalog[id].element)));
};
function ownedAtStart(content, state) {
  const catalog = cardCatalog(content);
  if (!state.traits?.length) return [];
  return [...new Set([
    ...starterOf(content, state.traits),
    ...(hasCompanion(state) && catalog.yinyue ? ['yinyue'] : []),
    ...(state.cast ?? []).filter(id => catalog[id]),
  ])];
}
export const ownedCards = (content, state) => state.cards ?? ownedAtStart(content, state);

/* One card into the hand he keeps; null when it is unknown or already his. */
function gainCard(content, state, id) {
  const card = cardCatalog(content)[id];
  if (!card || card._token) return null;
  const owned = ownedCards(content, state);
  if (owned.includes(id)) { state.cards = owned; return null; }
  state.cards = [...owned, id];
  return { id, name: pick(card.name, state.lang), card: true };
}

/* What a win leaves in the hand: one card not yet his that he can use — a
   灵兽 of any element, a 功法 only of his roots (one he could never cast is no
   gift) — the beast's own element first.
   Never a 山海经 beast — those come only by taming. Stable by the day, the
   beast and the 道号, like everything else a fight deals. */
function winCard(content, state, creature, now, nth = 0) {
  const owned = new Set(ownedCards(content, state)), roots = new Set(state.traits ?? []);
  const open = (content.cards?.cards ?? []).filter(c => !c._token && c.id !== 'yinyue' && !isBeastCard(content, c.id)
    && !owned.has(c.id) && usable(c, roots));
  const own = open.filter(c => c.element === creature.root);
  const pool = own.length ? own : open;
  if (!pool.length) return null;
  return gainCard(content, state, pool[hashOf(`${dayKey(now)}|${creature.id}|${state.name ?? ''}|card${nth ? `|${nth}` : ''}`) % pool.length].id);
}

export { cardCatalog, fitToFight, gainCard, healthBrief, mendsBy, pickedCards, starterOf, usable, WEAPON_POWER, winCard, woundsNow };
