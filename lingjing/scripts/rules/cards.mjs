// rules/cards.mjs — 斗法 v3 and 得牌: the deck a player takes in, and the cards they have obtained.
// Part of the rules engine; rules.mjs is its one door.
import { MODES, POUCH_MAX, REALMS as CARD_REALMS, shuffle } from '../battle.js';
import { dayKey, hpStep, pick, seedOf } from '../state.mjs';
import { boundOf, duelSeed, wornOf } from './arms.mjs';
import { armsOf, GEAR_SLOTS } from './wear.mjs';
import { herAwake, herLifts } from './companion.mjs';
import { clone, refuse } from './core.mjs';
import { gearBrief } from './errands.mjs';
import { allPlaces, creatureOf, tierIndex } from './world.mjs';
import { mainRoot } from './roots.mjs';
import { levelOf } from './playpay.mjs';
import { atLevel, clampTo, powerKnobs, powerOf } from './power.mjs';
import { chapterLabel, huiLabel, huiNow, sceneHui, zhNumber } from './hui.mjs';
import { PINS, pinRow } from './pin.mjs';

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
export function deckFor(content, state, o = {}) {
  const auto = autoDeck(content, state, o);
  if (!Array.isArray(state.deck) || !canPick(content, state)) return auto;
  const owned = new Set(ownedCards(content, state)), roots = rootsOf(content, state), catalog = cardCatalog(content);
  const picked = [...new Set(state.deck)].filter(id => owned.has(id) && catalog[id] && !catalog[id].owner && usable(catalog[id], roots)).slice(0, MODES.pve.deck);
  // A card he took out stays out — the fill never puts it back (seen on a
  // copy of his save, 2026-09-23: 土偶 taken out, filled straight back in).
  const out = new Set(state.deck_out ?? []);
  // The fill is dealt along the curve from what is left: not his picks, not
  // what he took out.
  const left = ownedCards(content, state).filter(id => !out.has(id) && !picked.includes(id));
  const fill = autoDeck(content, { ...state, cards: [...left, ...(ownedCards(content, state).includes('yinyue') ? ['yinyue'] : [])] }, o);
  return [...picked, ...fill].slice(0, MODES.pve.deck);
}
const pickedCards = (content, state) => (Array.isArray(state.deck) && canPick(content, state) ? deckFor(content, state).filter(id => state.deck.includes(id)) : []);

export function deck(state, content, ctx, args) {
  const lang = state.lang, action = String(args.action ?? 'toggle');
  // 卡册 — a read, asked when its view opens (as the 印谱's `seals book`): every card to collect, held or not.
  if (action === 'book') return { state: null, result: { ok: true, kace: kaceBrief(content, state) } };
  const s = clone(state);
  if (action === 'auto') { delete s.deck; delete s.deck_out; return { state: s, result: { ok: true, gear: gearBrief(content, s, ctx?.now) } }; }
  if (action !== 'toggle') return refuse('unknown-action', null, { actions: ['toggle', 'auto', 'book'] });
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

/* A worn weapon's strike (`effect.strike`: a card marked `gear` with that weapon — 火柴's, Hanli 11-03: 「火柴是一把剑, 重复的牌就
   不用了」) is in his deck for a fight while the sword is worn (fightDeck): never a card he holds or is given. */
export function strikeOf(content, state) {
  const w = wornOf(content, state, 'weapon'), id = w?.effect?.strike, c = id ? cardCatalog(content)[id] : null;
  return c && c.gear === w.id ? id : null;
}
/* The ten a fight deals: his ten (deckFor), and while a sword with a strike is worn, the strike always in them — in the place of
   the cheapest card, the last dealt of them (a filled card before one he picked), so no big card gives way to it (taking the
   place of the nearest cost put 震怒 out before 双龙, and 火柴 lost to the bronze sword there). The rest of the ten stand as they were
   unworn. (Until 2026-11-04 the strike joined his hand and the ten were dealt again from it: with a big hand the curve could
   leave the strike out and reshuffle the rest — Hanli's 灵草谷, 「带了火柴还是遁走了」: no 火柴 in the ten, and 金刃 gone.) */
export function fightDeck(content, state, o = {}) {
  const ten = deckFor(content, state, o), id = strikeOf(content, state);
  if (!id || ten.includes(id)) return ten;
  if (ten.length < MODES.pve.deck) return [...ten, id];
  const catalog = cardCatalog(content), picked = new Set(pickedCards(content, state));
  const rank = i => (picked.has(ten[i]) ? 100 : 0) + (catalog[ten[i]]?.cost ?? 1);
  const at = ten.reduce((best, _, i) => (rank(i) <= rank(best) ? i : best), 0);
  return ten.map((c, i) => (i === at ? id : c));
}
/* `ten` (斗法 v4, rules/cards.mjs evenDuel): the two sides on one sheet, so his deck is ten however few cards he holds: the
   v3 two of a card, and a third (or more) of the cheapest-dealt only where two of each still falls short of ten. */
function autoDeck(content, state, { ten = false } = {}) {
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
  const copies = ten && held.length ? Math.ceil(MODES.pve.deck / held.length) : 2;
  const mine = held.length >= MODES.pve.deck ? held : Array.from({ length: Math.max(2, copies) }, () => held).flat();
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
  // Every slot's number, whichever slot carries it (rules/wear.mjs armsOf): the 法衣's 防 and the shoes' add to 护体. Batch 3:
  // each worn thing's points count at its own level — × P(its level) ÷ P(his) (gearFactor), in his units (battle.js § unitOf):
  // a thing of his level counts as it did at 练气一层, one below him less, one above more. 护体 and 抗 are 气血 at the door; the
  // arm's strike joins 主灵根一击.
  const worn = GEAR_SLOTS.map(slot => wornOf(content, state, slot)).filter(Boolean), arms = armsOf(worn);
  const of = i => gearFactor(content, state, i);
  const blade = worn.filter(i => (i.effect?.atk ?? 0) > 0 && i.effect.atk === arms.atk).sort((a, b) => of(b) - of(a))[0];
  const armPower = blade ? weaponPower(content, arms.atk) * of(blade) : 0;
  const power = Math.max(armPower, boundOf(content, state) ? treasurePower(content, state.treasure) : 0);
  const armor = Math.round(worn.reduce((n, i) => n + (i.effect?.def ?? 0) * of(i), 0) * (RATES(content).armor_per_def ?? 0));
  const wardOf = el => worn.reduce((n, i) => n + (i.effect?.ward?.[el] ?? 0) * of(i), 0);
  const ward = Object.fromEntries(Object.keys(arms.ward)
    .map(el => [el, Math.round(wardOf(el) * (RATES(content).ward_per_point ?? 0))]).filter(([, n]) => n > 0));
  // Every 符 in the bag that is a card (the drawn 符, and a story's one-time
  // 符 such as 踏马的符, 古五) goes in hand at the door, one of each.
  const catalog = cardCatalog(content);
  const charms = content.items.items.filter(i => i.effect?.charm && (state.bag?.[i.id] ?? 0) > 0 && catalog[i.id]?.charm).map(i => i.id);
  return { power, armor, ward: Object.keys(ward).length ? ward : null, charm: charms[0] ?? null, charms };
}

/* A worn thing's fight numbers as the fight shows them at his level (batch 3): 主灵根一击 +n (`atk`), 护体 n (`def`), 抗 n by root
   (`ward`) — its points × the gear rates × gearFactor, × his unit (battle.js § unitOf); its lent root as it is. For the words that
   state them (strengthen.mjs, wayline.js gearWords). */
export function gearShown(content, state, item) {
  const e = item?.effect ?? {}, f = gearFactor(content, state, item), u = unitAt(content, state), r = RATES(content);
  const S = n => (n > 0 ? Math.max(1, Math.round(n * f * u)) : 0);
  const out = {};
  if (e.atk) out.atk = S(weaponPower(content, e.atk));
  if (e.def) out.def = S(e.def * (r.armor_per_def ?? 0));
  if (e.ward) out.ward = Object.fromEntries(Object.entries(e.ward).map(([el, n]) => [el, S(n * (r.ward_per_point ?? 0))]).filter(([, n]) => n > 0));
  if (e.root) out.root = e.root;
  return out;
}

/* His roots, and the ones his arms lend: a sword's `root` (佩之借木) and the
   element a 本命法宝 was bound with. A 功法 of a lent root may go in the
   deck while the thing is worn; taken off, the card drops out (deckFor). A
   gift is chosen by his own roots only — a card he could lose is no gift. */
function rootsOf(content, state) {
  const lent = [wornOf(content, state, 'weapon')?.effect?.root, boundOf(content, state)?.element].filter(Boolean);
  return new Set([...(state.traits ?? []), ...lent]);
}
/* His level for a fight: L (playpay.mjs levelOf) where the 81 levels and the power knobs are, else null (零层, or a world
   without them: the old numbers). */
export const fightLevel = (content, state) => atLevel(content, content?.ladder ? levelOf(content, state.tier, state.step ?? 0)?.level : null);
/* 斗法 v4 (design.md): ONE sheet for both sides, one switch. While balance.json `duel_hp.foe` is absent every fight is reckoned
   as it was (his 气血 P(his level) on the levelled units, the beast its class share); while it stands, both are whole numbers
   read off the level (`duel_hp` base + per_level × level), the card's own numbers shown as they are (unit 1), gear and pills at
   the wearer's level. */
export const fixedSheet = content => Boolean(content?.balance?.duel_hp?.foe);
/* 气血 at full (batch 3, rules/power.mjs): P(his level) — one formula for the fight, the 秘境's run and a heal pill's share;
   零层 (and a world without the knobs) the old reading: the realm's, half a point a step (in 段 a third of that a 层). */
export function hpMaxOf(state, content = null) {
  const L = content ? fightLevel(content, state) : null;
  const hp = content?.balance?.duel_hp;
  if (fixedSheet(content) && hp) return hp.base + hp.per_level * (L ?? 0);
  if (L != null) return Math.round(powerOf(powerKnobs(content), L));
  return Math.round((CARD_REALMS[state.tier] ?? CARD_REALMS.qi).hp + (content ? hpStep(content, state.tier, state.step ?? 0) : state.step ?? 0) * 0.5);
}
/* The level a beast stands at in this fight: its own (`level`, a story fight's, fixed) else his, held inside its place's band
   (`levels`, a repeatable's: a pool's place, a 秘境 重) — null where he has none (零层). */
export const foeLevel = (content, state, creature) => {
  const L = fightLevel(content, state);
  if (L == null) return null;
  return atLevel(content, creature?.level ?? clampTo(L, creature?.levels));
};
/* Each side's level on the door (battle.js begin): his and the beast's, their P, the anchor P₁ — and the beast's realm is the
   realm of its level (境界压制 where they differ). Nothing where he stands at 零层. */
function levelsAt(content, state, creature) {
  if (fixedSheet(content)) return null;
  const L = fightLevel(content, state), Lf = foeLevel(content, state, creature), x = powerKnobs(content);
  if (L == null || Lf == null) return null;
  const tier = content.ladder.tiers[Math.min(content.ladder.tiers.length - 1, Math.floor((Lf - 1) / 9))]?.id ?? state.tier;
  return { anchor: anchorOf(content, state), you: { level: L, pow: powerOf(x, L) }, foe: { level: Lf, pow: powerOf(x, Lf), tier } };
}
/* His units (battle.js § unitOf): the fight is reckoned as today's fight of his realm — his 气血 P₁ × the realm's length class
   (battle.js REALMS hp over 练气's: 1 · 1.3 · 1.6 · 2, how much longer a realm's fights run), a beast's its share of that
   realm's row — and shown × P(his level) ÷ that anchor, so his 气血 on the page is P(his level). */
/* A level as a {tier, step} on 古's ladder (L = realm × 9 + 层; 练气 counts from 零层). */
export function levelState(content, L) {
  const tiers = content.ladder.tiers, r = Math.min(tiers.length - 1, L > 0 ? Math.floor((L - 1) / 9) : 0), t = tiers[r];
  return { tier: t.id, step: L - r * 9 - (t.zero ? 0 : 1) };
}
const realmRow = state => CARD_REALMS[state.tier] ?? CARD_REALMS[Object.keys(CARD_REALMS).at(-1)];
export const lengthClass = state => realmRow(state).hp / CARD_REALMS.qi.hp;
/* …his 气血 in his units: the realm's row at its first level as it was, a whole number (练气一层 21 = P₁ rounded, 筑基一层 26,
   结丹 32, 元婴 40) — so his 气血 on the page, the anchor × P(L) ÷ the anchor, is P(L) to the point. */
const firstHp = state => Math.round(realmRow(state).hp + (state.tier === 'qi' ? 0.5 : 0));
export const anchorOf = (content, state) => Math.round((powerKnobs(content).first * firstHp(state)) / firstHp({ tier: 'qi' }));
/* What one of his units shows as at this level (1 where he has no level). */
export const unitAt = (content, state) => { if (fixedSheet(content)) return 1; const L = fightLevel(content, state); return L == null ? 1 : powerOf(powerKnobs(content), L) / anchorOf(content, state); };
/* What a worn thing's numbers are worth at the door, in his units: × P(its own level) ÷ P(his) (batch 3) — an arm of a higher
   level is a stronger arm; without levels (零层), as before. */
/* `power.things`: 'own' — a worn thing and a pill count at their own level (one made for 练气一层 is a 练气一层 thing at
   筑基); 'wearer' — at his (a thing never ages; its level sets its price only). The master's choice (master.fight). */
export const ownLevel = content => powerKnobs(content)?.things === 'own';
const gearFactor = (content, state, item) => {
  const L = fightLevel(content, state), x = powerKnobs(content);
  return fixedSheet(content) || L == null || !(item?.level >= 1) || !ownLevel(content) ? 1 : powerOf(x, item.level) / powerOf(x, L);
};

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

export function lendOf(content, lost) {
  const rungs = content?.balance?.duel_lend?.rungs ?? [];
  const chosen = rungs.slice(0, Math.max(0, Math.floor(lost || 0)));
  if (!chosen.length) return null;
  return chosen.reduce((sum, rung) => {
    for (const [key, value] of Object.entries(rung)) if (typeof value === 'number') sum[key] = (sum[key] ?? 0) + value;
    return sum;
  }, {});
}

export function fightSetup(content, state, creature, now, game = null, deal = null, read = 0) {
  const open = openFight(state, game);
  if (open?.setup) return open.setup;
  // 望气: the scroll's 上卷, or a mark the story lent. (问卦's 卦力 and its 望气 at 吉 went with 问签 v1, 2026-11-02:
  // the day's 签 pays 修为, never a fight's luck — fortune.mjs.)
  const insight = Math.max(state.insight ?? 0, read);
  const main = state.fate?.element?.id ?? state.fate?.element ?? mainRoot(state) ?? 'wood';
  // 小队 (party.json, cards.md § 5): who stands beside him in this fight. 银月 is a member, never
  // a card in hand: asleep in the 木牌 through 卷一, she stands in the row from the 卷 she wakes in.
  const party = partyFor(content, state, creature, game);
  const withHer = party.some(m => m.id === 'yinyue');
  const gear = gearFight(content, state), lifts = withHer ? herLifts(content, state) : null;
  // Before the root test (the 三试 comes first) he fights with what no root claims:
  // the rootless things he holds (deckFor reads no roots, so a 功法 stays out).
  const deck = fightDeck(content, state, { ten: evenDuel(content, state, creature) });
  // 新: a card gained and not yet played (cards_new), marked in the hand until it is.
  const fresh = (state.cards_new ?? []).filter(id => deck.includes(id));
  // 丹囊: the pills he carries in (his last pick, as the bag still holds them).
  const lv = levelsAt(content, state, creature);
  // A 回春丹's 气血 is its own level's (batch 2, master.pills): into his units at the door (battle.js § unitOf).
  const unit = unitAt(content, state), at = id => content.items.items.find(i => i.id === id)?.level ?? 1;
  const into = p => (ownLevel(content) ? unit : unitAt(content, levelState(content, at(p.id))));
  const pouch = pouchFor(content, state).map(p => (p.heal && into(p) !== 1 ? { ...p, heal: Math.max(1, Math.round(p.heal / into(p))) } : p));
  return {
    mode: 'pve',
    ...(lendOf(content, state.duel_lost?.[creature.id]) ? { lend: lendOf(content, state.duel_lost?.[creature.id]) } : {}),
    ...(lv ? { anchor: lv.anchor } : {}),
    seed: deal ? `${duelSeed(state, creature, now)}|${deal}` : duelSeed(state, creature, now),
    you: {
      tier: state.tier, step: fixedSheet(content) ? 0 : hpStep(content, state.tier, state.step ?? 0), ...(fixedSheet(content) ? { base: hpMaxOf(state, content) } : {}), root: main, deck, extra: [...(creature.extra ?? []), ...gear.charms],
      // The fight's own word (an exit game's `foe.fatigue: false`, world.mjs weighed): no 反噬 on a dry deck.
      ...(creature.fatigue === false ? { fatigue: false } : {}),
      ...(party.length ? { party } : {}),
      ...(fresh.length ? { fresh } : {}),
      ...(pouch.length ? { pouch } : {}),
      ...(lifts ? { lifts } : {}),
      // 望气: how much of the beast's plan he can read — the scroll (items
      // `learn`), or the day's reading at 吉/大吉.
      ...(insight ? { insight } : {}),
      // What he wears, as numbers (§ 装备入局).
      ...(gear.power ? { power: gear.power } : {}),
      ...(gear.armor ? { armor: gear.armor } : {}),
      ...(gear.ward ? { ward: gear.ward } : {}),
      // 问卦: the lower trigram's element, its 功法 lifted or lowered today.
      ...(lv ? lv.you : {}),
    },
    // An elite is its harder deck and nothing else (redesign-v2 § 四).
    ...(evenDuel(content, state, creature) ? { even: true } : {}),
    foe: { tier: state.tier, root: creature.root, deck: creature.deck ?? [], ...evenDeck(content, state, creature, fightLength(content, state, creature, beastToParty(content, creature, party, game), lv?.foe.level)), ...(creature.signature ? { signature: creature.signature } : {}), ...(creature.feint ? { feint: creature.feint } : {}), ...(creature.trial ? { trial: creature.trial } : {}), ...(lv ? lv.foe : {}) },
  };
}

/* Who stands beside him (party.json): the fight's own word (an exit game's `foe.party`, carried
   on the foe), else the 回 he stands in (`by_hui`); a member of a 卷 not yet open (银月, asleep in
   卷一) never. Each member as the fight takes it: id, name, root, share of 气血, 嘲讽, deck. */
export function partyFor(content, state, creature, game = null) {
  const p = content.party;
  if (!p) return [];
  const open = juanOf(content, state);
  // Hanli 2026-10-16: 「小队是人数跟剧情走, 剧情是一个人就一个人」 — every fight, a roaming one too
  // (a haunt's, a pool's, the 秘境's), has whoever stands with him at that point of the book.
  // A member who `walks` with him (银月, once her 卷 is open) stands beside him in every fight she is awake for.
  const walking = Object.entries(p.members ?? {}).filter(([, m]) => m.walks && herAwake(state)).map(([id]) => id);
  const ids = [...new Set([...(creature?.party ?? p.by_hui?.[huiNow(content, state)] ?? []), ...walking])];
  return ids.map(id => [id, p.members?.[id]]).filter(([, m]) => m && (m.juan ?? 1) <= open)
    .map(([id, m]) => ({ id, name: m.name, root: m.root, hp: m.hp, ...(m.taunt ? { taunt: true } : {}), ...(m.art ? { art: m.art } : {}), deck: [...m.deck] }));
}
/* A beast met roaming (a haunt's or a pool's door, `haunt:`) grows with the party beside him
   (party.json `roaming`): its 气血 times 1 + `hp` a member, its blows + `power` a member — so a
   pool stays losable with 孙二狗's guard and 阿禾's heals; a pool entry's own `roaming` stands over it
   (a beast the party finds easier). A story fight's foe is weighed with its
   party already (the exit's `foe`), so it never grows. A pool entry's `roaming.extra` deals that
   many of its own cards again even when he is alone: a slow, hard beast (领胡, 鬿雀) fights to the
   end instead of running dry. Returns the foe's { hp, power, deck } fields. */
export function beastToParty(content, creature, party, game = null) {
  const r = content.party?.roaming ? { ...content.party.roaming, ...(creature.roaming ?? {}) } : null, n = party.length;
  const hp = creature.hp ?? null, deck = creature.deck ?? [];
  if (!r || !(n || r.extra) || !String(game ?? '').startsWith('haunt:')) return hp ? { hp } : {};
  const grown = Math.round((hp ?? 1) * (1 + (r.hp ?? 0) * n) * 100) / 100;
  const power = (r.power ?? 0) * n, more = deck.length ? (r.extra ?? 0) + (r.cards ?? 0) * n : 0;
  return { hp: grown, ...(power ? { power } : {}), ...(more ? { deck: [...deck, ...Array.from({ length: more }, (_, i) => deck[i % deck.length])] } : {}) };
}
/* 斗法's length (balance.json fight_length; Hanli 2026-11-07: about 3 minutes at 练气, within 5 at
   any realm): a beast's 气血 at most what a player of this realm and 层 deals a round (`dpt`) times
   the realm's rounds — what it loses back on its blows (`might`, battle.js) — and its heals counted (`heals` a fight, none past a round's
   `dpt`). A ceiling — a frailer beast keeps its own. A 试 (`trial`) and a foe that says `long` are
   left as they are. `grown` is the foe's { hp, power, deck } as the party left it (beastToParty). */
export function lengthRule(content, state) {
  const r = content.balance?.fight_length, at = Math.max(0, tierIndex(content, state));
  if (!r) return null;
  const minutes = Math.min(r.cap ?? Infinity, r.minutes?.[at] ?? r.cap ?? 5);
  const rounds = (minutes * 60) / r.sec_per_round;
  // What a player of level L deals a round (batch 3), in his units (battle.js § unitOf — the fight is reckoned as at 练气一层;
  // the page shows it × P(L) ÷ P₁): his hand's card points, `first` at 练气一层 and `per_level` more a level (the cards the road
  // deals). 零层 the line read down to L0.
  // In a realm of a longer fight (its length class, § anchorOf: 1 · 1.3 · 1.6 · 2) the cap is that much less a round — the
  // rounds the realm's minutes give carry the rest (筑基一层: 8.5 ÷ 1.3 = 6.5, today's row).
  const d = r.dpt ?? {}, L = levelOf(content, state.tier, state.step ?? 0)?.level ?? 0;
  const dpt = ((d.first ?? 0) + (d.per_level ?? 0) * (L - 1)) / lengthClass(state);
  return { minutes, rounds, dpt, hp: Math.round(dpt * rounds), heals: r.heals ?? null, healMax: Math.max(1, Math.round(dpt)), carry: r.carry ?? 0 };
}
/* 斗法 on fixed numbers (balance.json `duel_hp.foe`, Hanli 2026-11-12: one pool of cards, a card the same in either
   hand): a beast's 气血 is a whole number read off its level — his own 气血 at that level (`duel_hp` base + per_level × level)
   times its rank's share (`duel_hp.foe.share`; the rank is the creature's `rank`, else read off its old `hp` by
   `duel_hp.foe.by_hp`) times what the party beside him adds (beastToParty) — and its cards hit as written: no `might`.
   A 试 (`trial`), a foe that says `long` and 零层 are left as they were. */
export function foeRank(content, creature) {
  const f = content?.balance?.duel_hp?.foe;
  if (creature.rank) return creature.rank;
  const hp = creature.hp ?? 1;
  return (f?.by_hp ?? []).find(([upto]) => hp < upto)?.[1] ?? f?.top ?? 'strong';
}
/* 斗法 v4 (design.md): the two sides on one sheet. On when balance.json `duel_hp.foe.deck` says so and the beast is one the
   fixed numbers reach (duelFoe). */
const evenDuel = (content, state, creature) => Boolean(content?.balance?.duel_hp?.foe?.deck && duelFoe(content, state, creature, {}));
/* A beast's ten (`duel_hp.foe.deck`: { size, base, per_level, keep }): its own cards from the cheapest, as many as his deck
   holds, their cost together no more than its level allows (base + per_level × level) — a dear card past that gives way to a
   one-cost card of its own root from the pool (never more than two of one, at least `keep` of its own stay), and a deck
   under it takes its dearest cards back. Counted, never random: the same beast at the same level holds the same ten. */
export function beastTen(content, creature, level) {
  const k = content.balance.duel_hp.foe.deck, catalog = cardCatalog(content), cost = id => catalog[id]?.cost ?? 1;
  const own = [...(creature.deck ?? [])].sort((a, b) => cost(a) - cost(b) || (a < b ? -1 : 1));
  if (!own.length) return [];
  const size = k.size ?? MODES.pve.deck, budget = Math.round((k.base ?? 13) + (k.per_level ?? 1.5) * level);
  const ten = Array.from({ length: size }, (_, i) => own[i % own.length]).sort((a, b) => cost(a) - cost(b) || (a < b ? -1 : 1));
  const rest = own.slice(size), sum = () => ten.reduce((n, id) => n + cost(id), 0);
  // Under its budget: its dearest cards come back in for its cheapest.
  for (let i = 0; rest.length && i < size; i += 1) {
    const dear = rest[rest.length - 1];
    if (sum() - cost(ten[i]) + cost(dear) > budget || cost(dear) <= cost(ten[i])) break;
    ten[i] = rest.pop();
  }
  // Over it: the dearest give way to one-cost cards of its root.
  const fill = Object.values(catalog).filter(c => c.cost === 1 && !c.owner && !c._token && (c.element === creature.root || c.element == null) && !c.pill && !c.mortal)
    .sort((a, b) => (a.element === creature.root ? 0 : 1) - (b.element === creature.root ? 0 : 1) || (a.id < b.id ? -1 : 1)).map(c => c.id);
  const count = id => ten.filter(x => x === id).length, mine = () => ten.filter(id => own.includes(id)).length;
  ten.sort((a, b) => cost(b) - cost(a) || (a < b ? -1 : 1));
  for (let i = 0; i < size && sum() > budget && mine() > (k.keep ?? 4); i += 1) {
    const f = fill.find(id => count(id) < 2 && cost(id) < cost(ten[i]));
    if (!f) break;
    ten[i] = f;
  }
  return ten;
}
function evenDeck(content, state, creature, foe) {
  if (!evenDuel(content, state, creature)) return foe;
  const L = foeLevel(content, state, creature) ?? fightLevel(content, state);
  return { ...foe, deck: beastTen(content, creature, L) };
}
function duelFoe(content, state, creature, grown) {
  const b = content?.balance, f = b?.duel_hp?.foe;
  if (!f || creature.trial || creature.long) return null;
  const L = fightLevel(content, state);
  if (L == null) return null;
  const Lf = foeLevel(content, state, creature) ?? L;
  const grew = (grown.hp ?? 1) / (creature.hp ?? 1);
  const hp_fixed = Math.max(1, Math.round((b.duel_hp.base + b.duel_hp.per_level * Lf) * (f.share?.[foeRank(content, creature)] ?? 1) * grew));
  const rule = lengthRule(content, state);
  return { ...grown, hp_fixed, ...(rule?.heals != null ? { heals: rule.heals, healMax: rule.healMax } : {}) };
}
/* `Lf`: the beast's level at this door (its 气血's share is read at it); none, the old realm's row. */
export function fightLength(content, state, creature, grown, Lf = null) {
  const fixed = duelFoe(content, state, creature, grown);
  if (fixed) return fixed;
  const rule = !creature.trial && !creature.long ? lengthRule(content, state) : null;
  if (!rule) return grown;
  // A beast's share of 气血 in his units: 零层's 20 × P(its level) ÷ P(his) (battle.js begin); no level, the old realm's row.
  const L = fightLevel(content, state), x = powerKnobs(content);
  const share = (CARD_REALMS[state.tier] ?? CARD_REALMS.qi).hp * (Lf != null && L != null ? powerOf(x, Lf) / powerOf(x, L) : 1) * (MODES.pve.foeHp ?? 1);
  const most = Math.floor((rule.hp / share) * 100) / 100;
  const was = grown.hp ?? 1, cut = was > most;
  // The weight a cut takes off its 气血 comes back on its blows (`carry`: 0 none, 1 all of it).
  const might = cut ? Math.round((was / most) ** rule.carry * 100) / 100 : 1;
  return { ...grown, ...(cut ? { hp: most } : {}), ...(might > 1 ? { might } : {}), ...(rule.heals != null ? { heals: rule.heals, healMax: rule.healMax } : {}) };
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
  // A 回春丹's 气血 as the fight will show it at his level (batch 3: at its own level, or — power.things 'wearer' — at his).
  const heal = i => (ownLevel(content) || !i.effect.fight.heal ? {} : { heal: Math.max(1, Math.round((i.effect.fight.heal / unitAt(content, levelState(content, i.level ?? 1))) * unitAt(content, state))) });
  const pills = content.items.items.filter(i => i.effect?.fight && (state.bag?.[i.id] ?? 0) > 0)
    .map(i => ({ id: i.id, name: pick(i.name, state.lang), n: state.bag[i.id], ...i.effect.fight, ...heal(i), ...(i.art ? { art: i.art } : {}) }));
  return pills.length ? { max: POUCH_MAX, pick: pouchFor(content, state).map(p => p.id), pills } : null;
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
  .filter(c => !c._token && !c.gear && (c.from ?? []).some(f => f.kind === kind && (f.scene ?? f.task ?? f.creature ?? f.item) === key));
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
  if (!card || card._token || card.gear) return null; // a sword's strike is the sword's (strikeOf), never handed over
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
      // what a 随从 is, worded (cards.json `is` · `is_words`): the 牌谱 row says it, never 「minion = 灵兽」
      ...(c.is && content.cards?.is_words?.[c.is] ? { is: pick(content.cards.is_words[c.is], lang) } : {}),
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

/* ── 卡册: every card that can be collected (design.md § 斗法 v4 · 品 · 框 · the 卡册) ──
   品 is read off where a card is found (rules/pin.mjs), never typed on it. The book holds each card once: held, the face the
   hand shows; not held, its 品 and one line of where it is found — from data that already exists (the card's `from` row,
   the beast's name, the 重's name), never a chance. A companion's cards stand on their own leaf: shown, not counted. */
const PIN_WORDS = {
  fan: { zh: '凡', en: 'Plain' }, yin: { zh: '银', en: 'Silver' }, jin: { zh: '金', en: 'Gold' },
  baoshi: { zh: '宝石', en: 'Gem' }, zuanshi: { zh: '钻石', en: 'Diamond' },
};
const WHERE = {
  zh: { story: '{hui}得自{who}', storyBare: '{hui}剧情所得', beat: '赢下一局所得', tale: '传闻了结所得', shop: '{who}处可买',
    beast: '降服{name}所得', bout: '胜{name}所得', jin: '{name}手中的牌', baoshi: '{tier} · 大妖{name}手中的牌',
    tame: '{at}收服{name}', summon: '{item}召来', juan: '卷{n} · ', hui: '{hui} · ' },
  en: { story: '{hui}from {who}', storyBare: '{hui}from the story', beat: 'Won in a game', tale: 'Left when a tale is done', shop: 'Sold by {who}',
    beast: 'Won by subduing {name}', bout: 'Won from {name}', jin: "{name}'s own card", baoshi: "{tier} · the great beast {name}'s own card",
    tame: '{at}tame {name}', summon: 'Called by {item}', juan: 'Book {n} · ', hui: '{hui} · ' },
};
const fillIn = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const huiAt = (content, scene, lang, t) => { const h = scene ? huiLabel(content, sceneHui(content, scene), lang, 'short') : null; return h ? fillIn(t.hui, { hui: h }) : ''; };
const creatureName = (content, id, lang) => pick(creatureOf(content, id)?.name, lang) ?? id;
const bossTier = (content, id) => (content.mijing?.tiers ?? []).find(t => t.boss?.creature === id) ?? null;
/* Each source kind's one line; `row` is the card's graded `from` row, `pin` its 品. */
const WHERE_OF = {
  story: (content, f, lang, t) => fillIn(pick(f.who, lang) ? t.story : t.storyBare, { hui: huiAt(content, f.scene, lang, t), who: pick(f.who, lang) }),
  beat: (content, f, lang, t) => t.beat,
  tale: (content, f, lang, t) => t.tale,
  shop: (content, f, lang, t) => fillIn(t.shop, { who: pick(f.keeper, lang) ?? '' }),
  beast: (content, f, lang, t) => { const k = creatureOf(content, f.creature); return fillIn(k?.person || k?.gender ? t.bout : t.beast, { name: creatureName(content, f.creature, lang) }); },
  foe: (content, f, lang, t, pin) => fillIn(t[pin] ?? t.jin, { name: creatureName(content, f.creature, lang), tier: pick(bossTier(content, f.creature)?.name, lang) ?? '' }),
  tame: (content, f, lang, t) => {
    const juan = creatureOf(content, f.creature)?.juan;
    const at = f.scene ? huiAt(content, f.scene, lang, t) : juan > 1 ? fillIn(t.juan, { n: lang === 'en' ? juan : zhNumber(juan) }) : '';
    return fillIn(t.tame, { at, name: creatureName(content, f.creature, lang) });
  },
  summon: (content, f, lang, t) => fillIn(t.summon, { item: pick(content.items?.items?.find(i => i.id === f.item)?.name, lang) ?? pick(cardCatalog(content)[f.item]?.name, lang) ?? f.item }),
};
/// One line of where a card is found, or null for a card not collected.
export function whereOf(content, card, lang = 'zh') {
  const r = pinRow(content, card);
  return r ? WHERE_OF[r.f.kind]?.(content, r.f, lang, WHERE[lang] ?? WHERE.zh, r.pin) ?? null : null;
}
/* A held card in the book: what the hand already shows of it. A 符 (a `_token` card bought or handed) is held while it is in the bag. */
const heldIn = (content, state) => { const owned = new Set(ownedCards(content, state)); return c => owned.has(c.id) || Boolean(c._token && (state.bag?.[c.id] ?? 0) > 0); };
const faceOf = (content, c, lang) => ({
  cost: c.cost ?? null, kind: c.kind, element: c.element ?? null, ...(c.atk != null ? { atk: c.atk, hp: c.hp } : {}), ...(c.art ? { art: c.art } : {}),
  ...(c.is && content.cards?.is_words?.[c.is] ? { is: pick(content.cards.is_words[c.is], lang) } : {}),
});
/* A companion's own card: a party member's (party.json members) handed by the book as theirs (`member`). */
const companionCard = (content, c) => Boolean(c.owner && content.party?.members?.[c.owner] && (c.from ?? []).some(f => f.kind === 'member'));
export function kaceBrief(content, state) {
  const lang = state.lang, all = content.cards?.cards ?? [], held = heldIn(content, state), fresh = new Set(state.cards_new ?? []);
  const row = c => ({ id: c.id, name: pick(c.name, lang), ...(held(c) ? { held: true, ...faceOf(content, c, lang), ...(fresh.has(c.id) ? { fresh: true } : {}) } : {}) });
  const cards = all.map((c, i) => ({ c, i, r: pinRow(content, c) })).filter(x => x.r)
    .sort((a, b) => PINS.indexOf(a.r.pin) - PINS.indexOf(b.r.pin) || (a.c.cost ?? 0) - (b.c.cost ?? 0) || a.i - b.i)
    .map(({ c, r }) => ({ ...row(c), pin: r.pin, where: whereOf(content, c, lang) }));
  const counts = PINS.map(pin => ({ pin, name: pick(PIN_WORDS[pin], lang), held: cards.filter(c => c.pin === pin && c.held).length, of: cards.filter(c => c.pin === pin).length }));
  const members = Object.entries(content.party?.members ?? {});
  // Theirs, never his to collect: each card's face as they play it, held or not.
  const companions = members.map(([id, m]) => ({ id, name: pick(m.name, lang) ?? id, cards: all.filter(c => c.owner === id && companionCard(content, c)).map(c => ({ id: c.id, name: pick(c.name, lang), ...faceOf(content, c, lang) })) }))
    .filter(m => m.cards.length);
  return { cards, counts, held: cards.filter(c => c.held).length, of: cards.length, companions };
}

export { canPick, cardBook, cardCatalog, gainCard, gearFight, ownedAtStart, pickedCards, rootsOf, starterOf, usable, winCard };
