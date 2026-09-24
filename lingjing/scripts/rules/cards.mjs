// rules/cards.mjs — 斗法 v3 and 得牌: the deck a player takes in, and the cards they have obtained.
// Part of the rules engine; rules.mjs is its one door.
import { MODES, REALMS as CARD_REALMS, shuffle } from '../battle.js';
import { dayKey, pick } from '../state.mjs';
import { charmOf, duelSeed, wornOf } from './arms.mjs';
import { hasCompanion, herLifts } from './companion.mjs';
import { clone, refuse } from './core.mjs';
import { gearBrief } from './errands.mjs';
import { boutFortune } from './fortune.mjs';
import { hashOf } from './travel.mjs';
import { creatureOf, tierIndex } from './world.mjs';

/* ── 斗法 v3: the ten cards a player takes in ──
   Until the skill tree picks a deck, the deck is WHO THEY ARE: the cards of
   their own roots, and the ones no root claims, ten of them in a stable order.
   Deterministic, so the same player takes the same deck into the same fight —
   and so the rules and the page never disagree about what was held. */
/* 组牌 — the ten he picks himself (his, 2026-09-23), from 结丹 on
   (redesign-v2 § 四: auto before — a new player never builds a deck).
   state.deck is his pick, kept in the order picked; a card no longer usable
   drops out, and under ten the rules fill the rest along the realm's curve as
   before. A pick kept from before the rule waits, unread, until 结丹. */
const PICK_FROM = 'core';
const canPick = (content, state) => tierIndex(content, state) >= content.ladder.tiers.findIndex(t => t.id === PICK_FROM);
export function deckFor(content, state) {
  const auto = autoDeck(content, state);
  if (!Array.isArray(state.deck) || !canPick(content, state)) return auto;
  const owned = new Set(ownedCards(content, state)), roots = rootsOf(content, state), catalog = cardCatalog(content);
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
const pickedCards = (content, state) => (Array.isArray(state.deck) && canPick(content, state) ? deckFor(content, state).filter(id => state.deck.includes(id)) : []);

export function deck(state, content, ctx, args) {
  const lang = state.lang, action = String(args.action ?? 'toggle');
  const s = clone(state);
  if (action === 'auto') { delete s.deck; delete s.deck_out; return { state: s, result: { ok: true, gear: gearBrief(content, s) } }; }
  if (action !== 'toggle') return refuse('unknown-action', null, { actions: ['toggle', 'auto'] });
  if (!canPick(content, state)) return refuse('needs-tier', pick({ zh: '结丹之后，方能自己组牌。', en: 'You pick your own ten from the Core on.' }, lang), { tier: PICK_FROM });
  const id = String(args.id ?? ''), c = cardCatalog(content)[id];
  if (!c || !ownedCards(content, state).includes(id)) return refuse('not-held', null);
  if (id === 'yinyue') return refuse('always-in-hand', pick({ zh: '银月开局就在手上，不占这十张。', en: 'Yinyue starts in hand; she is not one of the ten.' }, lang));
  if (!usable(c, rootsOf(content, state))) return refuse('off-root', pick({ zh: '灵根不合，修不得这门功法。', en: 'A spell of a root you lack.' }, lang));
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
  const roots = rootsOf(content, state);
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

/* ── 装备入局: what he wears, as the fight reads it ──
   His call, 2026-09-24 (a review found it): the sword on the belt gave +1
   whatever it was — 铁剑 the same as 竹剑 — and the robe, the 佩, the 符 and
   every 温养 counted for nothing in a fight. Now each is one number at the
   door, by the rates in cards.json `gear`, so a better thing on the body is a
   better fight and the gate can weigh each of them:
     法器   器攻 × weapon_power → 主灵根一击 (竹剑 +1 · 铁剑 +2)
     本命法宝 the sword it was made of, +1 each treasure_levels 重
     法衣   防 × armor_per_def → 护体 at the start (battle.js § armor)
     佩     抗 × ward_per_point → that element lands lighter on him
     符     one in the bag → a card in hand, spent when it is played
   A sword and a treasure are one hand: the bigger counts. The roots they
   lend are rootsOf's, for the deck — not the fight's. */
const RATES = content => content.cards?.gear ?? {};
const weaponPower = (content, atk) => Math.round((atk ?? 0) * (RATES(content).weapon_power ?? 0));
const treasurePower = (content, t) => weaponPower(content, t.base) + Math.floor((t.level - 1) / Math.max(1, RATES(content).treasure_levels ?? 99));
function gearFight(content, state) {
  const weapon = wornOf(content, state, 'weapon'), robe = wornOf(content, state, 'robe'), pendant = wornOf(content, state, 'pendant');
  const power = Math.max(weapon ? weaponPower(content, weapon.effect?.atk) : 0, state.treasure ? treasurePower(content, state.treasure) : 0);
  const armor = Math.round((robe?.effect?.def ?? 0) * (RATES(content).armor_per_def ?? 0));
  const ward = Object.fromEntries(Object.entries(pendant?.effect?.ward ?? {})
    .map(([el, n]) => [el, Math.round(n * (RATES(content).ward_per_point ?? 0))]).filter(([, n]) => n > 0));
  const charm = charmOf(content), card = charm && (state.bag?.[charm.id] ?? 0) > 0 && cardCatalog(content)[charm.id]?.charm ? charm.id : null;
  return { power, armor, ward: Object.keys(ward).length ? ward : null, charm: card };
}

/* His roots, and the ones his arms lend: a sword's `root` (佩之借木) and the
   element a 本命法宝 was bound with. A 功法 of a lent root may go in the
   deck while the thing is worn; taken off, the card drops out (deckFor). A
   gift is chosen by his own roots only — a card he could lose is no gift. */
function rootsOf(content, state) {
  const lent = [wornOf(content, state, 'weapon')?.effect?.root, state.treasure?.element].filter(Boolean);
  return new Set([...(state.traits ?? []), ...lent]);
}
export const hpMaxOf = state => Math.round((CARD_REALMS[state.tier] ?? CARD_REALMS.qi).hp + (state.step ?? 0) * 0.5);

/* The fight open on the save, when it is THIS one (`game` its id) — a door
   left open on another creature holds nothing for this fight. */
const openFight = (state, game) => (game && state.fight?.game === game ? state.fight : null);

/* Everything a fight is given at the door. Once the door is open it is the
   save's (`state.fight.setup`), not the hour's: a 问卦 cast, a scroll learned
   or a chapter ended between the page's play and the settle must not replay
   the fight against other numbers — a different result, or a legal turn
   refused. A save whose fight was opened before the setup was kept falls
   back to the live reading. Every fight begins at full 气血 (伤势 was cut,
   redesign-v2 § 四). */
export function fightSetup(content, state, creature, now, game = null) {
  const open = openFight(state, game);
  if (open?.setup) return open.setup;
  // 问卦 (fortune.mjs): the day's reading — its element's 功法 ±n, and at 吉
  // and 大吉 the beast's next move read (望气), as the scroll's 上卷 reads it.
  const fortune = now ? boutFortune(content, state, now) : null;
  const boost = fortune?.card ? { element: fortune.root, n: fortune.card } : null;
  const insight = Math.max(state.insight ?? 0, fortune?.sight ?? 0);
  const main = state.fate?.element?.id ?? state.fate?.element ?? (state.traits ?? [])[0] ?? 'wood';
  const withHer = ownedCards(content, state).includes('yinyue');
  const gear = gearFight(content, state), lifts = withHer ? herLifts(content, state) : null;
  return {
    mode: 'pve',
    seed: duelSeed(state, creature, now),
    you: {
      tier: state.tier, step: state.step ?? 0, root: main, deck: deckFor(content, state), extra: [...(withHer ? ['yinyue'] : []), ...(gear.charm ? [gear.charm] : [])],
      ...(lifts ? { lifts } : {}),
      // 望气: how much of the beast's plan he can read — the scroll (items
      // `learn`), or the day's reading at 吉/大吉.
      ...(insight ? { insight } : {}),
      // What he wears, as numbers (§ 装备入局).
      ...(gear.power ? { power: gear.power } : {}),
      ...(gear.armor ? { armor: gear.armor } : {}),
      ...(gear.ward ? { ward: gear.ward } : {}),
      // 问卦: the lower trigram's element, its 功法 lifted or lowered today.
      ...(boost ? { boost } : {}),
    },
    // An elite is its harder deck and nothing else (redesign-v2 § 四).
    foe: { tier: state.tier, root: creature.root, deck: creature.deck ?? [], ...(creature.signature ? { signature: creature.signature } : {}) },
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

export { canPick, cardCatalog, gainCard, gearFight, pickedCards, rootsOf, starterOf, usable, winCard };
