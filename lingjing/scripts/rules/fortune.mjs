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
//
// 问签 v2 (Hanli 2026-11-02, 「可以, 按你说的做」): one shake, one full reading — no ask picker. The brief now carries
//   · the 白话签解 (`jie`: the game's own plain rendering, qian.json; English `gloss`), and the 签's own 宜 kind
//     (`kind`, tagged once by the rule in qian.json `_about` — no longer `(n − 1) mod 4`);
//   · 五项运势 (`aspects`: 事业 · 感情 · 财运 · 出行 · 健康): rules-side lines from the 签's tone for each 项 and today's
//     黄历 (aspectsOf) — 财运 in 宜/忌 only, 健康 light and never medical;
//   · 替人求签 (`action: friend`): someone else's 签 for today, seeded by the 称呼, the day and the save; at most
//     `friends.per_day` a day; never 修为, never the 宜; kept (称呼 and signs, never the birthday) unless 不保存.
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
/* The 宜 the 签 names: its own `kind` (问签 v2, tagged by meaning); a set without tags, by its number (v1). */
export const yiKindOf = (content, entry) => {
  const k = book(content)?.yi?.kinds ?? [];
  if (!entry || !k.length) return null;
  return k.find(x => x.id === entry.kind) ?? k[(entry.n - 1) % k.length];
};
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

/* 五项运势 (问签 v2): each 项's line from the 签's tone (`luck`) and today's 黄历 — the first of the 项's `ji` acts the
   day avoids, else the first of its `yi` acts the day favours, added after it. Rules-side words, from qian.json. */
export function aspectsOf(content, entry, al, lang) {
  const A = book(content)?.aspects;
  if (!A || !entry) return [];
  const has = (list, id) => (list ?? []).some(x => x.id === id);
  return (A.list ?? []).map((a, i) => {
    const tone = entry.luck?.[i] ?? 'even', lines = a.lines?.[tone] ?? a.lines?.even ?? [];
    const base = lines.length ? pick(lines[(entry.n + i) % lines.length], lang) : '';
    const ji = (a.ji ?? []).find(id => has(al?.ji, id)), yi = ji ? null : (a.yi ?? []).find(id => has(al?.yi, id));
    const act = ji ?? yi, actName = act ? pick(book(content).almanac?.acts?.[act], lang) : null;
    const day = act ? pick(A.almanac?.[ji ? 'ji' : 'yi'], lang)?.replace('{act}', actName) : null;
    return { id: a.id, name: pick(a.name, lang), tone, line: day ? `${base}${lang === 'en' ? ' · ' : '，'}${day}` : base, ...(act ? { day: { [ji ? 'ji' : 'yi']: act } } : {}) };
  });
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
  const lang = state.lang, yi = yiKindOf(content, e), signs = signsOf(content, state, lang);
  const yy = yingyanBrief(content, state, now);
  // An old save's draw may still hold v1's ask (`ask`, `ask_text`): kept there, read by nothing now.
  return {
    ...readingOf(content, e, signs, now, lang),
    speed: qianSpeedOf(content, state, now),
    yi: yi ? { id: yi.id, name: pick(yi.name, lang), games: pick(yi.games, lang), pay: book(content).yi.pay } : null,
    count: state.qian_book?.counts?.[e.n] ?? 1,
    ...(yy ? { yingyan: yy } : {}),
  };
}

/* One 签's full reading for a day, whoever it is for: number, grade, 签诗, 签解, 五项, 黄历, the signs and a clash —
   the part a friend's card shares with his (no 修为, no 宜). */
function readingOf(content, e, signs, now, lang) {
  const g = gradeOf(content, e), al = almanacToday(content, { lang }, now);
  const jie = lang === 'en' ? e.gloss ?? null : e.jie ?? null;
  return {
    n: e.n, of: book(content).of ?? 100, day: dayKey(now), grade: { id: e.grade, name: pick(g?.name, lang) ?? e.grade, tone: g?.tone ?? 'even' },
    ...(e.title ? { title: pick(e.title, lang) } : {}),
    poem: e.poem, ...(lang === 'en' && e.gloss ? { gloss: e.gloss } : {}), ...(jie ? { jie } : {}), source: e.url ?? book(content).source?.url ?? null,
    aspects: aspectsOf(content, e, al, lang),
    almanac: al, ...(signs ? { signs, ...(al?.chong?.zodiac && signs.zodiac.id === al.chong.zodiac ? { clash: true } : {}) } : {}),
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
    friends: friendsKept(content, state, lang), friend_left: friendLeft(content, state, now),
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

const SAID_MAX = 60;
const clean = (v, max) => String(v ?? '').replace(/\s+/gu, ' ').trim().slice(0, max);

/* 摇签: once a day (问签 v2: nothing is asked first — an old page's `ask` is let go). */
function draw(state, content, ctx) {
  const now = ctx.now;
  if (drawnToday(state, now)) return refuse('cast-today', null, { divination: divinationBrief(content, state, now) });
  const e = qianOf(content, state, now);
  if (!e) return refuse('no-qian', null);
  const s = clone(state), day = dayKey(now);
  s.qian = { day, n: e.n, at: now.toISOString() };
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

/* ── 替人求签 (问签 v2) ── */

const friendRules = content => ({ per_day: 3, keep: 12, name_max: 12, ...(book(content)?.friends ?? {}) });
/* A 称呼 as one person: NFC, spaces folded, cut to the limit. */
const nameOf = (content, v) => clean(String(v ?? '').normalize('NFC'), friendRules(content).name_max);
const friendKey = name => hashOf(`friend|${name}`).toString(36);
const friendDay = (state, now) => (state.qian_friend_day?.day === dayKey(now) ? state.qian_friend_day.keys ?? [] : []);
const friendLeft = (content, state, now) => Math.max(0, friendRules(content).per_day - friendDay(state, now).length);
/* The friends he kept: 称呼 and the signs a birthday gave — never a date. */
function friendsKept(content, state, lang) {
  return (state.qian_friends ?? []).map(f => ({ name: f.name, ...(signsOfFate(content, f, lang) ? { signs: signsOfFate(content, f, lang) } : {}) }));
}
function signsOfFate(content, f, lang) {
  if (!f?.zodiac) return null;
  const z = content.traits.fate.zodiac.find(x => x.id === f.zodiac), s = (book(content)?.signs ?? []).find(x => x.id === f.sign);
  return { zodiac: { id: f.zodiac, name: pick(z, lang) }, ...(s ? { sign: { id: s.id, name: pick(s.name, lang) } } : {}) };
}
/* That person's 签 today: the same all day, by the 称呼, the day and his save. */
export function friendQianOf(content, state, now, name) {
  const set = setOf(content);
  return set.length ? set[hashOf(`${dayKey(now)}|${seedOf(state)}|friend|${name}`) % set.length] : null;
}

/* 替人求签: `name` (the 称呼, required), `birth` (optional, YYYY-MM-DD: read here for the 生肖 and 星座, then let go —
   never kept, never logged), `keep` (false: 不保存 — nothing of the friend stays but the day's count). The page's
   alone: never a tool's. Pays nothing; never the 宜; his own 签 untouched. */
function friend(state, content, ctx, args) {
  const now = ctx.now, name = nameOf(content, args.name), rules = friendRules(content);
  if (!name) return refuse('no-name', null);
  const kept = (state.qian_friends ?? []).find(f => f.name === name);
  let signs = kept?.zodiac ? { zodiac: kept.zodiac, ...(kept.sign ? { sign: kept.sign } : {}) } : null;
  if (args.birth) {
    const got = fateOf(content, args.birth);
    if (!got || new Date(`${args.birth}T00:00:00`) > now) return refuse('birth-invalid', null);
    signs = { zodiac: got.zodiac, ...(got.sign ? { sign: got.sign } : {}) };
  }
  const key = friendKey(name), today = friendDay(state, now);
  if (!today.includes(key) && today.length >= rules.per_day) return refuse('friends-today', null, { per_day: rules.per_day });
  const e = friendQianOf(content, state, now, name);
  if (!e) return refuse('no-qian', null);
  const s = clone(state);
  s.qian_friend_day = { day: dayKey(now), keys: today.includes(key) ? today : [...today, key] };
  if (args.keep !== false && args.keep !== 'false') {
    const row = { name, ...(signs ?? {}) };
    s.qian_friends = [row, ...(state.qian_friends ?? []).filter(f => f.name !== name)].slice(0, rules.keep);
  }
  const lang = state.lang;
  return { state: s, result: { ok: true, friend: { name, ...readingOf(content, e, signsOfFate(content, signs, lang), now, lang) }, qian: qianLook(content, s, now) } };
}
/* A kept friend let go (by 称呼). */
function forgetFriend(state, content, ctx, args) {
  const name = nameOf(content, args.name);
  if (!(state.qian_friends ?? []).some(f => f.name === name)) return refuse('no-friend', null);
  const s = clone(state);
  s.qian_friends = (state.qian_friends ?? []).filter(f => f.name !== name);
  return { state: s, result: { ok: true, qian: qianLook(content, s, ctx.now) } };
}
const PAGE_ONLY = new Set(['friend', 'forget_friend', 'asked']);

/* 银月's read (`--for=yinyue`): the day's 签 and its facts, and what she may do with them. */
const HER_NOTE = 'The day\'s 签 and its facts. In the evening (yingyan.open) you may ask him once whether the day\'s 宜 came true; when he answers, call Qian with action verify and `said` (his words, short). Never invent a 签 line; quote only `poem`.';
function herView(content, state, now) {
  const d = divinationBrief(content, state, now), last = (state.qian_book?.yingyan ?? []).at(-1) ?? null;
  return { ok: true, how: HER_NOTE, divination: d, ...(last ? { last_yingyan: last } : {}) };
}

/* Divine — 问签. `action`: draw (the default; the page's tap or Ling's word), book (the 签谱, read), asked (the
   page: the evening's question was put), verify (应验: his answer — the page, Ling, or 银月's own tool). */
const ACTIONS = { draw, asked, verify, friend, forget_friend: forgetFriend };
export function divine(state, content, ctx, args = {}) {
  if (!book(content)) return refuse('no-qian', null);
  const action = String(args.action ?? '') || 'draw';
  if (action === 'book') return { state: null, result: { ok: true, book: qianBook(content, state), qian: qianLook(content, state, ctx.now) } };
  // 替人求签 is the page's alone (a friend's 称呼 and birthday are typed on the card, never in a chat).
  if (PAGE_ONLY.has(action) && ctx.reader) return refuse('page-only', null);
  if (ctx.reader === 'yinyue') return action === 'verify' ? verify(state, content, ctx, args) : { state: null, result: herView(content, state, ctx.now) };
  const run = ACTIONS[action];
  return run ? run(state, content, ctx, args) : refuse('unknown-action', null, { actions: ['draw', 'book', 'asked', 'verify', 'friend', 'forget_friend'] });
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
