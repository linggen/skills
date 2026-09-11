// The player's state and the arithmetic over it. Pure: no files, no clock —
// the caller passes `now`.

export const STATE_VERSION = 1;

export function firstChapter(content) {
  return Object.values(content.chapters).sort((a, b) => a.id.localeCompare(b.id))[0];
}

export function newState(content, lang, now) {
  const first = firstChapter(content);
  const at = now.toISOString();
  return {
    version: STATE_VERSION, lang: lang === 'en' ? 'en' : 'zh',
    daohao: null, root: null,
    realm: 'qi', stage: 0, xw: 0, ls: 0,
    bag: {}, beasts: [],
    chapter: first.id, scene: first.first_scene, done_scenes: [], ended: [],
    tasks: {}, quests: {}, wins: {}, branch: null, story: '',
    day: { key: dayKey(now), xw: 0, ls: 0, branches: 0 },
    created: at, updated: at,
  };
}

/* ── Words ── */

export const pick = (pair, lang) => (pair ? pair[lang] ?? pair.zh : null);
export const fill = (text, state) => (text == null ? text : text.replaceAll('{daohao}', state.daohao ?? ''));

/* Lowercase, drop punctuation and articles: "An egg!" and "egg" meet. */
export function normalizeAnswer(answer) {
  return String(answer ?? '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, ' ')
    .trim()
    .replace(/^(an?|the) /, '');
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
  if (state.day?.key !== key) state.day = { key, xw: 0, ls: 0, branches: 0 };
}

/* ── Realms ── */

export const realmOf = (content, id) => content.realms.realms.find(r => r.id === id);

export function threshold(content, state) {
  return realmOf(content, state.realm).thresholds[state.stage];
}

export function stageName(content, realmId, stage, lang) {
  const realm = realmOf(content, realmId);
  const name = pick(realm.name, lang), step = realm.stages[lang][stage];
  return lang === 'zh' ? `${name}${step}` : `${name} · ${step}`;
}

export function speedOf(content, state) {
  return content.roots.speed[String(state.root?.length ?? 4)] ?? 1;
}

/* Add 修为; rise through the realm's stages; hold at its peak, where only the
   next realm's chapter can take the player on. */
export function addXw(content, state, amount) {
  const levels = [];
  let hold = null;
  state.xw += amount;
  for (;;) {
    const need = threshold(content, state);
    if (state.xw < need) break;
    const realm = realmOf(content, state.realm);
    if (state.stage < realm.thresholds.length - 1) {
      state.xw -= need;
      levels.push({ from: { realm: state.realm, stage: state.stage }, to: { realm: state.realm, stage: state.stage + 1 } });
      state.stage += 1;
      continue;
    }
    state.xw = need;
    const realms = content.realms.realms;
    const next = realms[realms.indexOf(realm) + 1];
    hold = { gate: next?.gate ?? null };
    break;
  }
  return { levels, hold };
}
