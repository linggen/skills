// The player's state and the arithmetic over it. Pure: no files, no clock —
// the caller passes `now`.

export const STATE_VERSION = 11;
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
  if (shut.includes('seclusion') && state.seclusion) fix.seclusion = undefined;
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

/* Whether 体力 limits play. Off while we test (his, 2026-10-01: 「先不要用体力
   限制我们测试的时长. 体力限制游戏时长的设定, 可以以后加.」): nothing spends
   it, nothing is refused for it, the pool stays full. Every cost and rule is
   kept: the switch is thrown where the game is played — rules.mjs run as the
   command (the page's and Ling's door) sets LINGJING_STAMINA_LIMIT=0 unless
   it is already set — so the rules' own tests still play the pool as it was.
   `LINGJING_STAMINA_LIMIT=1` (or `rewards.stamina.limit: false` to force it
   off anywhere) is the one place to change. */
const limitEnv = () => (typeof process === 'undefined' ? undefined : process.env?.LINGJING_STAMINA_LIMIT);
export const staminaLimited = content => content.rewards?.stamina?.limit !== false && limitEnv() !== '0';

const secsPerPoint = q => (q.refill_hours * 3600) / q.max;

/* The pool's top: `max`, less what 丹毒 takes (balance.json `dandu`: each turn a pill's furnace left out,
   owed until 闭关 makes it up — rules/dandu.mjs), never more than its `cap`. The refill keeps its rate. */
export function staminaMax(content, state) {
  const q = content.rewards.stamina, D = content.balance?.dandu, turns = Math.max(0, Number(state?.dandu) || 0);
  if (!D || !turns) return q.max;
  return q.max - Math.min(D.cap ?? 0, Math.round(turns * (D.per_turn ?? 0)));
}
/* Where a spent pool wakes (`rest`): never above the pool's top, so 丹毒 never keeps him resting for good. */
export const staminaRest = (content, state) => Math.min(content.rewards.stamina.rest ?? 0, staminaMax(content, state));

/* Refill by the clock since it was last settled — whole points only, the
   remainder keeps waiting in `qi_at`. A save from before 灵气 wakes full. */
export function settleStamina(content, state, now) {
  const q = content.rewards.stamina, max = staminaMax(content, state);
  if (!staminaLimited(content)) { state.stamina = max; state.stamina_at = now.toISOString(); delete state.resting; return; }
  if (state.stamina == null || !state.stamina_at) { state.stamina = max; state.stamina_at = now.toISOString(); return; }
  // A pool or a clock that is not a number (a hand-edited save, a bad write)
  // starts counting again from now, and never becomes NaN (review, 2026-09-24).
  if (!Number.isFinite(state.stamina)) state.stamina = max;
  if (Number.isNaN(Date.parse(state.stamina_at))) state.stamina_at = now.toISOString();
  if (state.stamina >= max) { state.stamina = max; state.stamina_at = now.toISOString(); return; }
  const gained = Math.floor(Math.max(0, now - new Date(state.stamina_at)) / 1000 / secsPerPoint(q));
  if (gained <= 0) return;
  state.stamina = Math.min(max, state.stamina + gained);
  state.stamina_at = state.stamina >= max
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
  const max = staminaMax(content, state);
  const before = state.stamina;
  state.stamina = Math.min(max, state.stamina + Math.max(0, n));
  if (state.stamina >= max) state.stamina_at = now.toISOString();
  return state.stamina - before;
}

/* ── The ladder: tiers and their steps ── */

export const tierOf = (content, id) => content.ladder.tiers.find(t => t.id === id);

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

export function stepName(content, tierId, step, lang) {
  const tier = tierOf(content, tierId);
  const name = pick(tier.name, lang), s = tier.steps[lang][step];
  return lang === 'zh' ? `${name}${s}` : `${name} · ${s}`;
}

/* The phase a step falls in (ladder.json `phases`, three steps each): 练气四层
   is 练气中成 — the formal word, as a 名册 writes it. A realm of three steps
   (筑基 and above) is its own phases: 筑基中成. Null for a world without phases. */
export function phaseName(content, tierId, step, lang) {
  const tier = tierOf(content, tierId), phases = content.ladder.phases;
  if (!tier || !phases) return null;
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
  const from = ladder_pace === true ? 9 : ladder_pace, tier = tierOf(content, s.tier);
  const was = tier?.thresholds_were?.[from]?.[s.step], now = tier?.thresholds?.[s.step];
  if (!(was > 0) || !(now > 0)) return s;
  return { ...s, progress: Math.min(now, Math.round((s.progress ?? 0) * now / was)) };
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

export function fitWorld(saved, content) {
  // 奇遇 (Branch) went 2026-09-24 for 今日传闻: an open one is closed quietly, unpaid.
  const { branch, ...rest } = saved;
  let state = 'branch' in saved ? rest : saved;
  if ('ladder3' in state) state = threeToNine(content, state);
  if ('ladder9' in state) state = nineToThree(content, state);
  if ('ladder_zero' in state) state = zeroLayer(content, state);
  if ('ladder_pace' in state) state = paceLayer(content, state);
  const tier = tierOf(content, state.tier);
  const chapter = content.chapters[state.chapter];
  // A scene renamed since — the prologue rewrite of 2026-09-28 — goes to the
  // nearest scene the chapter names for it (chapter.json `aliases`).
  let alias = chapter && state.scene != null && !chapter.scenes[state.scene] ? chapter.aliases?.[state.scene] : null;
  // A save that played only the retired scenes of a rewritten chapter (their
  // ids are `aliases` keys) and stands on a scene the rewrite kept (00-waimen)
  // begins the rewrite at its first scene: the kept scene's story assumes the
  // new one before it (prologue-v3's outer court, the fox he never met).
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
  // The rest of a passage owed after a board the scene no longer has (`after/<scene>`, its
  // `story_after` merged back into its `story`): nothing is owed.
  const sceneById = sid => Object.values(content.chapters).find(ch => ch.scenes?.[sid])?.scenes[sid];
  const owed = state.tell_owed ?? [];
  const owing = owed.filter(k => !k.startsWith('after/') || sceneById(k.slice(6))?.story_after);
  if (owing.length !== owed.length) fix.tell_owed = owing;
  // Before a story gate, nothing the gate keeps (lockReset): read where the save now stands.
  Object.assign(fix, lockReset(content, { ...state, ...fix }));
  if ('seclusion' in fix) { const { seclusion, ...kept } = { ...state, ...fix }; return kept; }
  return Object.keys(fix).length ? { ...state, ...fix } : state;
}
