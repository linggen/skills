// rules/cards.mjs — 斗法 v3 and 得牌: the deck a player takes in, and the cards they have obtained.
// Part of the rules engine; rules.mjs is its one door.
import { MODES, POUCH_MAX, REALMS as CARD_REALMS, shuffle } from '../battle.js';
import { dayKey, pick, seedOf } from '../state.mjs';
import { boundOf, duelSeed, wornOf } from './arms.mjs';
import { herAwake, herLifts } from './companion.mjs';
import { clone, refuse } from './core.mjs';
import { gearBrief } from './errands.mjs';
import { boutFortune } from './fortune.mjs';
import { allPlaces, creatureOf, tierIndex } from './world.mjs';
import { mainRoot } from './roots.mjs';
import { chapterLabel, huiLabel, huiNow, sceneHui } from './hui.mjs';

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
  const picked = [...new Set(state.deck)].filter(id => owned.has(id) && catalog[id] && !catalog[id].owner && usable(catalog[id], roots)).slice(0, MODES.pve.deck);
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
  if (action === 'auto') { delete s.deck; delete s.deck_out; return { state: s, result: { ok: true, gear: gearBrief(content, s, ctx?.now) } }; }
  if (action !== 'toggle') return refuse('unknown-action', null, { actions: ['toggle', 'auto'] });
  if (!canPick(content, state)) return refuse('needs-tier', pick({ zh: '结丹之后，方能自己组牌。', en: 'You pick your own ten from the Core on.' }, lang), { tier: PICK_FROM });
  const id = String(args.id ?? ''), c = cardCatalog(content)[id];
  if (!c || !ownedCards(content, state).includes(id)) return refuse('not-held', null);
  if (c.owner) return refuse('always-in-hand', pick({ zh: '这是小队里别人的牌，由他们自己出，不占这十张。', en: "A party member's card is theirs to play; it is not one of the ten." }, lang));
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
  return { state: s, result: { ok: true, gear: gearBrief(content, s, ctx?.now) } };
}

function autoDeck(content, state) {
  // Only what has been obtained (his, 2026-09-22) — 得牌 below.
  const owned = new Set(ownedCards(content, state));
  // His own: a card a party member plays (cards.json `owner`: 阿禾's 青藤, 孙二狗's 山根桩,
  // 银月) is that member's, in their own deck — an old save keeps it held, never in his ten.
  const pool = (content.cards?.cards ?? []).filter(c => !c._token && !c.owner && owned.has(c.id));
  const roots = rootsOf(content, state);
  // A root decides which 功法 he can cast, not which beast will follow him:
  // 韩立 had no 金 root and raised 噬金虫 all the same (his, 2026-09-22). So a
  // spell of a root he lacks stays out; a 灵兽 of any element comes in.
  const held = pool.filter(c => usable(c, roots));
  // Under ten, a card goes in twice (炉石's two copies; cards.md § 4): the first
  // hand of a mortal is a few things, not ten — 娘的饼, 一箭, 吐纳.
  const mine = held.length >= MODES.pve.deck ? held : [...held, ...held];
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
  for (const c of shuffle(mine.map(x => x.id), `deck|${seedOf(state)}`)) {
    const cost = Math.min(6, Math.max(1, pool.find(x => x.id === c).cost ?? 1));
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
  const power = Math.max(weapon ? weaponPower(content, weapon.effect?.atk) : 0, boundOf(content, state) ? treasurePower(content, state.treasure) : 0);
  const armor = Math.round((robe?.effect?.def ?? 0) * (RATES(content).armor_per_def ?? 0));
  const ward = Object.fromEntries(Object.entries(pendant?.effect?.ward ?? {})
    .map(([el, n]) => [el, Math.round(n * (RATES(content).ward_per_point ?? 0))]).filter(([, n]) => n > 0));
  // Every 符 in the bag that is a card (the drawn 符, and a story's one-time
  // 符 such as 踏马的符, 古五) goes in hand at the door, one of each.
  const catalog = cardCatalog(content);
  const charms = content.items.items.filter(i => i.effect?.charm && (state.bag?.[i.id] ?? 0) > 0 && catalog[i.id]?.charm).map(i => i.id);
  return { power, armor, ward: Object.keys(ward).length ? ward : null, charm: charms[0] ?? null, charms };
}

/* His roots, and the ones his arms lend: a sword's `root` (佩之借木) and the
   element a 本命法宝 was bound with. A 功法 of a lent root may go in the
   deck while the thing is worn; taken off, the card drops out (deckFor). A
   gift is chosen by his own roots only — a card he could lose is no gift. */
function rootsOf(content, state) {
  const lent = [wornOf(content, state, 'weapon')?.effect?.root, boundOf(content, state)?.element].filter(Boolean);
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
/* `deal`: a pool's fight (world.mjs encounterOf) — each of the day's fights its own shuffle. */
/* A scene's fight read by what the story gave him (`sight: {mark, level}` on the exit's game —
   古六: 阿禾's 底册 page read and burnt, `diche` → 望气 on 卢方 and 秦雁): the level of 望气 a held
   mark lends; 0 without it. `mark` may be one mark or a list (any held). */
export const heldMark = (state, mark) => [mark].flat().some(m => (state.marks ?? []).includes(m));
export const readOf = (state, game) => (game?.sight && heldMark(state, game.sight.mark) ? game.sight.level ?? 1 : 0);

export function fightSetup(content, state, creature, now, game = null, deal = null, read = 0) {
  const open = openFight(state, game);
  if (open?.setup) return open.setup;
  // 问卦 (fortune.mjs): the day's reading — its element's 功法 ±n, and at 吉
  // and 大吉 the beast's next move read (望气), as the scroll's 上卷 reads it.
  const fortune = now ? boutFortune(content, state, now) : null;
  const boost = fortune?.card ? { element: fortune.root, n: fortune.card } : null;
  const insight = Math.max(state.insight ?? 0, fortune?.sight ?? 0, read);
  const main = state.fate?.element?.id ?? state.fate?.element ?? mainRoot(state) ?? 'wood';
  // 小队 (party.json, cards.md § 5): who stands beside him in this fight. 银月 is a member, never
  // a card in hand: asleep in the 木牌 through 卷一, she stands in the row from the 卷 she wakes in.
  const party = partyFor(content, state, creature, game);
  const withHer = party.some(m => m.id === 'yinyue');
  const gear = gearFight(content, state), lifts = withHer ? herLifts(content, state) : null;
  // Before the root test (the 三试 comes first) he fights with what no root claims:
  // the rootless things he holds (deckFor reads no roots, so a 功法 stays out).
  const deck = deckFor(content, state), stars = starsIn(state, deck);
  // 新: a card gained and not yet played (cards_new), marked in the hand until it is.
  const fresh = (state.cards_new ?? []).filter(id => deck.includes(id));
  // 丹囊: the pills he carries in (his last pick, as the bag still holds them).
  const pouch = pouchFor(content, state);
  return {
    mode: 'pve',
    seed: deal ? `${duelSeed(state, creature, now)}|${deal}` : duelSeed(state, creature, now),
    you: {
      tier: state.tier, step: state.step ?? 0, root: main, deck, extra: [...(creature.extra ?? []), ...gear.charms],
      ...(party.length ? { party } : {}),
      ...(fresh.length ? { fresh } : {}),
      ...(pouch.length ? { pouch } : {}),
      ...(lifts ? { lifts } : {}),
      // 望气: how much of the beast's plan he can read — the scroll (items
      // `learn`), or the day's reading at 吉/大吉.
      ...(insight ? { insight } : {}),
      // 闭关's ★ on the 功法 in the ten (rules/seclusion.mjs; battle.js costOf).
      ...(stars ? { stars } : {}),
      // What he wears, as numbers (§ 装备入局).
      ...(gear.power ? { power: gear.power } : {}),
      ...(gear.armor ? { armor: gear.armor } : {}),
      ...(gear.ward ? { ward: gear.ward } : {}),
      // 问卦: the lower trigram's element, its 功法 lifted or lowered today.
      ...(boost ? { boost } : {}),
    },
    // An elite is its harder deck and nothing else (redesign-v2 § 四).
    foe: { tier: state.tier, root: creature.root, deck: creature.deck ?? [], ...(creature.hp ? { hp: creature.hp } : {}), ...(creature.signature ? { signature: creature.signature } : {}), ...(creature.feint ? { feint: creature.feint } : {}), ...(creature.trial ? { trial: creature.trial } : {}) },
  };
}

/* Who stands beside him (party.json): the fight's own word (an exit game's `foe.party`, carried
   on the foe), else the 回 he stands in (`by_hui`); a member of a 卷 not yet open (银月, asleep in
   卷一) never. Each member as the fight takes it: id, name, root, share of 气血, 嘲讽, deck. */
export function partyFor(content, state, creature, game = null) {
  const p = content.party;
  if (!p) return [];
  const open = juanOf(content, state);
  // A beast met roaming (a haunt's or a pool's, `haunt:`) he fights alone (party.json `roams_alone`): the
  // 回's companions stand with him in the story's fights — 灵草谷, the 河伯祠 — not on every hill.
  const roaming = p.roams_alone && String(game ?? '').startsWith('haunt:');
  // A member who `walks` with him (银月, once her 卷 is open) stands beside him in every fight she is awake for.
  const walking = Object.entries(p.members ?? {}).filter(([, m]) => m.walks && herAwake(state)).map(([id]) => id);
  const ids = [...new Set([...(creature?.party ?? (roaming ? [] : p.by_hui?.[huiNow(content, state)]) ?? []), ...walking])];
  return ids.map(id => [id, p.members?.[id]]).filter(([, m]) => m && (m.juan ?? 1) <= open)
    .map(([id, m]) => ({ id, name: m.name, root: m.root, hp: m.hp, ...(m.taunt ? { taunt: true } : {}), ...(m.art ? { art: m.art } : {}), deck: [...m.deck] }));
}
/* The 卷 he stands in: his chapter's (chapter.json `juan`), 1 when it says none. */
const juanOf = (content, state) => content.chapters?.[state.chapter]?.juan ?? 1;

/* ── 丹囊: pills into a fight (Hanli 2026-10-16: 灵石 buys pills) ──
   Up to three pills from the bag, picked at the door (`state.pill_pick`, his last pick
   remembered); each in the fight is a free action, one a turn (battle.js § pills): 回春丹
   (`effect.fight.heal`) to the member he chooses, 回气丹 (`mana`) 灵力 now. A pill taken is gone
   from the bag at the settle (tasks.mjs). The beast has none. */
export const fightPill = (content, id) => content.items.items.find(i => i.id === id)?.effect?.fight ?? null;
export function pouchFor(content, state, pick = state.pill_pick) {
  const left = { ...(state.bag ?? {}) }, out = [];
  for (const id of pick ?? []) {
    const e = fightPill(content, id);
    if (!e || !(left[id] > 0) || out.length >= POUCH_MAX) continue;
    left[id] -= 1;
    out.push({ id, ...e });
  }
  return out;
}
/* What the door offers to carry: every pill in the bag with its number, and the pick as it stands. */
export function pouchBrief(content, state) {
  const pills = content.items.items.filter(i => i.effect?.fight && (state.bag?.[i.id] ?? 0) > 0)
    .map(i => ({ id: i.id, name: pick(i.name, state.lang), n: state.bag[i.id], ...i.effect.fight, ...(i.art ? { art: i.art } : {}) }));
  return pills.length ? { max: POUCH_MAX, pick: pouchFor(content, state).map(p => p.id), pills } : null;
}

/* The ★ 闭关 gave the cards in this deck — null when none has any. */
function starsIn(state, deck) {
  const got = Object.entries(state.card_stars ?? {}).filter(([id, n]) => n > 0 && deck.includes(id));
  return got.length ? Object.fromEntries(got) : null;
}

const cardCatalog = content => Object.fromEntries((content.cards?.cards ?? []).map(c => [c.id, c]));

/* ── 得牌: a player fights only with the cards they have obtained ──
   His rule, 2026-09-22: 用户只能使用已经获得的牌, 包括银月, 法术, 武器等. Roots
   used to hand out every card of their element — so 精卫, never met, sat in
   his ten while the 夫诸 and 狍鸮 that walk with him did not. Now `state.cards`
   is what he holds, and every card says where it comes from (cards.json `from`,
   Hanli 2026-10-16: 每张牌都在剧情里收集或者购买): a scene left (`story`), a
   board won (`beat`), a beast beaten (`beast` — the card it fought with),
   a thing bought (`shop`), a beast tamed (`tame`). Nothing is dealt at random,
   and no starter is handed over at the root test any more (cards.md § 4). A
   save from before the rule is read as what it held then (`ownedAtStart`, the
   `_legacy_starter`) until state.mjs writes it down. 法器 are worn, not held —
   the sword was always the one on the belt. */
const isBeastCard = (content, id) => Boolean(creatureOf(content, id));
/* A 功法 wants its root; a 灵兽 of any element answers anyone who holds it. */
const usable = (c, roots) => c.kind !== 'spell' || !c.element || roots.has(c.element);
/* The twelve the root test once handed over (cards.json `_legacy_starter`) — for old saves only. */
const starterOf = (content, traits) => {
  const catalog = cardCatalog(content), roots = new Set(traits ?? []);
  return (content.cards?._legacy_starter ?? []).filter(id => catalog[id] && (!catalog[id].element || roots.has(catalog[id].element)));
};
/* The cards a source gives: every card whose `from` names it (kind and key: a scene, a task, a creature, an item). */
export const cardsFrom = (content, kind, key) => (content.cards?.cards ?? [])
  .filter(c => !c._token && (c.from ?? []).some(f => f.kind === kind && (f.scene ?? f.task ?? f.creature ?? f.item) === key));
/* Every card a source gives, into his hand: a scene left, a board won (cards.md § 2). */
export function grantFrom(content, state, kind, key, from) {
  return cardsFrom(content, kind, key).map(c => gainCard(content, state, c.id, from)).filter(Boolean);
}
function ownedAtStart(content, state) {
  const catalog = cardCatalog(content);
  if (!state.traits?.length) return [];
  return [...new Set([
    ...starterOf(content, state.traits),
    ...(herAwake(state) && catalog.yinyue ? ['yinyue'] : []),
    ...(state.cast ?? []).filter(id => catalog[id]),
  ])];
}
export const ownedCards = (content, state) => state.cards ?? ownedAtStart(content, state);

/* One card into the hand he keeps; null when it is unknown or already his.
   `from` is where it came from — kept in `card_from` for the 牌谱 (redesign-v2
   § 五: 牌组就是你这一路的回忆): { how, creature?, place?, chapter?, scene?, tale? } —
   the scene, when one is played, names its 回 (rules/hui.mjs). */
function gainCard(content, state, id, from = null) {
  const card = cardCatalog(content)[id];
  if (!card || card._token) return null;
  const owned = ownedCards(content, state);
  if (owned.includes(id)) { state.cards = owned; return null; }
  state.cards = [...owned, id];
  // 新 until it is first played (tasks.mjs duel clears it; the page marks it in the hand).
  state.cards_new = [...new Set([...(state.cards_new ?? []), id])];
  if (from) state.card_from = { ...(state.card_from ?? {}), [id]: { ...from, place: from.place ?? state.place ?? null, chapter: from.chapter ?? state.chapter ?? null, ...(state.scene ? { scene: state.scene } : {}) } };
  return { id, name: pick(card.name, state.lang), card: true };
}

/* What a win leaves in the hand: the card this beast fought with and names as
   its gift (cards.json `from: {kind: 'beast', creature}` — 杀人必摸尸: 邹青松's
   gourd → 火鸦, the 野猪's 饥啸), the first not yet held; `nth` the next one.
   Nothing when it names none or he holds them all — never a card at random. */
function winCard(content, state, creature, now, nth = 0, from = { how: 'win', creature: creature.id }) {
  const owned = new Set(ownedCards(content, state));
  const open = cardsFrom(content, 'beast', creature.id).filter(c => !c.owner && !owned.has(c.id));
  const c = open[Number.isInteger(nth) ? nth : 0];
  return c ? gainCard(content, state, c.id, { ...from, day: dayKey(now) }) : null;
}

/* 牌谱 — every card he holds and where it came from (redesign-v2 § 五). A card
   gained before `card_from` was kept is read from what is known: the starter,
   银月, a beast that walks with him; else 旧日所得. Names resolved here. */
function cardBook(content, state) {
  const catalog = cardCatalog(content), lang = state.lang, from = state.card_from ?? {};
  const starter = new Set(starterOf(content, state.traits));
  const guess = id => (starter.has(id) ? { how: 'starter' } : id === 'yinyue' ? { how: 'companion' }
    : isBeastCard(content, id) ? { how: 'tame', creature: id } : { how: 'old' });
  const nameOf = {
    creature: id => pick(creatureOf(content, id)?.name, lang) ?? null,
    place: id => pick(allPlaces(content).find(p => p.id === id)?.name, lang) ?? null,
    // told as its 回, short: the scene's, else the chapter's (第三回)
    chapter: (id, scene) => huiLabel(content, sceneHui(content, scene), lang, 'short') ?? chapterLabel(content, state, content.chapters?.[id], lang, 'short'),
  };
  return ownedCards(content, state).filter(id => catalog[id]).map(id => {
    const c = catalog[id], f = from[id] ?? guess(id);
    return {
      id, name: pick(c.name, lang), kind: c.kind, element: c.element ?? null, cost: c.cost ?? null,
      ...(c.atk != null ? { atk: c.atk, hp: c.hp } : {}), ...(c.art ? { art: c.art } : {}),
      // Whose it is (a party member's card is theirs to play) and the one line of where it is from.
      ...(c.owner ? { owner: c.owner } : {}), ...(c.from?.[0]?.line ? { said: pick(c.from[0].line, lang), src: c.from[0].src } : {}),
      from: {
        how: f.how, day: f.day ?? null,
        ...(f.creature ? { creature: nameOf.creature(f.creature) ?? f.creature } : {}),
        ...(f.place ? { place: nameOf.place(f.place) } : {}),
        ...(f.chapter ? { chapter: nameOf.chapter(f.chapter, f.scene) } : {}),
        ...(f.title ? { tale: f.title } : {}),
      },
    };
  });
}

export { canPick, cardBook, cardCatalog, gainCard, gearFight, ownedAtStart, pickedCards, rootsOf, starterOf, usable, winCard };
