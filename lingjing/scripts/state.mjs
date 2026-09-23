// The player's state and the arithmetic over it. Pure: no files, no clock —
// the caller passes `now`.

export const STATE_VERSION = 4;
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
    tasks: {}, chores: {}, quests: {}, wins: {}, branch: null, story: '', seeds_used: [],
    made: { scenes: {}, at: null },
    day: { key: dayKey(now), progress: 0, wealth: 0, branches: 0 },
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
  if (state.day?.key !== key) state.day = { key, progress: 0, wealth: 0, branches: 0 };
}

/* ── Stamina: the pace ── */

const secsPerPoint = q => (q.refill_hours * 3600) / q.max;

/* Refill by the clock since it was last settled — whole points only, the
   remainder keeps waiting in `qi_at`. A save from before 灵气 wakes full. */
export function settleStamina(content, state, now) {
  const q = content.rewards.stamina;
  if (state.stamina == null || !state.stamina_at) { state.stamina = q.max; state.stamina_at = now.toISOString(); return; }
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
   high on the ladder pays like one. Applied last, after the day cap. */
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

/* Older saves: version 1 used the world's words as keys; version 2 had no
   `world` — it was always 《九鼎》. */
export function migrate(state) {
  if (!state || (state.version ?? 1) >= STATE_VERSION) return state;
  const m = { ...state, version: STATE_VERSION };
  const move = (from, to) => { if (from in m) { m[to] = m[from]; delete m[from]; } };
  move('daohao', 'name'); move('root', 'traits'); move('realm', 'tier'); move('stage', 'step');
  move('xw', 'progress'); move('ls', 'wealth'); move('beasts', 'cast'); move('qi', 'stamina'); move('qi_at', 'stamina_at');
  if (m.day) m.day = { key: m.day.key, progress: m.day.xw ?? m.day.progress ?? 0, wealth: m.day.ls ?? m.day.wealth ?? 0, branches: m.day.branches ?? 0 };
  m.world ??= FIRST_WORLD;
  m.place ??= null; // settled by the rules from the scene, or the province's start
  m.wear ??= {};
  m.duels ??= {};
  m.arts ??= [];
  // v4: 'quests' was the record of the apps' 功课 being paid; the word now
  // belongs to 差事, the errands the player takes (design.md § 差事).
  move('quests', 'chores');
  m.chores ??= {};
  m.quests ??= {};
  return m;
}
