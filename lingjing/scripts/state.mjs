// The player's state and the arithmetic over it. Pure: no files, no clock —
// the caller passes `now`.

export const STATE_VERSION = 5;
export const FIRST_WORLD = 'jiuding'; // the world every save before worlds was playing

export function firstChapter(content) {
  return Object.values(content.chapters).sort((a, b) => a.id.localeCompare(b.id))[0];
}

export function newState(content, lang, now) {
  const first = firstChapter(content);
  const at = now.toISOString();
  return {
    version: STATE_VERSION, world: content.world.id, lang: lang === 'en' ? 'en' : 'zh',
    name: null, traits: null,
    tier: content.ladder.tiers[0].id, step: 0, progress: 0, wealth: 0,
    bag: {}, cast: [], wear: {}, duels: {}, arts: [],
    chapter: first.id, scene: first.first_scene, done_scenes: [], ended: [],
    place: first.scenes[first.first_scene]?.at ?? content.places[first.province]?.start ?? null,
    tasks: {}, chores: {}, quests: {}, wins: {}, story: '', seeds_used: [],
    made: { scenes: {}, at: null },
    day: { key: dayKey(now), progress: 0, wealth: 0 },
    stamina: content.rewards.stamina.max, stamina_at: at,
    created: at, updated: at,
  };
}

/* ── Words ── */

export const pick = (pair, lang) => (pair ? pair[lang] ?? pair.zh ?? pair.en : null);
export const fill = (text, state) => (text == null ? text : text.replaceAll('{name}', state.name ?? ''));

/* Lowercase, drop punctuation and articles: "An egg!" and "egg" meet. */
export function normalizeAnswer(answer) {
  return String(answer ?? '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, ' ')
    .trim()
    .replace(/^(an?|the) /, '');
}

/* The language of what the player typed: Chinese characters → zh, an English
   word and no Chinese → en, anything else (an emoji, a number, a page's
   `[scene]` report) → null, which changes nothing. */
export function langOf(said) {
  const text = String(said ?? '').trim();
  // A bracketed tag opens a machine's line, never the player's: the page's
  // reports reach Ling as `[HIDDEN] [scene] won …`, and each one read as
  // English flipped his Chinese game three times in a day (2026-09-23).
  if (!text || text.startsWith('[')) return null;
  if (/\p{Script=Han}/u.test(text)) return 'zh';
  if (/[A-Za-z]{2,}/.test(text)) return 'en';
  return null;
}

/* ── Time: local days, ISO weeks ── */

const pad = n => String(n).padStart(2, '0');

export function dayKey(now) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/* ISO week of the local date: the week's Thursday names its year. */
export function weekKey(now) {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 864e5 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}

export function periodKey(period, now) {
  if (period === 'day') return dayKey(now);
  if (period === 'week') return weekKey(now);
  return 'once';
}

export function periodStart(period, now) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (period === 'once') return new Date(0);
  return d;
}

/* The day's totals roll over at local midnight. */
export function rollDay(state, now) {
  const key = dayKey(now);
  if (state.day?.key !== key) state.day = { key, progress: 0, wealth: 0 };
}

/* ── Stamina: the pace ── */

const secsPerPoint = q => (q.refill_hours * 3600) / q.max;

/* Refill by the clock since it was last settled — whole points only, the
   remainder keeps waiting in `qi_at`. A save from before 灵气 wakes full. */
export function settleStamina(content, state, now) {
  const q = content.rewards.stamina;
  if (state.stamina == null || !state.stamina_at) { state.stamina = q.max; state.stamina_at = now.toISOString(); return; }
  // A pool or a clock that is not a number (a hand-edited save, a bad write)
  // starts counting again from now, and never becomes NaN (review, 2026-09-24).
  if (!Number.isFinite(state.stamina)) state.stamina = q.max;
  if (Number.isNaN(Date.parse(state.stamina_at))) state.stamina_at = now.toISOString();
  if (state.stamina >= q.max) { state.stamina = q.max; state.stamina_at = now.toISOString(); return; }
  const gained = Math.floor(Math.max(0, now - new Date(state.stamina_at)) / 1000 / secsPerPoint(q));
  if (gained <= 0) return;
  state.stamina = Math.min(q.max, state.stamina + gained);
  state.stamina_at = state.stamina >= q.max
    ? now.toISOString()
    : new Date(new Date(state.stamina_at).getTime() + gained * secsPerPoint(q) * 1000).toISOString();
}

/* When the pool will hold `cost` again, at the refill rate. */
export function staminaReturnsAt(content, state, cost) {
  const q = content.rewards.stamina;
  const missing = Math.max(0, cost - state.stamina);
  return new Date(new Date(state.stamina_at).getTime() + missing * secsPerPoint(q) * 1000);
}

/* A refill from real life — never over the top. */
export function addStamina(content, state, n, now) {
  const q = content.rewards.stamina;
  const before = state.stamina;
  state.stamina = Math.min(q.max, state.stamina + Math.max(0, n));
  if (state.stamina >= q.max) state.stamina_at = now.toISOString();
  return state.stamina - before;
}

/* ── The ladder: tiers and their steps ── */

export const tierOf = (content, id) => content.ladder.tiers.find(t => t.id === id);

export function threshold(content, state) {
  return tierOf(content, state.tier).thresholds[state.step];
}

export function stepName(content, tierId, step, lang) {
  const tier = tierOf(content, tierId);
  const name = pick(tier.name, lang), s = tier.steps[lang][step];
  return lang === 'zh' ? `${name}${s}` : `${name} · ${s}`;
}

export function speedOf(content, state) {
  return content.traits.speed[String(state.traits?.length ?? 4)] ?? 1;
}

/* The tier's reward multiplier: tables and caps are base progress; a task
   high on the ladder pays like one. Applied last. */
export function payOf(content, state) {
  return tierOf(content, state.tier).pay ?? 1;
}

/* Add progress; rise through the tier's steps; hold at its peak, where only
   the next tier's chapter can take the player on. */
export function addProgress(content, state, amount) {
  const levels = [];
  let hold = null;
  state.progress += amount;
  for (;;) {
    const need = threshold(content, state);
    if (state.progress < need) break;
    const tier = tierOf(content, state.tier);
    if (state.step < tier.thresholds.length - 1) {
      state.progress -= need;
      levels.push({ from: { tier: state.tier, step: state.step }, to: { tier: state.tier, step: state.step + 1 } });
      state.step += 1;
      continue;
    }
    // The peak takes no more: what would overflow is `held` back, so the
    // caller can report only what was really added.
    const held = state.progress - need;
    state.progress = need;
    const tiers = content.ladder.tiers;
    const next = tiers[tiers.indexOf(tier) + 1];
    hold = { gate: next?.gate ?? null, held };
    break;
  }
  return { levels, hold };
}

/* Older saves, one step per version, in order (a table, never a chain of
   ifs): each step takes the save as the version before left it. Given the
   world, the save is also fitted to it (fitWorld). */
const move = (m, from, to) => { if (from in m) { m[to] = m[from]; delete m[from]; } };
const MIGRATIONS = [
  // v1–v4: version 1 used the world's words as keys; version 2 had no
  // `world` — it was always 《九鼎》; v4: 'quests' was the record of the apps'
  // 功课 being paid, and the word now belongs to 差事 (design.md § 差事).
  [4, m => {
    for (const [from, to] of [['daohao', 'name'], ['root', 'traits'], ['realm', 'tier'], ['stage', 'step'], ['xw', 'progress'], ['ls', 'wealth'], ['beasts', 'cast'], ['qi', 'stamina'], ['qi_at', 'stamina_at']]) move(m, from, to);
    if (m.day) m.day = { key: m.day.key, progress: m.day.xw ?? m.day.progress ?? 0, wealth: m.day.ls ?? m.day.wealth ?? 0 };
    m.world ??= FIRST_WORLD;
    m.place ??= null; // settled by the rules from the scene, or the province's start
    m.wear ??= {};
    m.duels ??= {};
    m.arts ??= [];
    move(m, 'quests', 'chores');
    m.chores ??= {};
    m.quests ??= {};
  }],
  // v5 (redesign-v2 § 四, 2026-09-24): 伤势, 羁绊, 历练 and the daily 温养 are
  // cut. What the player HOLDS stays — the bag, the cards, the treasure and its
  // 重; what only those systems read goes: the wound (a loss now only sends
  // the beast away for the day), the bond's count and marks, her journey (a
  // journey still out ends where it is: she is simply back at the player's
  // side, bringing nothing — never lost on the road), the day's 温养 and 写符
  // marks, and the treasure's 温养 exp toward the next 重.
  [5, m => {
    for (const k of ['wounds', 'bond', 'tended', 'journey']) delete m[k];
    if (m.day) { delete m.day.nourished; delete m.day.written; }
    if (m.treasure) { const { exp, ...t } = m.treasure; m.treasure = t; }
  }],
];

export function migrate(state, content = null) {
  if (!state) return state;
  const from = state.version ?? 1;
  if (from >= STATE_VERSION) return content ? fitWorld(state, content) : state;
  const m = structuredClone(state);
  for (const [to, step] of MIGRATIONS) if (from < to) step(m);
  m.version = STATE_VERSION;
  return content ? fitWorld(m, content) : m;
}

/* A save whose ids the world no longer has — a tier, a chapter, a scene, a
   place or a beast renamed since it was written — is fitted back to the
   world's defaults rather than crash every Look (review, 2026-09-24). A
   save that fits comes back as it was. */
export function fitWorld(saved, content) {
  // 奇遇 (Branch) went 2026-09-24 for 今日传闻: an open one is closed quietly, unpaid.
  const { branch, ...rest } = saved;
  const state = 'branch' in saved ? rest : saved;
  const tier = tierOf(content, state.tier);
  const chapter = content.chapters[state.chapter];
  const scene = chapter && state.scene != null ? chapter.scenes[state.scene] : null;
  const place = state.place != null && Object.values(content.places).some(d => d.places.some(p => p.id === state.place));
  const beasts = new Set(content.creatures.creatures.map(c => c.id));
  const fix = {
    ...(!tier ? { tier: content.ladder.tiers[0].id, step: 0, progress: 0 } : {}),
    ...(tier && !(state.step < tier.thresholds.length) ? { step: tier.thresholds.length - 1 } : {}),
    ...(!chapter ? { chapter: firstChapter(content).id, scene: firstChapter(content).first_scene } : {}),
    ...(chapter && state.scene != null && !scene ? { scene: state.ended?.includes(chapter.id) ? null : chapter.first_scene } : {}),
    // Unknown, the place is settled by the rules from the scene or the province's start.
    ...(state.place != null && !place ? { place: null } : {}),
    ...((state.cast ?? []).some(id => !beasts.has(id)) ? { cast: state.cast.filter(id => beasts.has(id)) } : {}),
  };
  return Object.keys(fix).length ? { ...state, ...fix } : state;
}
