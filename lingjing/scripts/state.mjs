// The player's state and the arithmetic over it. Pure: no files, no clock —
// the caller passes `now`.

export const STATE_VERSION = 15;
export const FIRST_WORLD = 'jiuding'; // the world every save before worlds was playing

export function firstChapter(content) {
  return Object.values(content.chapters).sort((a, b) => a.id.localeCompare(b.id))[0];
}

/* The hero the world fixes (people.json `hero`, 2026-09-30: 沈小满, a boy) —
   the save's `name` (its 中文) and `gender`; null in a world that names none. */
export const heroOf = content => {
  const h = content?.people?.hero;
  return h ? { name: h.name?.zh ?? h.name?.en ?? null, gender: h.gender === 'female' ? 'female' : 'male' } : null;
};

/* What a save's daily draws are seeded by (deck order, riddles, notices, 传闻,
   road meets, 论道 …). It was the save's name; with the hero fixed
   (2026-09-30) every save has the same name, so each save carries its own
   `seed`: a new save's creation time; an old save, once, the name it was
   given on the old name card (its draws stay what they were), else its
   creation time. Same save + same day → same draws. */
export const seedOf = s => String(s?.seed ?? s?.created ?? '');

export function newState(content, lang, now) {
  const first = firstChapter(content);
  const at = now.toISOString();
  const hero = heroOf(content);
  return {
    version: STATE_VERSION, world: content.world.id, lang: lang === 'en' ? 'en' : 'zh',
    name: hero?.name ?? null, gender: hero?.gender ?? null, traits: null,
    tier: content.ladder.tiers[0].id, step: 0, progress: 0, wealth: 0,
    // Each other line's own 修为 (rules/lines.mjs), from zero: 今 at 新生一层 · 0.
    ...linesStart(content),
    bag: {}, cast: [], wear: {}, duels: {}, arts: [],
    chapter: first.id, scene: first.first_scene, done_scenes: [], ended: [],
    place: first.scenes[first.first_scene]?.at ?? content.places[first.province]?.start ?? null,
    // The first scene's boards are offered as any scene's are on entry (core.mjs offerTasks; 接雨, 2026-10-14).
    tasks: Object.fromEntries((first.scenes[first.first_scene]?.offers?.tasks ?? []).map(id => [id, { status: 'offered' }])),
    chores: {}, quests: {}, wins: {}, story: '', seeds_used: [],
    made: { scenes: {}, at: null },
    day: { key: dayKey(now), progress: 0, wealth: 0 },
    stamina: content.rewards.stamina.max, stamina_at: at,
    created: at, updated: at, seed: at,
  };
}

/* ── Story gates: what a chapter keeps shut until the story gets there ──

   His ruling (2026-09-28): 「修行是遇见yinyue, 加入宗门开始的, 先不要出现开府
   任务, 增长修为等. 先走剧情.」 A chapter declares it (chapter.json `locks`):
   the systems it keeps shut, and the scene that opens them (`until`) — shut on
   every scene before it, open on it and on every scene it leads to, and once
   the chapter is ended or left. The engine names no scene: the content does.
   Several gates (Hanli, 2026-10-22: 开府 opens on meeting 银月, the rest on
   入门): `locks` is a list of {until, systems, say}; what is shut is the union
   of the gates not yet opened. One object (the old shape) reads as a list of one. */
export const LOCKABLE = {
  cultivation: '境界 and 修为: the realm, the bar, any 修为 gained, the scroll\'s daily 功课',
  wealth: '灵石: shown, gained, bought and sold with',
  chores: '人间功课: the apps\' real-life chores',
  kaifu: '开府: the Linggen setup milestones',
  divine: '问卦: the day\'s coins, their chip and card',
  errands: '差事, 榜文 and 今日传闻: the book and its 事 chip',
  road: '路上 and 机缘: what the road meets',
  seclusion: '闭关',
};
const NONE = Object.freeze([]);
const openFrom = new WeakMap();
/* The scenes a gate scene leads to, itself included (its exits' `next`, followed). */
function opened(chapter, until) {
  if (!openFrom.has(chapter)) openFrom.set(chapter, new Map());
  const memo = openFrom.get(chapter);
  if (memo.has(until)) return memo.get(until);
  const seen = new Set(), todo = [until];
  while (todo.length) {
    const id = todo.pop();
    if (seen.has(id) || !chapter.scenes[id]) continue;
    seen.add(id);
    for (const e of chapter.scenes[id].exits ?? []) if (e.next) todo.push(e.next);
  }
  memo.set(until, seen);
  return seen;
}
/* A chapter's gates as a list — `locks` an object (one gate) or an array. */
export const gatesOf = chapter => {
  const lock = chapter?.locks;
  return !lock ? [] : (Array.isArray(lock) ? lock : [lock]).filter(g => g && typeof g === 'object');
};
/* The gates still shut for this save — none past its chapter's last gate. */
export function shutGates(content, state) {
  const chapter = content?.chapters?.[state?.chapter], gates = gatesOf(chapter);
  if (!gates.length || !state.scene || (state.ended ?? []).includes(chapter.id)) return NONE;
  return gates.filter(g => !opened(chapter, g.until).has(state.scene));
}
/* The systems shut for this save right now — [] for every save past its chapter's gates. */
export function lockedOf(content, state) {
  const shut = shutGates(content, state);
  if (!shut.length) return NONE;
  return shut.length === 1 ? shut[0].systems ?? NONE : [...new Set(shut.flatMap(g => g.systems ?? []))];
}
/* The refusal line of the gate that keeps `system` shut here. */
export const lockSay = (content, state, system) => shutGates(content, state).find(g => (g.systems ?? []).includes(system))?.say ?? null;
/* A save before the gate holds none of what the gate keeps: an old save that
   began the rewritten prologue again carried 修为 and 灵石 from before (his
   live save, 2026-09-28: 练气一层 40/50, 灵石 20 at 石坳村). They go, and
   the gate opens on 练气一层 at 0; the bag, the cards and the book stay. */
export function lockReset(content, state) {
  const shut = lockedOf(content, state), fix = {};
  const first = content.ladder.tiers[0].id;
  if (shut.includes('cultivation') && (state.tier !== first || state.step || state.progress)) Object.assign(fix, { tier: first, step: 0, progress: 0 });
  if (shut.includes('wealth') && state.wealth) fix.wealth = 0;
  if ((fix.progress === 0 || fix.wealth === 0) && state.day) fix.day = { ...state.day, ...(fix.progress === 0 ? { progress: 0 } : {}), ...(fix.wealth === 0 ? { wealth: 0 } : {}) };
  // …save a 闭关 taken on a spent pool (`spent`): the one way back to 体力 is open behind every gate.
  if (shut.includes('seclusion') && state.seclusion && !state.seclusion.spent) fix.seclusion = undefined;
  return fix;
}

/* ── Words ── */

export const pick = (pair, lang) => (pair ? pair[lang] ?? pair.zh ?? pair.en : null);

/* A thing's name for this player: one the story let them give it (items.json
   `named`: the save field that holds it — 小铜炉 · 饭桶) stands after its own. */
export const itemName = (item, state, lang) => {
  const own = item?.named ? state?.[item.named] : null;
  const base = pick(item?.name, lang);
  return base && own ? `${base} · ${own}` : base;
};

/* The hero's gender as the save holds it — `female`, `male`, or `none` for a
   save that never said. Fixed by the world since 2026-09-30 (heroOf). */
export const genderOf = state => (state?.gender === 'female' || state?.gender === 'male' ? state.gender : 'none');

/* A slot's person — `ban`, the close companion (people.json `slots`: a
   person id; an older world's {female, male, none} by gender still reads);
   a person id stands for itself. */
export function personOf(content, state, who) {
  const slot = content?.people?.slots?.[who];
  const id = typeof slot === 'string' ? slot : slot ? slot[genderOf(state)] ?? slot.none : who;
  return content?.people?.people?.find(p => p.id === id) ?? null;
}

/* Scene text as the player reads it: {name}; and, given the world, {兄姐} (how
   the temple addresses them, by gender) and every other people.json `address`
   word (the companion's unnamed cameos), {伴} (the companion's name) and
   {灵根} (the roots, by how many) and {主亮} (the stone's brightest colour, the
   root that leads — a sentence, or nothing), and the 恩仇簿's {恩人} · {仇人}
   and their {…·said} (ledgerWords). A word that comes out empty takes
   one space beside it along, so an English line never shows a double space. */
/* The 恩仇簿 in a scene's words (哇时刻 5): {恩人} the one the player owes
   most kindness, {仇人} the one who wronged them most (ties: the first
   written), and {恩人·said} / {仇人·said} the player's own last words kept
   with them, in their quote marks — each empty, and so gone, when the 簿 has none. */
function ledgerWords(content, state, lang) {
  const rows = state?.ledger ?? [];
  const top = kind => {
    const n = new Map();
    for (const e of rows) if (e.kind === kind) n.set(e.who, (n.get(e.who) ?? 0) + 1);
    return [...n].reduce((best, x) => (!best || x[1] > best[1] ? x : best), null)?.[0] ?? null;
  };
  const nameOf = who => (who ? pick(personOf(content, state, who)?.name ?? content.creatures?.creatures?.find(c => c.id === who)?.name, lang) ?? '' : '');
  // The quote comes in its own marks, so a 簿 without one leaves no empty 「」 behind.
  const said = who => (who ? rows.filter(e => e.who === who && e.said).at(-1)?.said : null);
  const saidTo = who => (said(who) ? (lang === 'en' ? `"${said(who)}"` : `「${said(who)}」`) : '');
  const en = top('恩'), chou = top('仇');
  return { '{恩人}': nameOf(en), '{恩人·said}': saidTo(en), '{仇人}': nameOf(chou), '{仇人·said}': saidTo(chou) };
}

/* The stone's brightest colour — the root that leads a five-root save — as
   one sentence, or nothing when the five read even. */
function brightest(content, state, lang) {
  const main = state?.traits?.length === 5 ? state.root_main : null, color = main && content.traits?.elements?.[main]?.color;
  if (!color) return '';
  return lang === 'en' ? `Only the ${color.en} is a little brighter than the rest.` : `只有${color.zh}的那一点，比别的亮一些。`;
}

export function fill(text, state, content = null) {
  if (text == null) return text;
  // Nothing to fill — most of the book's lines: handed back as it is (the words below cost a Look dearly).
  if (typeof text === 'string' && !text.includes('{')) return text;
  if (!content) return text.replaceAll('{name}', state?.name ?? '');
  const bare = text.replace(/\{[^}]*\}/g, ''), lang = /\p{Script=Han}/u.test(bare) ? 'zh' : /[A-Za-z]{2,}/.test(bare) ? 'en' : state?.lang ?? 'zh';
  // The world's hero by the text's language (沈小满 · Shen Xiaoman); the save's name in a world that fixes none.
  let out = text.replaceAll('{name}', pick(content.people?.hero?.name, lang) ?? state?.name ?? '');
  const words = {
    '{伴}': pick(personOf(content, state, 'ban')?.name, lang) ?? '',
    // people.json `address`: {兄姐}, and the companion's unnamed cameos ({伴·阶} …) — fixed words; an older world's by gender.
    ...Object.fromEntries(Object.entries(content.people?.address ?? {}).map(([k, v]) => [`{${k}}`, pick(typeof v?.zh === 'string' ? v : v?.[genderOf(state)], lang) ?? ''])),
    '{灵根}': state?.traits?.length ? pick(content.traits.names[String(state.traits.length)], lang) ?? '' : '',
    '{主亮}': brightest(content, state, lang),
    ...ledgerWords(content, state, lang),
  };
  for (const [key, word] of Object.entries(words)) {
    out = word ? out.replaceAll(key, word) : out.replaceAll(` ${key}`, '').replaceAll(`${key} `, '').replaceAll(key, '');
  }
  return out;
}

/* A value the player gives the world (the 名字): trimmed, one to `max`
   characters, no line breaks — or null. The rules' check and the page card's
   confirm button read this one function, so they can never disagree. */
export function fitValue(raw, max) {
  const value = String(raw ?? '').trim();
  const length = [...value].length;
  return length >= 1 && length <= max && !/[\r\n]/.test(value) ? value : null;
}

/* Lowercase, drop punctuation and articles: "An egg!" and "egg" meet. */
export function normalizeAnswer(answer) {
  return String(answer ?? '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, ' ')
    .trim()
    .replace(/^(an?|the) /, '');
}

/* ── Time: local days, ISO weeks, calendar months ── */

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

/* The local calendar month: 2026-10. */
export const monthKey = now => `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

/* A chore's period (any app's quest file): day · week · month · once. */
export const PERIODS = ['day', 'week', 'month', 'once'];
const KEY = { day: dayKey, week: weekKey, month: monthKey };

export function periodKey(period, now) {
  return KEY[period]?.(now) ?? 'once';
}

/* Where the period began, at local midnight: today, the week's Monday, the month's 1st; once is all time. */
export function periodStart(period, now) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (period === 'month') d.setDate(1);
  if (period === 'once') return new Date(0);
  return d;
}

/* The day's totals roll over at local midnight. */
export function rollDay(state, now) {
  const key = dayKey(now);
  if (state.day?.key !== key) state.day = { key, progress: 0, wealth: 0 };
}

/* ── Stamina: the pace ── */

/* Whether 体力 limits play. On (Hanli 2026-11-02: 「你把体力也打开加回来吧」; it was off
   from 2026-10-01 while we tested). `LINGJING_STAMINA_LIMIT=0` turns it off for a run
   (nothing spends it, nothing is refused for it, the pool reads full), and
   `rewards.stamina.limit: false` turns it off anywhere — the one place to change. */
const limitEnv = () => (typeof process === 'undefined' ? undefined : process.env?.LINGJING_STAMINA_LIMIT);
export const staminaLimited = content => content.rewards?.stamina?.limit !== false && limitEnv() !== '0';

/* 体力是控制单次游戏时长的: 1 体力 ≈ 1 分钟 (Hanli 2026-11-02). It comes back in 闭关 only — the real one
   (rules/seclusion.mjs) or time away (`refill.away_min` with no player verb counts as 闭关 for 体力 alone,
   rules.mjs awayFit) — and by the 体力卡; never by the clock while he plays, unless a world declares
   `refill.clock_hours`. One rate for both: the pool's top in `refill.seclusion_hours`, linear on real minutes. */
const refillOf = q => q.refill ?? {};
const HOUR_MS = 3600_000;
/* Milliseconds a point takes: in 闭关 (or away) at the 闭关 rate, else by the clock — null when nothing refills. */
function msPerPoint(q, secluded) {
  const r = refillOf(q), h = secluded ? r.seclusion_hours ?? r.clock_hours : r.clock_hours;
  return Number(h) > 0 ? (h * HOUR_MS) / q.max : null;
}
/* The 闭关 rate, whether or not he is in it now: what the page says a sitting (or time away) would take. */
export const seclusionMsPerPoint = content => msPerPoint(content.rewards.stamina, true);
/* Whether a quest's row may pay 体力 (`refill.quest`: false since Hanli 2026-11-02: 「完成任务不奖励体力」). */
export const questStamina = (content, q) => (refillOf(content.rewards.stamina).quest === false ? 0 : Math.max(0, Number(q?.stamina) || 0));

/* What one act costs (rewards.json stamina.cost): its minutes × `per_minute`. A string names a minute of the
   balance model (balance.json model.minutes; `practice` is the practice board's); `reading` is a scene's own reading
   minutes (`scene` given) at model.chars_per_min, plus the model's `scene`; a number is the act's minutes; `move`
   a trip by its roads ({base, per_road, max}). Whole points, at least 1 for anything that costs. */
const textLen = x => (typeof x === 'string' ? x.length : Array.isArray(x) ? x.reduce((n, y) => n + textLen(y), 0) : x?.zh?.length ?? 0);
export function minutesOf(content, name, scene = null, exit = null) {
  const model = content.balance?.model ?? {}, m = model.minutes ?? {};
  if (name === 'reading') {
    const text = scene ? textLen(scene.story) + textLen(scene.story_after) + textLen(exit?.story) : 0;
    return text / (model.chars_per_min || 450) + (m.scene ?? 1);
  }
  if (name === 'practice') return model.practice?.minutes ?? m.board ?? 0;
  return m[name] ?? 0;
}
export function staminaCost(content, kind, n = 1, scene = null, exit = null) {
  const q = content.rewards.stamina, c = q.cost?.[kind] ?? 0, per = q.per_minute ?? 1;
  const minutes = typeof c === 'string' ? minutesOf(content, c, scene, exit)
    : typeof c === 'object' && c ? Math.min(c.max, c.base + Math.max(0, n - 1) * c.per_road) : c * n;
  return minutes > 0 ? Math.max(1, Math.round(minutes * per)) : 0;
}
/* Every kind's cost as Look hands it (a scene's step at its own minutes is told on the scene). */
export const staminaCosts = content => Object.fromEntries(Object.keys(content.rewards.stamina.cost ?? {}).filter(k => !k.startsWith('_')).map(k => [k, staminaCost(content, k)]));


/* The pool's top: `max`, less what 丹毒 takes (balance.json `dandu`: each turn a pill's furnace left out,
   owed until 闭关 makes it up — rules/dandu.mjs), never more than its `cap`. The refill keeps its rate. */
export function staminaMax(content, state) {
  const q = content.rewards.stamina, D = content.balance?.dandu, turns = Math.max(0, Number(state?.dandu) || 0);
  if (!D || !turns) return q.max;
  return q.max - Math.min(D.cap ?? 0, Math.round(turns * (D.per_turn ?? 0)));
}
/* Where a spent pool wakes (`rest`): never above the pool's top, so 丹毒 never keeps him resting for good. */
export const staminaRest = (content, state) => Math.min(content.rewards.stamina.rest ?? 0, staminaMax(content, state));
/* The pool spent: 0, or resting after 0 until back to `rest` — when 闭关 is open behind every gate (rules/locks.mjs). */
export const poolSpent = (content, state) => staminaLimited(content) && Number.isFinite(state?.stamina)
  && (state.stamina <= 0 || (Boolean(state.resting) && state.stamina < staminaRest(content, state)));

/* Refill since it was last settled — whole points only, the remainder waits in `stamina_at`. In 闭关 at its
   rate from when it began (never before: `stamina_at` may be older); out of it, by the clock only where a world
   declares one — else nothing, and the stamp moves to now. A save from before 灵气 wakes full. */
export function settleStamina(content, state, now) {
  const q = content.rewards.stamina, max = staminaMax(content, state);
  if (!staminaLimited(content)) { state.stamina = max; state.stamina_at = now.toISOString(); delete state.resting; return; }
  if (state.stamina == null || !state.stamina_at) { state.stamina = max; state.stamina_at = now.toISOString(); return; }
  // A pool or a clock that is not a number (a hand-edited save, a bad write)
  // starts counting again from now, and never becomes NaN (review, 2026-09-24).
  if (!Number.isFinite(state.stamina)) state.stamina = max;
  if (Number.isNaN(Date.parse(state.stamina_at))) state.stamina_at = now.toISOString();
  if (state.stamina >= max) { state.stamina = max; state.stamina_at = now.toISOString(); return; }
  const sec = state.seclusion?.since ? new Date(state.seclusion.since) : null;
  const ms = msPerPoint(q, Boolean(sec));
  if (!ms) { state.stamina_at = now.toISOString(); return; }
  const from = Math.max(new Date(state.stamina_at).getTime(), sec && !Number.isNaN(sec.getTime()) ? sec.getTime() : 0);
  const gained = Math.floor(Math.max(0, now.getTime() - from) / ms);
  if (gained <= 0) { if (from > new Date(state.stamina_at).getTime()) state.stamina_at = new Date(from).toISOString(); return; }
  state.stamina = Math.min(max, state.stamina + gained);
  state.stamina_at = state.stamina >= max ? now.toISOString() : new Date(from + gained * ms).toISOString();
}

/* When the pool will hold `cost` again: in 闭关 at its rate from the settled stamp; out of it at the clock's where a
   world has one, else at the 闭关 rate from `now` — what a 闭关 (or time away) begun now would bring. Null when
   nothing would. */
export function staminaReturnsAt(content, state, cost, now = new Date()) {
  const q = content.rewards.stamina, missing = Math.max(0, cost - state.stamina);
  const clock = msPerPoint(q, false), secluded = Boolean(state.seclusion);
  const ms = secluded || !clock ? msPerPoint(q, true) : clock;
  if (!ms) return null;
  const base = secluded || clock ? new Date(state.stamina_at).getTime() : now.getTime();
  return new Date(base + missing * ms);
}

/* Time away (Hanli 2026-11-02: 「如果体力用完, 用户没有点闭关就下线, 我们可以自动给用户闭关吗?」): a gap of
   `refill.away_min` or more since the last player verb (`last_seen`, else the save's `updated`) counts as 闭关
   for 体力 alone — at the 闭关 rate, capped at the top; 修为 and the rest stay a real 闭关's. Never while a real
   one runs (it pays its own); every player verb stamps `last_seen`, so one stretch is never counted twice. On a
   copy, with `away` kept for the page to tell once (its `at`); the same object when nothing is owed. */
export function awayFit(content, state, now) {
  const q = content.rewards.stamina, r = refillOf(q), ms = msPerPoint(q, true);
  if (!state || state.seclusion || !staminaLimited(content) || !ms || !(r.away_min > 0) || msPerPoint(q, false)) return state;
  const seen = Date.parse(state.last_seen ?? state.updated ?? '');
  if (!Number.isFinite(seen) || now.getTime() - seen < r.away_min * 60_000) return state;
  const max = staminaMax(content, state);
  if (!(state.stamina < max)) return state;
  const gained = Math.min(max - state.stamina, Math.floor((now.getTime() - seen) / ms));
  if (gained <= 0) return state;
  const s = { ...state, stamina: state.stamina + gained, stamina_at: now.toISOString() };
  if (s.resting && s.stamina >= staminaRest(content, s)) delete s.resting;
  s.away = { at: now.toISOString(), minutes: Math.round((now.getTime() - seen) / 60_000), gained, now: s.stamina, max };
  return s;
}

/* A refill from real life — never over the top. */
export function addStamina(content, state, n, now) {
  const max = staminaMax(content, state);
  const before = state.stamina;
  state.stamina = Math.min(max, state.stamina + Math.max(0, n));
  if (state.stamina >= max) state.stamina_at = now.toISOString();
  return state.stamina - before;
}

/* ── The ladder: tiers and their steps ── */

export const tierOf = (content, id) => content.ladder.tiers.find(t => t.id === id);

/* Each line its own ladder (ladder.json `lines.<line>.tiers`, rules/lines.mjs): its tiers, and where a save starts on it —
   its first step, nothing in it (Hanli 2026-10-27: each line starts from zero). The book's own line (古) is the save's own
   `tier` · `step` · `progress`, as it always was. */
export const lineTiers = (content, line) => content?.ladder?.lines?.[line]?.tiers ?? null;
export const lineStart = (content, line) => ({ tier: lineTiers(content, line)?.[0]?.id ?? null, step: 0, progress: 0 });
const lineIds = content => Object.keys(content?.ladder?.lines ?? {}).filter(k => !k.startsWith('_') && lineTiers(content, k)?.length);
export const linesStart = content => (lineIds(content).length ? { lines: Object.fromEntries(lineIds(content).map(l => [l, lineStart(content, l)])) } : {});
/* A save's lines fitted to the world: a line it never held starts at zero; a place on a tier the line no longer has starts
   over; a step past the tier's top is its top. The 古 is never touched. Null when it fits. */
function fitLines(content, state) {
  const out = {};
  let changed = false;
  for (const l of lineIds(content)) {
    const held = state.lines?.[l], t = held && lineTiers(content, l).find(x => x.id === held.tier);
    if (!t) { out[l] = lineStart(content, l); changed = true; continue; }
    if (!(held.step >= 0 && held.step < t.thresholds.length) || !Number.isFinite(held.progress)) {
      out[l] = { ...held, step: Math.max(0, Math.min(t.thresholds.length - 1, Number.isInteger(held.step) ? held.step : 0)), progress: Number.isFinite(held.progress) ? held.progress : 0 };
      changed = true; continue;
    }
    out[l] = held;
  }
  return changed ? { lines: { ...state.lines, ...out } } : null;
}

/* What the step asks: the ladder's threshold, plus its stretch — the share of the
   修为 carried in over the last step's full mark (ladder.json `overflow_stretch`,
   Hanli 2026-10-15: a grinder stays only somewhat ahead). `state.stretch` keeps
   it per step ({"qi:2": 50}); a step with none asks the ladder's number. */
export const stretchKey = (tier, step) => `${tier}:${step}`;
export function threshold(content, state) {
  return tierOf(content, state.tier).thresholds[state.step] + (state.stretch?.[stretchKey(state.tier, state.step)] ?? 0);
}

/* Up to (tier, step), the 修为 over the last mark carried in whole; the new step
   asks `overflow_stretch` of it more. From 零层 nothing stretches (it held
   nothing to show). Mutates `state`. */
export function stepUp(content, state, tier, step, carry, stretch = true) {
  const over = Math.max(0, Math.round(carry ?? 0));
  const extra = stretch ? Math.round(over * (content.ladder.overflow_stretch ?? 0)) : 0;
  state.tier = tier; state.step = step; state.progress = over;
  const key = stretchKey(tier, step), kept = { ...(state.stretch ?? {}) };
  if (extra) kept[key] = extra; else delete kept[key];
  if (Object.keys(kept).length) state.stretch = kept; else delete state.stretch;
}

/* A tier that counts from 零层 (ladder.json `zero`; story DESIGN: 主角零层入门):
   its step 0 holds no 修为 — no bar, nothing fills it, and only a story's
   `rise` (古四's 小周天) leaves it. Its layer N is step N; any other tier's
   layer N (筑基小成 = 1) is step N − 1. `rise` and a cap's `layer` are layers. */
export const zeroAt = (content, tierId, step) => Boolean(tierOf(content, tierId)?.zero) && step === 0;
export const layerNo = (content, tierId, step) => step + (tierOf(content, tierId)?.zero ? 0 : 1);
export const stepOfLayer = (content, tierId, layer) => layer - (tierOf(content, tierId)?.zero ? 0 : 1);
/* 修为 counts where the save stands: past 零层 (the header's bar stands from 一层). */
export const cultivating = (content, state) => !zeroAt(content, state.tier, state.step);

/* A realm shown in 段 (ladder.json `display: "stages"`, Hanli approved 2026-11-02: 「9层用于计算, 小, 中, 大成用于显示」 ·
   「筑基以后再分3段UI吧」): nine 层 to count, three 段 to read — 一至三层 小成, 四至六层 中成, 七至九层 大成 (`phases`, ids
   `stage_ids`). `stageOf` is where a step stands in them: the 段 (`index`, `id`, `name`), the 层's place inside it (`at`
   1–3), the 段's first step and its size. Null for a realm that names its 层 (练气) and for a world without phases. */
export const staged = (content, tierId) => tierOf(content, tierId)?.display === 'stages' && Boolean(content.ladder.phases);
export function stageOf(content, tierId, step, lang = 'zh') {
  if (!staged(content, tierId)) return null;
  const tier = tierOf(content, tierId), names = pick(content.ladder.phases, lang), n = names.length;
  const per = Math.ceil(tier.thresholds.length / n), index = Math.min(n - 1, Math.floor(step / per));
  return { index, id: content.ladder.stage_ids?.[index] ?? String(index), name: names[index], at: step - index * per + 1, per, first: index * per, last: index === n - 1 };
}
/* The step as the fight's 气血 counts it (half a point a step, battle.js): in 段, a 层 is a third of the step it was part of
   (the coordinator's call, Hanli delegated 2026-11-02: a realm's 气血 grows as it did on three steps, no hidden buff). */
export function hpStep(content, tierId, step = 0) {
  const g = staged(content, tierId) ? stageOf(content, tierId, step) : null;
  return g ? (step * content.ladder.phases.zh.length) / tierOf(content, tierId).thresholds.length : step;
}
/* The step into a new 段 past its first (四层, 七层): where the 段 trial is thrown (rules/breakthrough.mjs duanPass). */
export const stageDoor = (content, tierId, step) => { const g = step > 0 ? stageOf(content, tierId, step) : null; return Boolean(g && g.at === 1); };

export function stepName(content, tierId, step, lang) {
  const tier = tierOf(content, tierId);
  // In 段: the realm and the 段 (「筑基 · 中成」) — the 层 is the bar's, never a name.
  const g = stageOf(content, tierId, step, lang);
  if (g) return `${pick(tier.name, lang)} · ${g.name}`;
  const name = pick(tier.name, lang), s = tier.steps[lang][step];
  return lang === 'zh' ? `${name}${s}` : `${name} · ${s}`;
}
/* The 层 as the tooltip names it, in a realm shown in 段: 「第四层」, "Layer 4". */
export const layerName = (content, tierId, step, lang) => (lang === 'zh' ? `第${tierOf(content, tierId).steps.zh[step]}` : tierOf(content, tierId).steps.en[step]);

/* The phase a step falls in (ladder.json `phases`, three steps each): 练气四层
   is 练气中成 — the formal word, as a 名册 writes it. A realm of three steps
   (筑基 and above) is its own phases: 筑基中成. Null for a world without phases. */
export function phaseName(content, tierId, step, lang) {
  const tier = tierOf(content, tierId), phases = content.ladder.phases;
  if (!tier || !phases) return null;
  // In 段 the step's name is its phase already (筑基 · 中成).
  if (staged(content, tierId)) return stepName(content, tierId, step, lang);
  // 零层 is before the phases (一至三层 小成): it reads as itself.
  if (zeroAt(content, tierId, step)) return stepName(content, tierId, step, lang);
  const from = tier.zero ? 1 : 0;
  const per = Math.ceil((tier.thresholds.length - from) / pick(phases, lang).length);
  const name = pick(tier.name, lang), p = pick(phases, lang)[Math.floor((step - from) / per)];
  return lang === 'zh' ? `${name}${p}` : `${name} · ${p}`;
}

/* A step filled (ladder.json `full`): its name and the word — 练气二层圆满,
   筑基中成圆满, 筑基大成圆满; nothing more goes in until the next step.
   Without a `full` word, the step's name. */
export function fullName(content, tierId, step, lang) {
  const name = stepName(content, tierId, step, lang), full = content.ladder.full;
  if (!full) return name;
  // In 段 only the 段's last 层 filled is its 圆满 (筑基 · 小成圆满 at 三层); a 层 before it full is the 段 still.
  const g = stageOf(content, tierId, step, lang);
  if (g && g.at < g.per) return name;
  return lang === 'zh' ? `${name}${pick(full, lang)}` : `${name}, ${pick(full, lang)}`;
}

/* The realm's last step filled, short (ladder.json `full`): 筑基圆满, 练气圆满
   — the one state a breakthrough is tried from. Without a `full` word, the
   last step's name. */
export function peakName(content, tierId, lang) {
  const tier = tierOf(content, tierId), full = content.ladder.full;
  if (!full) return stepName(content, tierId, tier.thresholds.length - 1, lang);
  const name = pick(tier.name, lang);
  return lang === 'zh' ? `${name}${pick(full, lang)}` : `${name} · ${pick(full, lang)}`;
}

/* Where the save stands, as the player reads it: the step, and 圆满 when it
   is filled (held at a cap or the realm's top). */
export function realmName(content, state, lang) {
  const tier = tierOf(content, state.tier);
  const filled = tier && !zeroAt(content, state.tier, state.step) && (state.progress ?? 0) >= threshold(content, state);
  return filled ? fullName(content, state.tier, state.step, lang) : stepName(content, state.tier, state.step, lang);
}

export function speedOf(content, state) {
  return content.traits.speed[String(state.traits?.length ?? 4)] ?? 1;
}

/* The tier's reward multiplier: tables and caps are base progress; a task
   high on the ladder pays like one. Applied last. */
export function payOf(content, state) {
  return tierOf(content, state.tier).pay ?? 1;
}

/* 修为 that grows with the layer (Hanli 2026-10-16, option A: higher monsters and practice give
   more): balance.json `layer_pay` — the routine tables it scales (功课, a haunt's or a pool's fight,
   闭关) and, by tier, one multiplier per step. The story's grants are never scaled. 1 elsewhere. */
export function layerPayOf(content, state, table) {
  const lp = content.balance?.layer_pay;
  if (!lp || !(lp.tables ?? []).includes(table)) return 1;
  return lp[state.tier]?.[state.step ?? 0] ?? 1;
}

/* Add progress; rise through the tier's steps, the 修为 over each mark carried
   in (stepUp). Where the next step is shut — the 回's cap (`mayStep`,
   rules/cap.mjs) or the realm's top, which only the next tier's chapter opens —
   the step is full and the 修为 keeps coming past its mark (Hanli, 2026-10-15:
   「230/200」, every hand-in visibly adds; nothing is held back any more). The
   story's rise or the throw carries it on. `hold` says which door is shut and
   how far past the mark he stands (`over`); `held` is 0 — kept for callers. */
export function addProgress(content, state, amount, mayStep = null) {
  const levels = [];
  let hold = null;
  // 零层 takes no 修为: what came is held, and only the 小周天 (a `rise`) leaves it.
  if (zeroAt(content, state.tier, state.step)) return { levels, hold: amount > 0 ? { zero: true, held: amount } : null };
  state.progress += amount;
  for (;;) {
    const need = threshold(content, state);
    if (state.progress < need) break;
    const tier = tierOf(content, state.tier);
    const top = state.step >= tier.thresholds.length - 1;
    if (!top && (!mayStep || mayStep(state.tier, state.step + 1))) {
      levels.push({ from: { tier: state.tier, step: state.step }, to: { tier: state.tier, step: state.step + 1 } });
      stepUp(content, state, state.tier, state.step + 1, state.progress - need);
      continue;
    }
    const tiers = content.ladder.tiers, next = tiers[tiers.indexOf(tier) + 1];
    hold = top ? { gate: next?.gate ?? null, held: 0, over: state.progress - need } : { cap: true, held: 0, over: state.progress - need };
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
  // v6 (2026-10-03, every realm nine 层 — story DESIGN § 道统, 凡人 our
  // standard): past the first tier a realm had three steps. The save is only
  // marked here — the world's ladder is needed to carry it over, so fitWorld
  // does it (threeToNine) the first time the save meets its world.
  [6, m => { m.ladder3 = true; }],
  // v7 (2026-10-09, Hanli: 筑基 and above drop 层 — three steps, 小成 中成
  // 大成): past the first tier a realm had nine 层. Marked, carried by
  // fitWorld (nineToThree). A save older than v6 is already on three steps
  // (the thresholds are the pre-v6 ones again): only its v6 mark is let go.
  [7, m => { if (!m.ladder3) m.ladder9 = true; }],
  // v8 (2026-10-15, Hanli: 零层入门, the 小周天 → 一层): 练气 gained 零层 as its
  // step 0, so every old step k reads one 层 lower. Marked, carried by fitWorld
  // (zeroLayer) — which scenes the save has passed decides it.
  [8, m => { m.ladder_zero = true; }],
  // v9 (2026-10-15, Hanli: 「让游戏修为和故事match」): 练气's 层 ask several times
  // more. Marked, carried by fitWorld (paceLayer): the 层 kept, the bar as full as it was.
  [9, m => { m.ladder_pace = 9; }],
  // v10 (2026-10-16, balance.json, the 阶段任务): 练气's 层 re-derived again. A save marked by v9
  // keeps that older mark (its bar is read against the oldest ladder it was played on).
  [10, m => { m.ladder_pace ??= 10; }],
  // v11 (2026-10-16, Hanli: 「要让玩家去刷经验/修为等. 不要直接跳层」): no story rise, so 练气 re-fit
  // again (balance.json). Its 层 kept, its bar as full as it stood, as v10 (paceLayer).
  [11, m => { m.ladder_pace ??= 11; }],
  // v12 (2026-10-27): 练气's 层 from 二层 were raised for 人间功课's pay, then taken back the same day when every pay
  // became a share of the layer (balance.json `_play_pay`). `thresholds_were["12"]` is the same ladder: a no-op carry.
  [12, m => { m.ladder_pace ??= 12; }],
  // v13 (2026-10-27, 数值系统 phase 2): the 层 numbers come from the master table (balance.json `master`: 练气一层 470, ×1.1 a
  // layer, 筑基 above 练气九层). Every pay is a share of the layer, so only the numbers move: the 层 kept, the bar as full as
  // it stood, the stretch with it (paceLayer; ladder.json `thresholds_were["13"]`, 练气 and 筑基).
  [13, m => { m.ladder_pace ??= 13; }],
  // v14 (2026-10-28, Hanli: 「今线修为可以开始做了」): each line its own 修为. The 古 stays exactly where it stands (the save's
  // own `tier` · `step` · `progress` · `stretch`, untouched: no mark, so paceLayer never runs); 今 starts at zero in `lines.jin`,
  // filled by fitWorld (fitLines) — the line's ladder is the world's.
  [14, m => { m.lines ??= {}; }],
  // v15 (2026-11-02, Hanli approved: 「以后可以仍然按层数算1-3=小成, 4-6=中, 7-9=大」 · 「9层用于计算, 小, 中, 大成用于显示」):
  // every realm past 练气 counts nine 层 again, shown as three 段. Marked, carried by fitWorld (stagesCarry): the old step
  // k is 段 k, the 修为 it held walked through its three 层 (they add up to the old step) — the same point of the 段; every
  // older carry runs first on the three-step ladder it was written for (ladderOf14).
  [15, m => { m.ladder_stages = true; }],
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
const keptTasks = (tasks, chapter) => {
  const offered = new Set(Object.values(chapter.scenes).flatMap(sc => sc.offers?.tasks ?? []));
  return Object.fromEntries(Object.entries(tasks ?? {}).filter(([id, t]) => t.status === 'done' || offered.has(id)));
};
/* A save from the three-step ladder (marked by v6): its old step s became
   层 3s+1…3s+3, whose thresholds sum to the old step's, so the 修为 it held
   walks through them and lands exactly — an old 后期 at its peak is 九层,
   filled. The first tier always had nine and is left as it was; a world whose
   realms have three steps again (2026-10-09) takes the save as it is. */
export function threeToNine(content, saved) {
  const { ladder3, ...s } = saved;
  const tier = tierOf(content, s.tier), th = tier?.thresholds;
  if (!tier || tier === content.ladder.tiers[0] || th.length !== 9 || !(s.step >= 0 && s.step <= 2)) return s;
  let step = s.step * 3, progress = s.progress ?? 0;
  while (step < s.step * 3 + 2 && progress >= th[step]) { progress -= th[step]; step += 1; }
  return { ...s, step, progress };
}

/* A save from the nine-层 ladder (marked by v7, 2026-10-03 → 10-09): past the
   first tier, 层 1–3 are 小成, 4–6 中成, 7–9 大成 — the step is the 层's
   group, and the 修为 of the 层 it had passed in that group (ladder.json
   `layers_were`) is added to what it held: 结丹一层 · 222 is 结丹小成 · 222,
   筑基五层 · 50 is 筑基中成 · 160+50, 筑基九层 filled is 筑基圆满. */
export function nineToThree(content, saved) {
  const { ladder9, ...s } = saved;
  const tier = tierOf(content, s.tier), th = tier?.thresholds, was = content.ladder.layers_were?.[s.tier];
  if (!tier || !was || th.length >= was.length || was.length % th.length || !(s.step >= 0 && s.step < was.length)) return s;
  const per = was.length / th.length, step = Math.floor(s.step / per);
  const passed = was.slice(step * per, s.step).reduce((a, b) => a + b, 0);
  return { ...s, step, progress: Math.min(passed + (s.progress ?? 0), th[step]) };
}

/* A save from before 零层 (marked by v8, 2026-10-15): on the old ladder 练气's
   step k was named (k+1)层, so a save admitted then stood at 一层 from the
   gate and the 小周天's 修为 lifted it to 二层 — one 层 over the book. On the
   new ladder the same k is named k层: the save keeps its step and reads one
   层 lower, except
   - a save that has passed a story rise to 二层 or higher (古四's close, 息壤,
     the years, 腊八): that rise set the 层 by its name and the book agrees, so
     the step moves up one and keeps the name and the 修为 (old thresholds[k]
     is new thresholds[k+1]);
   - a save at step 0 that has passed the 小周天 (the scene that rises to 一层)
     is 一层; one that has not stands at 零层, its 修为 kept unseen for the rise.
   The 修为 held never passes the new step's threshold. A tier without 零层 is
   left as it was. */
const zeroRises = (content, layer) => Object.values(content.chapters).flatMap(ch => Object.values(ch.scenes)
  // `was_rise`: a rise the book had until 2026-10-16 (no story rise since — rules/gates.mjs), kept for this reading.
  .filter(sc => (sc.exits ?? []).some(e => { const r = e.rise ?? e.was_rise; const l = typeof r === 'object' && r ? r.layer : r; return layer(l); }))
  .map(sc => ({ chapter: ch.id, scene: sc.id })));
const passedScene = (s, at) => (s.done_scenes ?? []).includes(at.scene) || (s.ended ?? []).includes(at.chapter) || (s.chapter != null && s.chapter > at.chapter);
export function zeroLayer(content, saved) {
  const { ladder_zero, ...s } = saved;
  const tier = tierOf(content, s.tier), th = tier?.thresholds;
  if (!tier?.zero || !(s.step >= 0 && s.step < th.length)) return s;
  const anchored = zeroRises(content, l => Number.isInteger(l) && l >= 2).some(at => (s.done_scenes ?? []).includes(at.scene));
  const step = anchored ? Math.min(s.step + 1, th.length - 1)
    : s.step > 0 ? s.step
      : zeroRises(content, l => l === 1).some(at => passedScene(s, at)) ? 1 : 0;
  // At 零层 what it held is kept, unseen: the 小周天's rise carries it into 一层 (core.mjs riseTo).
  return { ...s, step, progress: step === 0 ? (s.progress ?? 0) : Math.min(s.progress ?? 0, th[step]) };
}

/* A save from before 练气 was re-derived (marked by v9, 2026-10-15, and v10, 2026-10-16: the mark
   is the version it was older than; ladder.json `thresholds_were` by that version): its 层 is never pulled down, and its bar stands as full
   as it stood — 一层 40/50 is 一层 160/200, 九层圆满 is 九层圆满 still, so a save
   waiting at the cliff can still throw. A tier with no `thresholds_were`, or
   a step that held nothing (零层), is left as it was. */
export function paceLayer(content, saved) {
  const { ladder_pace, ...s } = saved;
  // `thresholds_were` by the version a save was older than (a mark of `true` is v9's, as first written).
  // A tier with no ladder of that version (筑基 and above changed first at v13) reads the oldest it has after it.
  const from = ladder_pace === true ? 9 : ladder_pace, tier = tierOf(content, s.tier), were = tier?.thresholds_were ?? {};
  const ver = Object.keys(were).map(Number).filter(k => k >= from).sort((a, b) => a - b)[0];
  const was = were[ver]?.[s.step], now = tier?.thresholds?.[s.step];
  if (!(was > 0) || !(now > 0)) return s;
  // The bar as full as it stood — past the mark too (230/200 at a cap stays as far past) — and the stretch the step asks
  // on top (stepUp's `stretch`, 修为 carried over the last mark) by the same measure.
  const k = now / was, key = stretchKey(s.tier, s.step), st = s.stretch?.[key];
  return { ...s, progress: Math.round((s.progress ?? 0) * k), ...(st ? { stretch: { ...s.stretch, [key]: Math.round(st * k) } } : {}) };
}

/* The world as a v14 save knew it: every realm shown in 段 on its three steps again (ladder.json `thresholds_were["14"]`,
   named by `phases`), so the carries written before 2026-11-02 read the save on the ladder they were written against. */
export function ladderOf14(content) {
  const three = t => (t.display === 'stages' && t.thresholds_were?.['14'] ? (({ display, ...r }) => ({ ...r, thresholds: [...t.thresholds_were['14']], steps: { ...content.ladder.phases } }))(t) : t);
  return { ...content, ladder: { ...content.ladder, tiers: content.ladder.tiers.map(three) } };
}

/* A save from the three steps (marked by v15, 2026-11-02): in a realm shown in 段 its step k (小成 0, 中成 1, 大成 2) is
   段 k, whose three 层 add up to what the step asked (balance.json `master.lines.gu._need_stages`), so the 修为 it held walks
   through them and lands at the same point of the 段: 筑基小成 · 0 is 一层 · 0, 655 of 1310 is 二层 · 255, 筑基圆满 is
   九层圆满 still (a save waiting at a cliff can throw). The stretch over the step's mark is shared over the 层 by their size,
   so the 段 asks what the step did; the 层 it lands on keeps its share. A realm that names its 层 (练气) is left as it was. */
export function stagesCarry(content, saved) {
  const { ladder_stages, ...s } = saved;
  const tier = tierOf(content, s.tier), was = tier?.thresholds_were?.['14'];
  if (tier?.display !== 'stages' || !was || !(Number.isInteger(s.step) && s.step >= 0 && s.step < was.length)) return s;
  const per = Math.ceil(tier.thresholds.length / was.length), from = s.step * per, total = tier.thresholds.slice(from, from + per).reduce((a, b) => a + b, 0);
  const st = s.stretch?.[stretchKey(s.tier, s.step)] ?? 0, share = k => Math.round(st * tier.thresholds[k] / total);
  let step = from, progress = s.progress ?? 0;
  while (step < from + per - 1 && progress >= tier.thresholds[step] + share(step)) { progress -= tier.thresholds[step] + share(step); step += 1; }
  const stretch = s.stretch ? Object.fromEntries(Object.entries(s.stretch).filter(([key]) => !key.startsWith(`${s.tier}:`))) : null;
  const out = { ...s, step, progress };
  if (stretch && share(step)) stretch[stretchKey(s.tier, step)] = share(step);
  if (stretch && Object.keys(stretch).length) out.stretch = stretch; else delete out.stretch;
  return out;
}

/* What a save rooted before 2026-10-16 held without writing it down: the `_legacy_starter` of
   its roots, 银月 once she walked with it, and its tamed beasts that are cards. */
function legacyCards(content, state) {
  const catalog = Object.fromEntries((content.cards?.cards ?? []).map(c => [c.id, c])), roots = new Set(state.traits);
  return [...new Set([
    ...(content.cards?._legacy_starter ?? []).filter(id => catalog[id] && (!catalog[id].element || roots.has(catalog[id].element))),
    ...(state.companion?.joined && catalog.yinyue ? ['yinyue'] : []),
    ...(state.cast ?? []).filter(id => catalog[id]),
  ])];
}

/* The card ids a save keeps, mapped through cards.json `_renamed` (金爪 → 金刃 …): his cards, his
   picked ten and what he took out, the 新, where each came from, the ★ of 闭关. Empty when nothing maps. */
function renamedCards(content, state) {
  const map = content.cards?._renamed ?? {}, to = id => map[id] ?? id;
  const list = k => (Array.isArray(state[k]) && state[k].some(id => map[id]) ? { [k]: [...new Set(state[k].map(to))] } : {});
  const keyed = k => (state[k] && Object.keys(state[k]).some(id => map[id]) ? { [k]: Object.fromEntries(Object.entries(state[k]).map(([id, v]) => [to(id), v])) } : {});
  const cards = Array.isArray(state.cards) ? state.cards : state.traits?.length ? legacyCards(content, state) : null;
  return { ...(cards?.some(id => map[id]) ? { cards: [...new Set(cards.map(to))] } : {}), ...list('deck'), ...list('deck_out'), ...list('cards_new'), ...keyed('card_from'), ...keyed('card_stars') };
}

/* State a system cut whole left in saves (fitWorld drops it): 密室's open room, a rerun's 暗室 offer, the day's count;
   断案's cases (both 2026-10-27); the player-asks 二十问's day (`twenty`, 2026-10-28 — 录's `animals` stay); the 秘境
   rerun's run and its clocks (`rerun`, `reruns`, 2026-10-28 — runLeft lets an open run go first). */
const RETIRED_KEYS = ['mishi', 'mishi_offer', 'mishi_log', 'cases', 'twenty', 'rerun', 'reruns'];

/* 刷副本 retired 2026-10-28 (Hanli: 「按你说的来」): a save that stood inside a run of the 秘境's outer rooms leaves it as
   leaving would have — the fight on a run's beast let go unsettled (nothing paid, nothing lost), the room's fight record
   cleared, a 奇遇 or 拾遗 won in it and not handed in dropped, 银月 back from one, the run's sealed mark let go by the
   next settle (world.mjs fitSealed thaws the 机缘), and the room he stood in no place of his map, so the settle sets
   him at the map's home (world.mjs fitLeave). The fields to change; `drop`: keys to remove. */
function runLeft(state) {
  const run = state.rerun;
  if (!run && !state.returned?.rerun) return { fix: {}, drop: [] };
  const fix = {}, drop = [];
  if (state.returned?.rerun) drop.push('returned');
  if (!run) return { fix, drop };
  const rooms = Object.keys(run.rooms ?? {}), held = Object.values(run.rooms ?? {}).map(r => r.qiyu?.task).filter(Boolean);
  if (state.fight && rooms.some(id => String(state.fight.setup?.seed ?? '').includes(`|${id}|`) || state.duels?.[`hunt:${id}`]?.outcome === 'open')) drop.push('fight');
  if (state.duels && rooms.some(id => `hunt:${id}` in state.duels)) fix.duels = Object.fromEntries(Object.entries(state.duels).filter(([k]) => !rooms.includes(k.slice(5)) || !k.startsWith('hunt:')));
  const own = id => held.includes(id) || id === run.board;
  for (const k of ['wins', 'stars', 'grades']) if (state[k] && Object.keys(state[k]).some(own)) fix[k] = Object.fromEntries(Object.entries(state[k]).filter(([id]) => !own(id)));
  if (state.her_game?.task && own(state.her_game.task)) drop.push('her_game');
  if (state.sealed?.run) fix.sealed = (({ run: _, ...rest }) => rest)(state.sealed);
  return { fix, drop };
}
export function fitWorld(saved, content) {
  // 奇遇 (Branch) went 2026-09-24 for 今日传闻: an open one is closed quietly, unpaid.
  const { branch, ...rest } = saved;
  let state = 'branch' in saved ? rest : saved;
  // The book set aside at a scene the save no longer stands on (rules/aside.mjs): let go, so Move is never kept shut.
  if (state.aside && state.aside.scene !== state.scene) state = (({ aside, ...r }) => r)(state);
  // A save from before the nine 层 (v15) is carried by the older steps on the three-step ladder it knew, then into 段.
  const was = 'ladder_stages' in state ? ladderOf14(content) : content;
  if ('ladder3' in state) state = threeToNine(was, state);
  if ('ladder9' in state) state = nineToThree(was, state);
  if ('ladder_zero' in state) state = zeroLayer(was, state);
  if ('ladder_pace' in state) state = paceLayer(was, state);
  if ('ladder_stages' in state) state = stagesCarry(content, state);
  const tier = tierOf(content, state.tier);
  const chapter = content.chapters[state.chapter];
  // A scene renamed since — the prologue rewrite of 2026-09-28 — goes to the
  // nearest scene the chapter names for it (chapter.json `aliases`).
  let alias = chapter && state.scene != null && !chapter.scenes[state.scene] ? chapter.aliases?.[state.scene] : null;
  // A save that played only the retired scenes of a rewritten chapter (their
  // ids are `aliases` keys) and stands on a scene the rewrite kept (00-waimen)
  // begins the rewrite at its first scene: the kept scene's story assumes the
  // new one before it (prologue-v3's outer court, the fox he never met).
  // A scene split since, whose later part a mark proves he walked (chapter.json `moved`: 09-dabi's 腊八 went to its own year,
  // 2026-10-28) — on to the scene that part stands in now, and the stage quests he handed in under the old ways named anew.
  const moved = !alias && chapter?.moved?.[state.scene];
  if (moved && (state.marks ?? []).includes(moved.mark) && chapter.scenes[moved.to]) alias = moved.to;
  const done = state.done_scenes ?? [];
  if (!alias && chapter?.aliases && state.scene && state.scene !== chapter.first_scene && chapter.scenes[state.scene]
    && !(state.ended ?? []).includes(chapter.id) && done.some(id => id in chapter.aliases) && !done.some(id => chapter.scenes[id])) alias = chapter.first_scene;
  const scene = chapter && state.scene != null ? chapter.scenes[alias ?? state.scene] : null;
  const place = state.place != null && Object.values(content.places).some(d => d.places.some(p => p.id === state.place));
  const beasts = new Set(content.creatures.creatures.map(c => c.id));
  const hero = heroOf(content);
  const fix = {
    ...(!tier ? { tier: content.ladder.tiers[0].id, step: 0, progress: 0 } : {}),
    ...(tier && !(state.step < tier.thresholds.length) ? { step: tier.thresholds.length - 1 } : {}),
    ...(!chapter ? { chapter: firstChapter(content).id, scene: firstChapter(content).first_scene } : {}),
    ...(alias && scene ? { scene: alias } : {}),
    // Moved by an alias, a practice the retired scene offered and no scene of
    // the chapter offers now is let go (unfinished); what was done stays.
    ...(alias && scene ? { tasks: keptTasks(state.tasks, chapter) } : {}),
    ...(alias && scene && moved?.stages && (state.stages ?? []).some(k => moved.stages[k]) ? { stages: [...new Set(state.stages.map(k => moved.stages[k] ?? k))] } : {}),
    ...(alias && scene && moved?.done ? { done_scenes: [...new Set([...(state.done_scenes ?? []), ...moved.done])] } : {}),
    ...(chapter && state.scene != null && !scene ? { scene: state.ended?.includes(chapter.id) ? null : chapter.first_scene } : {}),
    // Unknown, the place is settled by the rules from the scene or the province's start.
    ...(state.place != null && !place ? { place: null } : {}),
    ...((state.cast ?? []).some(id => !beasts.has(id)) ? { cast: state.cast.filter(id => beasts.has(id)) } : {}),
    // A companion found before she could sleep (the bell at 结丹, before
    // prologue-v3) is awake: `awake` is what the engine's presence reads.
    // Away on a line she does not live on (companion.mjs fitPresence) she is not awake either.
    ...(state.companion?.joined && !state.companion.asleep && !state.companion.away && !state.companion.awake ? { companion: { ...state.companion, awake: true } } : {}),
    // The hero is fixed (2026-09-30): a save named on the old name card, or
    // never named, takes the world's — 沈小满, a boy.
    ...(hero && (state.name !== hero.name || state.gender !== hero.gender) ? { name: hero.name, gender: hero.gender } : {}),
    // 得牌 (cards.md § 4, 2026-10-16): no starter at the root test any more. A save rooted
    // before the rule holds the twelve it was handed then, written down now, so it keeps
    // every card it had (a party member's among them — in the 牌谱, never in his ten).
    ...(state.traits?.length && !Array.isArray(state.cards) ? { cards: legacyCards(content, state) } : {}),
    // A card renamed to the book's word is a new id (cards.json `_renamed`): what he held maps over.
    ...renamedCards(content, state),
    // Its own seed (seedOf), fixed once: the name it was given, else its creation time.
    ...(state.seed == null ? { seed: state.name && state.name !== hero?.name ? state.name : (state.created ?? '') } : {}),
    // Each other line's place (rules/lines.mjs): one never held starts at zero (v14).
    ...fitLines(content, state),
  };
  // A scene given a board after the save walked into it (the opening's beats, 2026-10-14):
  // its tasks are offered now, as entering it would have — a save standing there is never shut out.
  const here = chapter?.scenes?.[fix.scene ?? state.scene];
  // A board cut since (the small games cut 10-16): offered and never done, it can never be won —
  // let go. What was done stays, for the record.
  // A board taken off the story but kept for the 游戏厅 (its task marked `cut`, 扔石听声 2026-10-19) goes the same way.
  const known = content.tasks?.tasks ? new Set(content.tasks.tasks.filter(t => !t.cut).map(t => t.id)) : null;
  const raw = fix.tasks ?? state.tasks ?? {};
  const held = Object.fromEntries(Object.entries(raw).filter(([id, t]) => !known || t?.status === 'done' || known.has(id)));
  const unoffered = (here?.offers?.tasks ?? []).filter(id => !held[id]);
  if (unoffered.length || Object.keys(held).length !== Object.keys(raw).length) fix.tasks = { ...held, ...Object.fromEntries(unoffered.map(id => [id, { status: 'offered' }])) };
  // 银月 held out of the 木牌 for a board cut since: back in.
  const drop = known && state.her_game?.task && !known.has(state.her_game.task) ? ['her_game'] : [];
  // A system cut whole leaves its state behind (密室 2026-10-27: the room open, a rerun's 暗室, the day's count): gone.
  // A card duel open (state.fight) whose id is a board now (the 大比's three rounds, 格斗 since 2026-10-31): let go, unplayed —
  // the board stands in the scene (offered above), and no verb is held for a fight that no longer exists.
  const boardNow = id => content.tasks?.tasks?.some(t => t.id === id && t.kind === 'board');
  if (state.fight && boardNow(state.fight.game)) {
    drop.push('fight');
    const cid = state.fight.creature;
    if (cid && state.duels?.[cid]?.outcome === 'open') { const { [cid]: _, ...duels } = state.duels; fix.duels = duels; }
  }
  // An open 秘境 rerun (retired 2026-10-28) is left first, as leaving would have.
  const left = runLeft(state);
  Object.assign(fix, left.fix);
  drop.push(...left.drop, ...RETIRED_KEYS.filter(key => key in state));
  // The rest of a passage owed after a board the scene no longer has (`after/<scene>`, its
  // `story_after` merged back into its `story`): nothing is owed. Nor when the passage was re-cut
  // under the save and its first board is not over (a new board placed, 2026-10-26): it is owed
  // again when that board is (tasks.mjs taskDone), never told ahead of it.
  const sceneById = sid => Object.values(content.chapters).find(ch => ch.scenes?.[sid])?.scenes[sid];
  const tasksNow = fix.tasks ?? state.tasks ?? {};
  const afterOwed = sc => Boolean(sc?.story_after) && ((b) => !b || tasksNow[b]?.status === 'done')((sc.show ?? []).find(c => c.card === 'board')?.id);
  const owed = state.tell_owed ?? [];
  const owing = owed.filter(k => !k.startsWith('after/') || afterOwed(sceneById(k.slice(6))));
  if (owing.length !== owed.length) fix.tell_owed = owing;
  // Before a story gate, nothing the gate keeps (lockReset): read where the save now stands.
  Object.assign(fix, lockReset(content, { ...state, ...fix }));
  if ('seclusion' in fix) drop.push('seclusion');
  if (drop.length) { const kept = { ...state, ...fix }; for (const key of drop) delete kept[key]; return kept; }
  return Object.keys(fix).length ? { ...state, ...fix } : state;
}
