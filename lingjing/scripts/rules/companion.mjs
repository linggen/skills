// rules/companion.mjs — The companion: found, not given — her call, her past, what she brings to a fight.
// Part of the rules engine; rules.mjs is its one door.
import { dayKey, pick } from '../state.mjs';
import { wornOf } from './arms.mjs';
import { itemOf } from './errands.mjs';
import { hashOf } from './travel.mjs';
import { placeName, placeOf, provinceOpen, tooHard } from './world.mjs';

/* The thread — the pull: the scene while one runs, else the next chapter
   and when it opens; nothing when the spine has run out. */
/* ── The companion — she is found, not given ──
   A world declares one in `world.json`: who she is, the realm her call comes
   at, the bell that calls her, her riddles and the beat when she joins. Until
   she is found the game never shows her: her lines are the narration's (a
   line may carry `alone` for that), she is not in the cast, her gifts cannot
   be given, and the stage stands empty (his rule, 2026-09-17). */
const companionOf = content => content.world.companion ?? null;
export const hasCompanion = state => Boolean(state.companion?.joined);
const callDue = (content, state) => {
  const c = companionOf(content);
  if (!c) return false;
  const tiers = content.ladder.tiers;
  return tiers.findIndex(t => t.id === state.tier) >= tiers.findIndex(t => t.id === c.from);
};
/* Her riddle, once asked today, stays today's; else one this play has not seen. */
function companionRiddle(content, state, now) {
  const c = companionOf(content), slot = state.companion?.riddle;
  if (slot?.day === dayKey(now) && c.riddles.includes(slot.key)) return slot.key;
  const seen = new Set(state.riddles_seen ?? []);
  const fresh = c.riddles.filter(k => !seen.has(k));
  const pool = fresh.length ? fresh : c.riddles;
  return pool[hashOf(`${dayKey(now)}|${state.name ?? ''}|companion`) % pool.length];
}
const riddleWaiting = (state, now) => {
  const slot = state.companion?.riddle;
  return Boolean(slot?.open && slot.day === dayKey(now));
};
/* The nearest place the player could walk to that answers a test — a market
   for the bell, water for the bell's sound — by the roads, never as the crow
   flies, skipping closed provinces and what is beyond their tier. */
function nearestPlace(content, state, now, test) {
  const here = placeOf(content, state.place);
  if (!here) return null;
  const seen = new Set([here.id]);
  let edge = [here];
  for (let steps = 0; steps < 12 && edge.length; steps += 1) {
    const next = [];
    for (const p of edge) {
      // Where he STANDS counts first. It did not until 2026-09-18, and the
      // quest card sent him two days down the road to 濮阳 for a bell that was
      // on the shelf in front of him at 邺城 (his "坊市在濮阳, 但我在邺城").
      if (test(p)) return { ...placeName(content, state, p), steps };
      for (const id of p.roads ?? []) {
        if (seen.has(id)) continue;
        seen.add(id);
        const q = placeOf(content, id);
        if (q && provinceOpen(content, q.province, now) && !tooHard(content, state, q)) next.push(q);
      }
    }
    edge = next;
  }
  return test(here) ? { ...placeName(content, state, here), steps: 0 } : null;
}

/* The quest as Look tells it: the step, what it asks, and the line for it. */
function questBrief(content, state, now) {
  const c = companionOf(content);
  if (!c || !state.companion || state.companion.joined) return null;
  const lang = state.lang, bell = itemOf(content, c.bell);
  const here = placeOf(content, state.place);
  const held = (state.bag[c.bell] ?? 0) > 0;
  const step = riddleWaiting(state, now) ? 'riddle' : !held ? 'bell' : here?.water ? 'ring' : 'water';
  return {
    id: c.id, step,
    bell: { id: bell.id, name: pick(bell.name, lang), buy: bell.buy, held },
    line: pick(step === 'bell' || step === 'water' ? c.call : c.water, lang),
    at_water: Boolean(here?.water),
    // Where the step can be taken: the market that sells her bell, the water
    // that holds a moon — the nearest by road (his "not clickable", and no
    // way to know where, 2026-09-17).
    market: step === 'bell' ? nearestPlace(content, state, now, p => p.has?.shop) : null,
    water: step === 'water' ? nearestPlace(content, state, now, p => p.water) : null,
    shop_here: Boolean(here?.has?.shop),
    // The call is heard once: until it has been said, every answer asks for it.
    ...(state.companion.told ? {} : { say: true }),
  };
}

/* ── 她的来处 — her past, given back one cauldron at a time ──
   The approved backstory as data (worlds/<id>/companion.json): per chapter,
   the memory its cauldron returns, what she knows then and how she carries
   it. What she has recalled is a function of the chapters ENDED, and only
   once she walks with the player — memories 1–2 are told at the join, since
   she was not there. Nothing ahead ever leaves the rules: a chapter not yet
   ended (or not yet written) gives nothing, and the secret she keeps from
   徐 on is handed over only once its `told` chapter has ended. */
const loreOf = content => (content.lore && content.lore.id === companionOf(content)?.id ? content.lore : null);
/* A memory's line: its own words, or the line the spine scene already gives
   her (never a second wording of what the story said). */
function memoryLine(content, entry, lang) {
  const m = entry.memory;
  if (m.text) return pick(m.text, lang);
  const said = content.chapters[entry.chapter]?.scenes?.[m.scene]?.lines?.find(l => l.who === loreOf(content).id);
  return said ? pick(said.text, lang) : null;
}
/* What she has got back so far, oldest first: [{id, line}]. */
export function recalledOf(content, state) {
  const lore = loreOf(content);
  if (!lore || !hasCompanion(state)) return [];
  const ended = new Set(state.ended ?? []), lang = state.lang;
  const out = lore.thread.filter(e => ended.has(e.chapter)).map(e => ({ id: e.memory.id, line: memoryLine(content, e, lang) })).filter(r => r.line);
  const sec = lore.secret;
  if (sec && ended.has(sec.told)) out.push({ id: 'secret', line: pick(sec.text, lang) });
  if (sec && ended.has(sec.whole)) out.push({ id: 'whole', line: pick(sec.resolved, lang) });
  return out;
}
/* Where she stands now — what she knows and how she carries it, from the
   latest chapter ended — for her own read (Progress), so she speaks from it. */
function stanceOf(content, state) {
  const lore = loreOf(content);
  if (!lore || !hasCompanion(state)) return null;
  const ended = new Set(state.ended ?? []), lang = state.lang;
  const at = [...lore.thread].reverse().find(e => ended.has(e.chapter)) ?? lore.joined;
  return `${pick(at.knows, lang)} ${pick(at.feels, lang)}`;
}
/* Her past as Progress hands it to her; null until she is found. */
export function herPast(content, state) {
  const lore = loreOf(content);
  if (!lore || !hasCompanion(state)) return null;
  const ended = new Set(state.ended ?? []);
  return {
    recalled: recalledOf(content, state), stance: stanceOf(content, state), fear: pick(lore.fear, state.lang),
    cauldrons: lore.thread.filter(e => ended.has(e.chapter)).length,
  };
}

/* ── Beside her — her card grows both ways (Hanli, 2026-09-24: 两个都做) ──
   The 羁绊 count, 谈心 and 疗伤 were cut (redesign-v2 § 四, 2026-09-24): no
   relationship score, nothing to tap for her. Her card grows WITH the player
   — each realm reached lifts her 攻/血 as theirs grow ("when you are
   stronger, so is she") — and BY the story: the ③ ⑥ ⑨ cauldron found each
   gives her an ability, and each takes one of her reflections (rewards.json
   `her_card`). Plus whatever she wears (齐纨 +1 气血). */
const herCardOf = content => content.rewards.her_card ?? {};
/* Cauldrons found: the chapters ended that hold one (every chapter but a corridor). */
export const cauldronsFound = (content, state) => (state.ended ?? []).filter(id => content.chapters[id] && !content.chapters[id].corridor).length;
/* Her lift at the player's realm: the highest realm listed at or below theirs. */
function realmLift(content, state) {
  const tiers = content.ladder.tiers.map(t => t.id), at = tiers.indexOf(state.tier);
  const hit = Object.entries(herCardOf(content).realm ?? {}).filter(([id]) => tiers.indexOf(id) <= at && tiers.indexOf(id) >= 0)
    .sort(([a], [b]) => tiers.indexOf(b) - tiers.indexOf(a))[0];
  return hit ? { tier: hit[0], ...hit[1] } : null;
}
/* The gifts the story has given her so far, in order found. */
export const herGifts = (content, state) => (herCardOf(content).gifts ?? []).filter(g => cauldronsFound(content, state) >= g.found);
/* The gift a cauldron just found gives her — the facts for her moment (story.mjs). */
export const giftAt = (content, found) => (herCardOf(content).gifts ?? []).find(g => g.found === found) ?? null;
/* One lift from many: numbers add, an object's fields add, a flag holds. */
const sumLift = (a, b) => Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map(k => {
  const x = a[k], y = b[k];
  if (typeof x === 'number' || typeof y === 'number') return [k, (x ?? 0) + (y ?? 0)];
  if (x && typeof x === 'object' || y && typeof y === 'object') return [k, sumLift(x ?? {}, y ?? {})];
  return [k, Boolean(x || y)];
}));
function herLift(content, state) {
  const { tier, ...realm } = realmLift(content, state) ?? {};
  const her = companionOf(content)?.id, worn = her ? wornOf(content, state, her)?.effect?.lift ?? {} : {};
  return [realm, ...herGifts(content, state).map(g => g.lift ?? {}), worn].reduce(sumLift, {});
}
const liftsAny = l => Object.values(l).some(v => (typeof v === 'object' ? liftsAny(v) : Boolean(v)));
/* What her card takes into a fight: { yinyue: lift }, or null. */
function herLifts(content, state) {
  if (!hasCompanion(state)) return null;
  const lift = herLift(content, state), her = companionOf(content)?.id;
  return her && liftsAny(lift) ? { [her]: lift } : null;
}
/* Her card as the page shows it (装备, the rise): 攻/血 now, the realm it
   grew with, and each ability the story gave her in a line. */
export function herCard(content, state) {
  const her = companionOf(content)?.id, row = (content.cards?.cards ?? []).find(c => c.id === her);
  if (!row || !hasCompanion(state)) return null;
  const lift = herLift(content, state), realm = realmLift(content, state), lang = state.lang;
  return {
    atk: row.atk + (lift.atk ?? 0), hp: row.hp + (lift.hp ?? 0),
    ...(realm ? { realm: { tier: realm.tier, name: pick(content.ladder.tiers.find(t => t.id === realm.tier)?.name, lang), atk: realm.atk ?? 0, hp: realm.hp ?? 0 } } : {}),
    gifts: herGifts(content, state).map(g => ({ id: g.id, found: g.found, name: pick(g.name, lang), does: pick(g.does, lang) })),
  };
}

export { callDue, companionOf, companionRiddle, herLifts, nearestPlace, questBrief, riddleWaiting };
