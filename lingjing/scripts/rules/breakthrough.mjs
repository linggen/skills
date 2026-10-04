// rules/breakthrough.mjs — 渡劫: a realm's breakthrough is ONE throw that can fail.
// Part of the rules engine; rules.mjs is its one door.
//
// Hanli, 2026-09-28 (红检, "you pick"): at the peak and at the right cauldron
// the breath no longer always takes. Before the throw the page's card shows
// the chance and what feeds it; the throw is the rules' — seeded like every
// die here (the save's start, its name, the realm and the try), so a reload,
// an Undo and a replay land the same way, and a better-prepared try is the
// only way to change it. Ling hears the result and tells the 雷劫; she never
// decides it. Every number is in ladder.json `breakthrough`.
//
// A failure wounds (伤势 is 体力 since redesign-v2 § 四), takes a share of the
// peak step's 修为 and shuts the cauldron for real hours. The realm, the save
// and every other thing held are never lost — the pill carried included: it
// is eaten only by a throw that lands (the card's promise, 「境界与所藏不失」;
// live 2026-10-01 a failed throw ate the one 九转 and the next try had less).
import { pick, settleStamina, staminaLimited, threshold, seedOf } from '../state.mjs';
import { herAwake, herGifts } from './companion.mjs';
import { itemOf } from './errands.mjs';
import { strongRoots } from './roots.mjs';
import { hashOf } from './travel.mjs';

const HOUR = 3600_000;
export const RULE = content => content.ladder.breakthrough ?? null;

/* 相生: what each element feeds. */
const FEEDS = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };

/* The pill that steadies the throw into `tier`: its own, else the rule's `*`. */
const pillFor = (rule, tier) => rule.pill?.items?.[tier] ?? rule.pill?.items?.['*'] ?? null;

/* What a pill adds to the throw: its own `bonus_of`, else by its 转 (items.json
   `zhuan` — the sect's 一转 a little, the furnace's 九转 near-certain), else `bonus`. */
export function pillBonus(content, rule, id) {
  const own = rule.pill.bonus_of?.[id];
  if (own != null) return own;
  const zhuan = id ? itemOf(content, id)?.zhuan : null;
  return (zhuan && rule.pill.by_zhuan?.[zhuan]) ?? rule.pill.bonus;
}

/* Out of a 闭关 long enough, recently enough. */
function secludedLately(content, state, rule, now) {
  const last = state.last_seclusion, min = content.rewards.seclusion?.min_hours ?? 0;
  if (!last?.at || !(last.hours >= min)) return false;
  const since = now - new Date(last.at);
  return since >= 0 && since <= rule.seclusion.hours * HOUR;
}

/* Each factor, one row: its id, what it adds now and whether it holds. A new
   factor is a row here, never another branch. */
const FACTORS = {
  pill: (content, state, rule, x) => {
    // A list names the pills in the order they are reached for: the furnace's
    // 九转 before the sect's 一转 (古九: he eats the 九转; the 官丹 stays in 饭桶).
    const ids = [].concat(pillFor(rule, x.to) ?? []);
    const id = ids.find(i => state.bag?.[i] > 0) ?? ids[0] ?? null, held = Boolean(id && state.bag?.[id] > 0);
    const bonus = pillBonus(content, rule, id);
    return { n: held ? bonus : 0, on: held, bonus, item: id ? { id, name: pick(itemOf(content, id)?.name, state.lang) ?? id } : null };
  },
  body: (content, state, rule, x) => {
    const whole = x.stamina >= Math.ceil(content.rewards.stamina.max * rule.body.share);
    return { n: whole ? rule.body.whole : rule.body.hurt, on: whole };
  },
  seclusion: (content, state, rule, x) => {
    const on = secludedLately(content, state, rule, x.now);
    return { n: on ? rule.seclusion.bonus : 0, on, bonus: rule.seclusion.bonus, hours: rule.seclusion.hours };
  },
  her: (content, state, rule) => {
    // Before she is found she is not in the game at all — not even as a row (SKILL.md § Yinyue).
    if (!herAwake(state)) return null;
    const gifts = herGifts(content, state).length;
    return { n: rule.her.joined + gifts * rule.her.per_gift, on: true, gifts };
  },
  element: (content, state, rule, x) => {
    // Five weak roots count through the one that leads (roots.mjs strongRoots).
    const want = rule.element.of?.[x.to], roots = strongRoots(state);
    const how = !want ? null : roots.includes(want) ? 'match' : roots.some(r => FEEDS[r] === want) ? 'feeds' : null;
    const el = want ? { id: want, name: pick(content.traits?.elements?.[want], state.lang) ?? want } : null;
    return { n: how ? rule.element[how] : 0, on: Boolean(how), how, element: el, ...(how === 'feeds' ? { root: roots.find(r => FEEDS[r] === want) } : {}) };
  },
};

/* The chance of the throw into the next realm, as the card shows it and the
   throw uses it: `base` for the realm, each factor's `n`, held between `floor`
   and `cap`. The 体力 read is the clock's (settled on a copy). Null: no rule
   in this world — the breath always takes, as before 2026-09-28. */
export function oddsOf(content, state, now, to) {
  const rule = RULE(content);
  if (!rule || !to) return null;
  const pool = { stamina: state.stamina, stamina_at: state.stamina_at };
  settleStamina(content, pool, now);
  const x = { to, now, stamina: pool.stamina };
  const base = rule.base?.[to] ?? rule.floor;
  const parts = Object.entries(FACTORS).map(([id, f]) => [id, f(content, state, rule, x)]).filter(([, p]) => p).map(([id, p]) => ({ id, ...p }));
  const raw = base + parts.reduce((n, p) => n + p.n, 0);
  const chance = Math.max(rule.floor, Math.min(rule.cap, raw));
  // What a failure would cost, as it would land — the card says it before the throw.
  const risk = { stamina: Math.ceil(content.rewards.stamina.max * rule.fail.wound), progress: Math.round(threshold(content, state) * rule.fail.progress), hours: rule.fail.cooldown_hours };
  const name = pick(content.ladder.tiers.find(t => t.id === to)?.name, state.lang) ?? to;
  return { to: { id: to, name }, chance, base, raw, floor: rule.floor, cap: rule.cap, low: chance < rule.low, parts, risk };
}

/* The cauldron shut after a failed throw: when it opens again, or null. */
export function coolingUntil(state, now) {
  const until = state.breakthrough?.until;
  return until && new Date(until) > now ? until : null;
}

/* The die for this try: 0–99, the same for the same save, realm and try. */
export const rollOf = (state, to) => hashOf(`${seedOf(state)}|breakthrough|${to}|${state.breakthrough?.tries?.[to] ?? 0}`) % 100;

/* What a failure costs, on the state in hand: the wound (a share of the 体力
   pool), a share of the peak step's 修为, and the hours the cauldron is shut. */
function fail(content, s, rule, now) {
  const need = threshold(content, s);
  const stamina = staminaLimited(content) ? Math.min(s.stamina, Math.ceil(content.rewards.stamina.max * rule.fail.wound)) : 0;
  s.stamina -= stamina;
  if (s.stamina === 0) s.resting = true;
  const progress = Math.min(s.progress, Math.round(need * rule.fail.progress));
  s.progress -= progress;
  const until = new Date(now.getTime() + rule.fail.cooldown_hours * HOUR).toISOString();
  return { lost: { stamina, progress }, until };
}

/* The throw, on the state in hand (its 体力 for this step already paid):
   `odds` as the card showed them. The pill carried is spent only when the
   throw lands; the try is counted, so the next one is a new die. Written down as `last` for
   the page's seal. Returns what happened; the caller moves the realm. */
export function throwOn(content, s, odds, to, now) {
  const rule = RULE(content);
  const roll = rollOf(s, to), success = roll < odds.chance;
  const pill = odds.parts.find(p => p.id === 'pill');
  if (pill?.on && success) { s.bag[pill.item.id] -= 1; if (s.bag[pill.item.id] <= 0) delete s.bag[pill.item.id]; }
  const tries = { ...s.breakthrough?.tries, [to]: (s.breakthrough?.tries?.[to] ?? 0) + 1 };
  const failed = success ? null : fail(content, s, rule, now);
  s.breakthrough = {
    tries, ...(failed ? { until: failed.until } : {}),
    last: { to, chance: odds.chance, success, at: now.toISOString() },
  };
  return {
    success, chance: odds.chance, low: odds.low, ...(pill?.on ? { pill: success ? pill.item : { ...pill.item, kept: true } } : {}),
    ...(failed ? { lost: failed.lost, again_at: failed.until } : {}),
  };
}

/* The last throw, for the page's seal and Ling's telling — fresh for an hour. */
export function lastThrow(state, now) {
  const last = state.breakthrough?.last;
  return last && now - new Date(last.at) <= HOUR ? last : null;
}
