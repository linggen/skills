// rules/companion.mjs — The companion: found, not given — 伤势, 羁绊, her tending and talk.
// Part of the rules engine; rules.mjs is its one door.
import { dayKey, pick } from '../state.mjs';
import { wornOf } from './arms.mjs';
import { healthBrief, hpMaxOf, woundsNow } from './cards.mjs';
import { clone, refuse } from './core.mjs';
import { herAway } from './daily.mjs';
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

/* ── 伤势 — a fight's cost carried out of it ──
   His call, 2026-09-23, from what the gate measured: a fight begun at full
   气血 every time is a fight no turn of which matters, so the real choices were
   never made. Now what a fight takes stays taken: the next one begins where
   this one ended. It mends on the 灵气 clock (full in `refill_hours`), or at
   once with a mending pill; below a quarter nobody walks into a fight. A loss
   leaves nothing — that is its cost now, where before it had none. */
const FIT_TO_FIGHT = 0.25;

/* ── 羁绊 — what walking together grows ──
   His call, 2026-09-23: the player should feel they play WITH her. The bond
   is the rules' record of it: a win beside her, an elite beaten, a realm
   broken, a wound she tended, a gift she wears, a heart-to-heart Ling marks
   once a day. Capped a day, so it is walked, not farmed. Its level makes her
   card stand taller and her tending mend more (rewards.json `bond`). */
const bondOf = content => content.rewards.bond;
function bondLevel(content, n) {
  const levels = bondOf(content).levels;
  return [...levels].reverse().find(l => n >= l.at) ?? levels[0];
}
function bondBrief(content, state) {
  const n = state.bond?.n ?? 0, lang = state.lang, levels = bondOf(content).levels;
  const level = bondLevel(content, n), next = levels.find(l => l.at > n);
  return { n, level: level.id, name: pick(level.name, lang), ...(next ? { next: next.at, next_name: pick(next.name, lang) } : {}) };
}
/* Grow it by a kind of shared moment; returns what changed, or null. */
function gainBond(content, s, kind, now, key = null) {
  if (!hasCompanion(s)) return null;
  const cfg = bondOf(content), day = dayKey(now);
  s.bond ??= { n: 0 };
  if (key && (s.bond.keys ?? []).includes(key)) return null;
  const today = s.bond.day === day ? s.bond.today ?? 0 : 0;
  const add = Math.min(cfg.gains[kind] ?? 0, cfg.day_cap - today);
  if (add <= 0) return null;
  const before = bondLevel(content, s.bond.n);
  s.bond = { ...s.bond, n: s.bond.n + add, day, today: today + add, ...(key ? { keys: [...(s.bond.keys ?? []), key] } : {}) };
  const after = bondLevel(content, s.bond.n);
  return { kind, gained: add, ...bondBrief(content, s), ...(after.id !== before.id ? { rose: pick(after.name, s.lang) } : {}) };
}
/* Her card, as the bond and what she wears lift it — locked at the door
   with the rest. 齐纨 +1 气血 (his, 2026-09-23: 银月的佩戴都没啥用 — we cannot
   change how she looks, so a number). 银月铃 lifts her 疗伤 instead: a heal
   +1 in the fight measured nothing, and +1 攻 over 同心 failed the gate. */
const bondLifts = (content, state) => {
  if (!hasCompanion(state)) return null;
  const lift = bondLevel(content, state.bond?.n ?? 0).lift ?? {};
  const her = companionOf(content)?.id, worn = her ? wornOf(content, state, her)?.effect?.lift ?? {} : {};
  const sum = { atk: (lift.atk ?? 0) + (worn.atk ?? 0), hp: (lift.hp ?? 0) + (worn.hp ?? 0) };
  return sum.atk || sum.hp ? { yinyue: sum } : null;
};

/* 疗伤 — she tends the wound, once a day, by the bond. A page tap. */
export function tend(state, content, ctx) {
  const lang = state.lang;
  if (!hasCompanion(state)) return refuse('no-companion', null);
  if (herAway(state, ctx.now)) return refuse('away', pick({ zh: '她出门历练去了。', en: 'She is out on her journey.' }, state.lang));
  const n = woundsNow(content, state, ctx.now);
  if (!n) return refuse('not-hurt', pick({ zh: '身上没伤。', en: 'You are not hurt.' }, lang));
  const day = dayKey(ctx.now);
  if (state.tended === day) return refuse('tended-today', pick({ zh: '今日她已替你调理过了。', en: 'She has already tended you today.' }, lang));
  const s = clone(state);
  // 银月铃 on her: its sound settles the breath, and she mends a tenth more.
  const her = companionOf(content)?.id;
  const share = bondLevel(content, s.bond?.n ?? 0).tend + (her ? wornOf(content, s, her)?.effect?.lift?.tend ?? 0 : 0);
  const mended = Math.min(n, Math.ceil(hpMaxOf(s) * share));
  s.wounds = n - mended ? { n: n - mended, at: ctx.now.toISOString() } : undefined;
  if (!s.wounds) delete s.wounds;
  s.tended = day;
  const bond = gainBond(content, s, 'tend', ctx.now);
  return { state: s, result: { ok: true, mended, health: healthBrief(content, s, ctx.now), ...(bond ? { bond } : {}) } };
}

/* 谈心 — Ling marks a real exchange with her, once a day (the talk gain). */
export function bond(state, content, ctx) {
  if (!hasCompanion(state)) return refuse('no-companion', null);
  if (state.bond?.talked === dayKey(ctx.now)) return refuse('talked-today', null);
  const s = clone(state);
  const got = gainBond(content, s, 'talk', ctx.now);
  s.bond = { ...(s.bond ?? { n: 0 }), talked: dayKey(ctx.now) };
  return { state: s, result: { ok: true, bond: got ?? bondBrief(content, s), ...(got ? {} : { capped: true }) } };
}

export { bondBrief, bondLifts, callDue, companionOf, companionRiddle, FIT_TO_FIGHT, gainBond, nearestPlace, questBrief, riddleWaiting };
