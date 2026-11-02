// rules/fortune.mjs — 问签: the day's one 签 from the 签筒, the 黄历 under it, and the 命格 it is read against.
// Part of the rules engine; rules.mjs is its one door.
//
// 问签 v1 (Hanli 2026-11-02, 「可以, 按你说的做」 — the rewards, then the scope) replaced 问卦's fight luck:
//   · once a real day, the day's opener, never in a pool: one 签 seeded by the day and the save, so undo cannot fish;
//   · 修为 speed for the day by the 签's grade (qian.json `grades`: 上上 ×1.2 … ×1.0 from 中 down — never below 1),
//     applied with the roots' speed in every 修为 grant (core.mjs amountsOf), so every card's shown pay has it;
//   · one 宜 kind of play (qian.json `yi.kinds`, named by the 签): that kind's 修为 ×`yi.pay` today, and the
//     weight the 时辰 pool may lean by (`yiWeightOf`);
//   · the 黄历 of the day as facts (rules/almanac.mjs), his 生肖 and 星座, the question he asked — handed to 银月,
//     who words the reading (guide/qian.md); asleep or away, the card shows the 签诗 and the 宜忌 alone;
//   · 签谱 (every 签 drawn, with a count), 连签 (days in a row: a finer 签筒 at 3 / 7 / 30), and 应验 — in the
//     evening 银月 may ask once whether the day's 宜 came true; an answer pays a little, kept in the save.
// The old cast (`state.divination`, 问卦) is left in the save as it was and read by nothing now: a save that cast
// today may still draw today's 签 (agent's pick, Hanli delegated 11-02 — the old cast gives nothing any more).
import { localDay } from '../calendar.js';
import { dayKey, pick, seedOf } from '../state.mjs';
import { clone, pay, refuse } from './core.mjs';
import { hashOf } from './travel.mjs';
import { almanacOf } from './almanac.mjs';

/* ── The old three coins — kept for the calls that still name them (roots.mjs, rules.mjs) ── */

/* A seeded generator: the day's throws are the day's, however often asked. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function castThrows(seed) {
  const rand = prng(hashOf(seed));
  return Array.from({ length: 6 }, () => [0, 1, 2].map(() => (rand() < 0.5 ? 3 : 2)));
}
/* 问卦's fight luck is gone (问签 v1): nothing leans a fight now. Kept for an older caller. */
const boutFortune = () => null;

/* ── 问签 ── */

const book = content => content.qian ?? null;
const setOf = content => book(content)?.qian ?? [];
const drawnToday = (state, now) => (now && state.qian?.day === dayKey(now) ? state.qian : null);
const entryOf = (content, n) => setOf(content).find(q => q.n === n) ?? null;
const ymd = now => localDay(now);
const prevDay = now => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12));

/* The 签 the day holds for this save: the same however often asked. */
export function qianOf(content, state, now) {
  const set = setOf(content);
  return set.length ? set[hashOf(`${dayKey(now)}|${seedOf(state)}|qian`) % set.length] : null;
}
/* The 宜 the 签 names: one of the kinds, by its number. */
export const yiKindOf = (content, entry) => { const k = book(content)?.yi?.kinds ?? []; return entry && k.length ? k[(entry.n - 1) % k.length] : null; };
const gradeOf = (content, entry) => book(content)?.grades?.[entry?.grade] ?? null;

/* The day's 修为 speed by the 签 drawn today — 1 before it, and never below 1. */
export function qianSpeedOf(content, state, now) {
  const d = drawnToday(state, now), e = d && entryOf(content, d.n);
  return e ? Math.max(1, gradeOf(content, e)?.speed ?? 1) : 1;
}
/* Whether a grant (or a game: its mechanic as a string) is of the 宜 kind: a grant tagged by its system
   (`play`: tide · qiecuo · duel …) by that alone; a board's play by its mechanic (`kind`); else by its table. */
export function isOfKind(kind, grant) {
  if (!kind || !grant) return false;
  const g = typeof grant === 'string' ? { kind: grant } : grant;
  if (g.play) return (kind.plays ?? []).includes(g.play);
  if (g.kind) return (kind.mechanics ?? []).includes(g.kind);
  return (kind.tables ?? []).includes(g.table);
}
/* Today's 宜, once drawn. */
export function yiToday(content, state, now) {
  const d = drawnToday(state, now);
  return d ? yiKindOf(content, entryOf(content, d.n)) : null;
}
/* What the day does to a grant's 修为 (core.mjs amountsOf, rules/lines.mjs lineGrant): the speed × the 宜's pay. */
export function qianPayOf(content, state, now, grant) {
  if (!now || !book(content)) return 1;
  const yi = yiToday(content, state, now);
  return qianSpeedOf(content, state, now) * (isOfKind(yi, grant) ? Math.max(1, book(content).yi.pay ?? 1) : 1);
}
/* THE 宜 HOOK for the 时辰 pool (rules/tray.mjs and its pool): how much more often a game of today's 宜 kind may be
   dealt — `yi.weight` for a game of the kind (its mechanic, or a grant-like {play|kind|table}), else 1. */
export function yiWeightOf(content, state, now, game) {
  const yi = yiToday(content, state, now);
  return isOfKind(yi, game) ? book(content)?.yi?.weight ?? 1 : 1;
}

/* A tray or pool row (rules/aside.mjs PLAY_KINDS, rules/pool.mjs drawPool) as the 宜 reads a game: a board by its
   mechanic (games.json, by its task or game), 对对子 and 银月出题 as 文, 切磋 and 兽潮 by their tags, a pool's fight as the
   haunt's; 饭桶 and 闭关 are no kind. */
const mechanicOf = (content, e) => (content.games?.games ?? []).find(g => (e.task && g.task === e.task) || (e.game && g.id === e.game && !g.replaced))?.mechanic ?? null;
export function gameOfEntry(content, e) {
  if (!e) return null;
  if (e.kind === 'board') return mechanicOf(content, e) ? { kind: mechanicOf(content, e) } : null;
  if (e.kind === 'her') return e.id === 'duizi' ? { play: 'duizi' } : e.id === 'kao' ? { kind: '对话' } : null;
  if (e.kind === 'tide') return { play: e.id === 'qiecuo' ? 'qiecuo' : 'tide' };
  if (e.kind === 'pool' || e.kind === 'yaoshou') return { table: 'haunt' };
  return null;
}
/* THE 宜 HOOK on a pool row: drawPool may multiply a member's weight by this (1 off the day's kind). */
export const yiWeightOfEntry = (content, state, now, entry) => yiWeightOf(content, state, now, gameOfEntry(content, entry));

/* 连签: the days in a row he has drawn, as it stands today (0 once a day was missed). */
function streakNow(state, now) {
  const s = state.qian_book?.streak;
  if (!s) return 0;
  return s.last === dayKey(now) || s.last === prevDay(now) ? s.run : 0;
}
/* The 签筒's look by the run: the highest step reached (qian.json `streak`), else the plain one. */
function tubeOf(content, run) {
  const steps = (book(content)?.streak ?? []).filter(x => run >= x.days);
  return steps.length ? steps.at(-1).look : 'plain';
}

/* His signs, from the 命格 (fate below): 生肖 and 星座 — null where he gave none. */
function signsOf(content, state, lang) {
  const f = state.fate;
  if (!f?.zodiac) return null;
  const z = content.traits.fate.zodiac.find(x => x.id === f.zodiac), s = (book(content)?.signs ?? []).find(x => x.id === f.sign);
  return { zodiac: { id: f.zodiac, name: pick(z, lang) }, ...(s ? { sign: { id: s.id, name: pick(s.name, lang) } } : {}) };
}

/* The day's 黄历, as Look and the card tell it — before the draw too. */
export function almanacToday(content, state, now) {
  return book(content)?.almanac ? almanacOf(book(content).almanac, content.traits.fate.zodiac, ymd(now), state.lang) : null;
}

/* 应验: open in the evening of a day drawn, once. */
const eveningOf = content => book(content)?.yingyan?.after_hour ?? 17;
function yingyanBrief(content, state, now) {
  const d = drawnToday(state, now);
  if (!d) return null;
  const day = dayKey(now), b = state.qian_book ?? {};
  const done = (b.yingyan ?? []).find(v => v.day === day);
  return { open: now.getHours() >= eveningOf(content) && !done, asked: b.asked === day, ...(done ? { said: done.said } : {}) };
}

/* Today's 签 as Look and the card tell it, or null before it is drawn. */
export function divinationBrief(content, state, now) {
  const d = drawnToday(state, now), e = d && entryOf(content, d.n);
  if (!e) return null;
  const lang = state.lang, g = gradeOf(content, e), yi = yiKindOf(content, e), signs = signsOf(content, state, lang), al = almanacToday(content, state, now);
  const ask = (book(content).asks ?? []).find(a => a.id === d.ask);
  const yy = yingyanBrief(content, state, now);
  return {
    n: e.n, of: book(content).of ?? 100, grade: { id: e.grade, name: pick(g?.name, lang) ?? e.grade, tone: g?.tone ?? 'even' },
    ...(e.title ? { title: pick(e.title, lang) } : {}),
    poem: e.poem, ...(lang === 'en' && e.gloss ? { gloss: e.gloss } : {}), source: e.url ?? book(content).source?.url ?? null,
    speed: qianSpeedOf(content, state, now),
    yi: yi ? { id: yi.id, name: pick(yi.name, lang), games: pick(yi.games, lang), pay: book(content).yi.pay } : null,
    ...(ask ? { ask: { id: ask.id, name: pick(ask.name, lang) } } : {}), ...(d.ask_text ? { ask_text: d.ask_text } : {}),
    almanac: al, ...(signs ? { signs, ...(al?.chong?.zodiac && signs.zodiac.id === al.chong.zodiac ? { clash: true } : {}) } : {}),
    count: state.qian_book?.counts?.[e.n] ?? 1,
    ...(yy ? { yingyan: yy } : {}),
  };
}

/* The 问签 panel, before and after the draw: today's 黄历, what may be asked, whether the 生辰 is still to give,
   连签 and its 签筒, and the 签谱's size. */
export function qianLook(content, state, now) {
  if (!book(content)) return null;
  const lang = state.lang, run = streakNow(state, now), counts = state.qian_book?.counts ?? {};
  return {
    drawn: Boolean(drawnToday(state, now)),
    almanac: almanacToday(content, state, now),
    asks: (book(content).asks ?? []).map(a => ({ id: a.id, name: pick(a.name, lang) })),
    birth: !state.fate ? 'ask' : state.fate.zodiac && !state.fate.sign && state.fate.source === 'birth' ? 'sign' : null,
    streak: run, tube: tubeOf(content, run), next: (book(content).streak ?? []).find(x => x.days > run)?.days ?? null,
    book: { kinds: Object.keys(counts).length, draws: Object.values(counts).reduce((a, b) => a + b, 0), of: book(content).of ?? setOf(content).length },
  };
}

/* 签谱: every 签 the set holds, with how often he drew it — the ones never drawn by number alone. */
export function qianBook(content, state) {
  const lang = state.lang, counts = state.qian_book?.counts ?? {};
  return setOf(content).map(e => (counts[e.n]
    ? { n: e.n, grade: pick(gradeOf(content, e)?.name, lang) ?? e.grade, tone: gradeOf(content, e)?.tone ?? 'even', ...(e.title ? { title: pick(e.title, lang) } : {}), first: e.poem[0], count: counts[e.n] }
    : { n: e.n, count: 0 }));
}

const ASK_TEXT_MAX = 20, SAID_MAX = 60;
const clean = (v, max) => String(v ?? '').replace(/\s+/gu, ' ').trim().slice(0, max);

/* 摇签: once a day. `ask` (one of qian.json `asks`) and `ask_text` (his own words, ≤20) are what he asks about —
   kept with the day's draw, for 银月's reading; they never change the 签. */
function draw(state, content, ctx, args) {
  const now = ctx.now;
  if (drawnToday(state, now)) return refuse('cast-today', null, { divination: divinationBrief(content, state, now) });
  const e = qianOf(content, state, now);
  if (!e) return refuse('no-qian', null);
  const s = clone(state), day = dayKey(now);
  const ask = (book(content).asks ?? []).some(a => a.id === args.ask) ? args.ask : null, text = clean(args.ask_text, ASK_TEXT_MAX);
  s.qian = { day, n: e.n, ...(ask ? { ask } : {}), ...(text ? { ask_text: text } : {}), at: now.toISOString() };
  const b = { ...(s.qian_book ?? {}) };
  b.counts = { ...(b.counts ?? {}), [e.n]: (b.counts?.[e.n] ?? 0) + 1 };
  const prev = b.streak;
  b.streak = { last: day, run: prev?.last === prevDay(now) ? (prev.run ?? 0) + 1 : 1, best: Math.max(prev?.best ?? 0, prev?.last === prevDay(now) ? (prev.run ?? 0) + 1 : 1) };
  s.qian_book = b;
  const fresh = (book(content).streak ?? []).find(x => x.days === b.streak.run) ?? null;
  return { state: s, result: { ok: true, divination: divinationBrief(content, s, now), qian: qianLook(content, s, now), ...(fresh ? { tube: fresh.look } : {}) } };
}

/* The evening's question was put to him (the page, once 银月 heard it): marked so it is asked once a day. */
function asked(state, content, ctx) {
  const yy = yingyanBrief(content, state, ctx.now);
  if (!yy?.open) return refuse(drawnToday(state, ctx.now) ? 'not-evening' : 'not-drawn', null);
  if (yy.asked) return { state: null, result: { ok: true, asked: true } };
  const s = clone(state);
  s.qian_book = { ...(s.qian_book ?? {}), asked: dayKey(ctx.now) };
  return { state: s, result: { ok: true, asked: true } };
}

/* 应验: his answer, in his words (≤60), on the evening of a day drawn — once; it pays a little (qian.json
   `yingyan.pay`, on an existing small table) and is kept in the save, the last thirty. Not answering costs nothing. */
const KEEP_YINGYAN = 30;
function verify(state, content, ctx, args) {
  const now = ctx.now, yy = yingyanBrief(content, state, now);
  if (!yy) return refuse('not-drawn', null);
  if (yy.said) return refuse('verified-today', null, { said: yy.said });
  if (!yy.open) return refuse('not-evening', null, { after_hour: eveningOf(content) });
  const said = clean(args.said, SAID_MAX);
  if (!said) return refuse('no-words', null);
  const s = clone(state), d = s.qian, yi = yiKindOf(content, entryOf(content, d.n));
  const paid = book(content).yingyan?.pay ? pay(content, s, ctx, book(content).yingyan.pay) : null;
  const row = { day: d.day, n: d.n, ...(yi ? { yi: yi.id } : {}), said, by: ctx.reader ?? 'page' };
  s.qian_book = { ...(s.qian_book ?? {}), yingyan: [...(s.qian_book?.yingyan ?? []), row].slice(-KEEP_YINGYAN) };
  return { state: s, result: { ok: true, verified: row, paid } };
}

/* 银月's read (`--for=yinyue`): the day's 签 and its facts, and what she may do with them. */
const HER_NOTE = 'The day\'s 签 and its facts. In the evening (yingyan.open) you may ask him once whether the day\'s 宜 came true; when he answers, call Qian with action verify and `said` (his words, short). Never invent a 签 line; quote only `poem`.';
function herView(content, state, now) {
  const d = divinationBrief(content, state, now), last = (state.qian_book?.yingyan ?? []).at(-1) ?? null;
  return { ok: true, how: HER_NOTE, divination: d, ...(last ? { last_yingyan: last } : {}) };
}

/* Divine — 问签. `action`: draw (the default; the page's tap or Ling's word), book (the 签谱, read), asked (the
   page: the evening's question was put), verify (应验: his answer — the page, Ling, or 银月's own tool). */
const ACTIONS = { draw, asked, verify };
export function divine(state, content, ctx, args = {}) {
  if (!book(content)) return refuse('no-qian', null);
  const action = String(args.action ?? '') || 'draw';
  if (action === 'book') return { state: null, result: { ok: true, book: qianBook(content, state), qian: qianLook(content, state, ctx.now) } };
  if (ctx.reader === 'yinyue') return action === 'verify' ? verify(state, content, ctx, args) : { state: null, result: herView(content, state, ctx.now) };
  if (action === 'asked' && ctx.reader) return refuse('page-only', null);
  const run = ACTIONS[action];
  return run ? run(state, content, ctx, args) : refuse('unknown-action', null, { actions: ['draw', 'book', 'asked', 'verify'] });
}

/* ── 命格 — the player's lifelong signs ── */

const jdn = (y, m, d) => {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
};

/* 星座 of a month and day (qian.json `signs`: each from its first day, 摩羯 across the year's turn). */
export function signOf(content, mo, d) {
  const signs = book(content)?.signs ?? [];
  const md = mo * 100 + d;
  return signs.find(s => (s.from <= s.to ? md >= s.from && md <= s.to : md >= s.from || md <= s.to))?.id ?? null;
}

/* 生肖, 日主 and 星座 from a birth date (YYYY-MM-DD): the year turns at 立春, by the day (the traditional boundary,
   not 春节 — agent's pick, Hanli delegated 11-02); the day's stem is its place in the sixty. Null for a date that is
   not one, or outside the 立春 table. */
export function fateOf(content, birth) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth ?? '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(Date.UTC(y, mo - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return null;
  const f = content.traits.fate, lichun = f.lichun.days[y - f.lichun.from];
  if (!lichun) return null;
  const pillar = mo > 2 || (mo === 2 && d >= Number(lichun)) ? y : y - 1;
  const stem = f.stems[(jdn(y, mo, d) + 9) % 10], sign = signOf(content, mo, d);
  return { zodiac: f.zodiac[(((pillar - 1984) % 12) + 12) % 12].id, stem: stem.id, element: stem.element, ...(sign ? { sign } : {}) };
}

/* The 命格 as Look and the card tell it; `{declined}` when the player let it be. */
export function fateBrief(content, state) {
  const f = state.fate;
  if (!f) return null;
  if (!f.zodiac) return { declined: true };
  const tb = content.traits.fate, lang = state.lang;
  const stem = tb.stems.find(s => s.id === f.stem), sign = (book(content)?.signs ?? []).find(s => s.id === f.sign);
  return {
    zodiac: { id: f.zodiac, name: pick(tb.zodiac.find(z => z.id === f.zodiac), lang) },
    stem: { id: f.stem, name: pick(stem, lang) },
    element: { id: f.element, name: pick(content.traits.elements[f.element], lang) },
    ...(sign ? { sign: { id: sign.id, name: pick(sign.name, lang) } } : {}),
    source: f.source,
  };
}

/* The page's alone, never a tool: the birthday is typed on the card and read here, on this machine; only what it
   gives is kept (生肖 · 日主 · 星座 — never the date). Once set, it stays for life — but a sign set from a birthday
   before 星座 were read may take the birthday once more, for its 星座 (问签 v1). `random` draws one by the 名字
   (no 星座); `decline` lets it be. */
export function fate(state, content, ctx, args) {
  const signOnly = Boolean(state.fate?.zodiac && !state.fate.sign && state.fate.source === 'birth' && args.birth);
  if (state.fate?.zodiac && !signOnly) return refuse('fate-set', null, { fate: fateBrief(content, state) });
  const s = clone(state);
  if (args.decline) {
    if (signOnly || state.fate?.zodiac) return refuse('fate-set', null, { fate: fateBrief(content, state) });
    s.fate = { declined: true };
    return { state: s, result: { ok: true, declined: true } };
  }
  let found;
  if (args.random && !signOnly) {
    const tb = content.traits.fate, h = hashOf(`${seedOf(s)}|fate`);
    const stem = tb.stems[h % tb.stems.length];
    found = { zodiac: tb.zodiac[Math.floor(h / tb.stems.length) % tb.zodiac.length].id, stem: stem.id, element: stem.element, source: 'random' };
  } else {
    const got = fateOf(content, args.birth);
    if (!got || new Date(`${args.birth}T00:00:00`) > ctx.now) return refuse('birth-invalid', null);
    // The 星座 added to a sign already set: the rest stays as it was (a 命格 is for life).
    found = signOnly ? { ...state.fate, ...(got.sign ? { sign: got.sign } : {}) } : { ...got, source: 'birth' };
  }
  s.fate = { ...found, at: signOnly ? state.fate.at ?? ctx.now.toISOString() : ctx.now.toISOString() };
  return { state: s, result: { ok: true, fate: fateBrief(content, s) } };
}

export { boutFortune, jdn, prng };
