// rules/mishi.mjs — 密室, the hidden room (Hanli, 2026-10-15): the first of the popular AI games.
// Part of the rules engine; rules.mjs is its one door.
//
// ASYMMETRIC: the page shows the mechanisms (Look's `mishi` — never her text); 银月 reads the old
// pages (`her`) in her own tool result (SKILL.md Mishi: `mishi --action=read --for=yinyue`, herMishi —
// rules.mjs answers it to her alone; Ling reads only its others_read). Neither half opens it
// alone. The rules hold the solution — seeded per entry (save · room · day), so a replay differs —
// and check every input; she does not know the answer. The written hint (`hint`, her half
// paraphrased) is given only after he asked her and the wait went by. Pay, the anti-repeat and the
// day's limit are declared in worlds/<id>/mishi.json (balance.json `mishi` over it when present).
import fs from 'node:fs';
import path from 'node:path';
import { dayKey, itemName, periodKey, pick, seedOf } from '../state.mjs';
import { itemOf } from './errands.mjs';
import { clone, pay, refuse } from './core.mjs';
import { hashOf } from './travel.mjs';

export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const STEMS_EN = ['jia', 'yi', 'bing', 'ding', 'wu', 'ji', 'geng', 'xin', 'ren', 'gui'];
const BRANCHES_EN = ['zi', 'chou', 'yin', 'mao', 'chen', 'si', 'wu', 'wei', 'shen', 'you', 'xu', 'hai'];
/* The thirteen 文 of the left hand, as 古六 teaches them (games/wen.js WEN — the same ids):
   the twelve branches, and 中 (土, the middle finger's middle joint). */
export const WEN_IDS = [...BRANCHES_EN, 'yuqing'];
const WEN_CH = [...BRANCHES, '中'];
/* The 洛书 as drawn with 戴 on top, row-major: 4 9 2 / 3 5 7 / 8 1 6. */
export const LUOSHU = [4, 9, 2, 3, 5, 7, 8, 1, 6];
const rot = g => [6, 3, 0, 7, 4, 1, 8, 5, 2].map(i => g[i]);
const mirror = g => [2, 1, 0, 5, 4, 3, 8, 7, 6].map(i => g[i]);
/* The eight ways the box's lid can lie; 0 is the chart's own (never dealt: 看不出哪头是上). */
export const ORIENTS = (() => { const out = []; let g = LUOSHU; for (let r = 0; r < 4; r += 1) { out.push(g, mirror(g)); g = rot(g); } return out; })();

/* A 干支 year of the sixty: index ↔ stem and branch; -1 for a pair the cycle never makes. */
export const yearOf = i => ({ s: i % 10, b: i % 12 });
export const yearIndex = (s, b) => { for (let i = 0; i < 60; i += 1) if (i % 10 === s && i % 12 === b) return i; return -1; };
const yearName = (i, lang) => (lang === 'en' ? `${STEMS[i % 10]}${BRANCHES[i % 12]} (${STEMS_EN[i % 10]}-${BRANCHES_EN[i % 12]})` : `${STEMS[i % 10]}${BRANCHES[i % 12]}`);
const wenName = (id, lang) => { const k = WEN_IDS.indexOf(id); return lang === 'en' ? (id === 'yuqing' ? 'the middle' : id) : WEN_CH[k]; };

/* ── The data ── */
const cache = new Map();
export function mishiData(content) {
  const dir = content?.dir;
  if (!dir) return null;
  if (cache.has(dir)) return cache.get(dir);
  const file = path.join(dir, 'mishi.json');
  const base = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  // The economy's model (balance.json `mishi`) over the defaults here, when it says anything.
  const bal = path.join(dir, 'balance.json');
  const over = base && fs.existsSync(bal) ? JSON.parse(fs.readFileSync(bal, 'utf8'))?.mishi ?? null : null;
  const data = base && over ? { ...base, limits: { ...base.limits, ...(over.limits ?? {}) }, pay: { ...base.pay, ...(over.pay ?? {}) } } : base;
  cache.set(dir, data);
  return data;
}
const roomOf = (data, id) => data?.rooms.find(r => r.id === id) ?? null;
const entryOf = (data, task) => data?.entries.find(e => e.task === task) ?? null;
const fmt = (pair, lang, vars) => String(pick(pair, lang) ?? '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));

/* ── The variant: one seed → every puzzle's solution, both halves' words and the page's params ── */
/* FNV's low bits run in step for keys that differ in one character: mixed (murmur's finaliser) before the modulo. */
const mix = h => { let x = Math.imul(h ^ (h >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0; };
const draw = (seed, key, n) => mix(hashOf(`${seed}|${key}`)) % n;
const distinct = (seed, key, pool, k) => { const left = [...pool], out = []; for (let i = 0; i < k; i += 1) out.push(left.splice(draw(seed, `${key}${i}`, left.length), 1)[0]); return out; };

const DEAL = {
  dial(seed, p, i, before, data, lang) {
    // A handful of years (the data's `n`: [min, max]; Hanli 10-27: 「20太多了, 我研究了好久才弄明白」).
    const [lo, hi] = Array.isArray(p.n) ? p.n : [7, 23];
    const n = lo + draw(seed, `n${i}`, hi - lo + 1);
    const base = p.base === 'scroll' ? before.find(b => b.kind === 'scroll')?.year : null;
    const seal = base ?? draw(seed, `seal${i}`, 60);
    const answer = (seal + n) % 60;
    const vars = { n, seal: yearName(seal, lang), to: yearName(answer, lang) };
    return { answer: yearOf(answer), year: answer, vars, page: { split: p.split ?? 'seal-her', ...(p.split === 'n-her' ? {} : { n }) } };
  },
  hand(seed, p, i, before, data, lang) {
    const dial = p.link === 'dial' ? before.find(b => b.kind === 'dial') : null;
    const first = dial ? BRANCHES_EN[dial.year % 12] : BRANCHES_EN[draw(seed, `w1${i}`, 12)];
    const spells = Object.entries(data.words.spells).filter(([, s]) => s.wen !== first);
    const [spellId, spell] = spells[draw(seed, `sp${i}`, spells.length)];
    const pool = BRANCHES_EN.filter(w => w !== first && w !== spell.wen);
    const w2 = pool[draw(seed, `w2${i}`, pool.length)];
    const answer = [first, w2, spell.wen];
    return { answer, vars: { w1: wenName(first, lang), w2: wenName(w2, lang), w3: wenName(spell.wen, lang), w3s: pick(spell, lang) }, spell: spellId, page: {} };
  },
  luoshu(seed, p, i, before, data, lang) {
    const grid = ORIENTS[1 + draw(seed, `o${i}`, 7)];
    const keys = distinct(seed, `k${i}`, Object.keys(data.words.luoshu), 3);
    const nums = keys.map(k => LUOSHU[data.words.luoshu[k].at]);
    const answer = nums.map(n => grid.indexOf(n));
    const vars = { k1: pick(data.words.luoshu[keys[0]], lang), k2: pick(data.words.luoshu[keys[1]], lang), k3: pick(data.words.luoshu[keys[2]], lang), n1: nums[0], n2: nums[1], n3: nums[2] };
    return { answer, vars, page: { grid } };
  },
  stars(seed, p, i, before, data, lang) {
    const syms = data.words.symbols;
    const q = draw(seed, `q${i}`, syms.length), k = draw(seed, `x${i}`, 7);
    const order = distinct(seed, `r${i}`, syms.map((_, j) => j), syms.length);
    const sizes = syms.map((_, a) => Array.from({ length: 7 }, (_, b) => 2 + draw(seed, `z${i}.${a}.${b}`, 4)));
    const sym = syms[q], lodges = pick(sym.lodges, lang);
    const vars = { xiu: lodges[k], xiang: pick(sym, lang), list: lodges.join(lang === 'en' ? ', ' : '、'), idx: k + 1 };
    return { answer: [q * 7 + k], vars, page: { order, sizes, labels: syms.map(s => pick(s.label, lang)) } };
  },
  scroll(seed, p, i, before, data, lang) {
    const year = draw(seed, `y${i}`, 60), Y = yearOf(year);
    const [ca, cb] = distinct(seed, `c${i}`, [0, 1, 2, 3, 4], 2);
    const months = pick(data.words.months, 'zh');
    const column = c => {
      // Column ca keeps the year's stem, cb its branch; every column's own year is a real one, never the answer.
      const ok = j => j !== year && (c !== ca || j % 10 === Y.s) && (c !== cb || j % 12 === Y.b);
      const pool = Array.from({ length: 60 }, (_, j) => j).filter(ok);
      const j = pool[draw(seed, `col${i}.${c}`, pool.length)];
      return [STEMS[j % 10], BRANCHES[j % 12], '年', ...months[draw(seed, `m${i}.${c}`, 12)]];
    };
    const cols = [0, 1, 2, 3, 4].map(column);
    const answer = [ca * 5 + 0, cb * 5 + 1];
    return { answer, year, vars: { ca: ca + 1, ra: 1, cb: cb + 1, rb: 2, year: yearName(year, lang) }, page: { cols } };
  },
};

/* Every puzzle of the room, dealt from one seed, in order (a later one may read an earlier's answer). */
export function dealRoom(data, room, seed, lang) {
  const out = [];
  room.puzzles.forEach((p, i) => { out.push({ kind: p.kind, ...DEAL[p.kind](seed, p, i, out, data, lang) }); });
  return out;
}

/* ── Checking an input against the dealt answer ── */
const CHECK = {
  dial: (v, input) => { const [s, b] = input.split(',').map(Number); return s === v.answer.s && b === v.answer.b; },
  hand: (v, input) => input.split(',').join(',') === v.answer.join(','),
  luoshu: (v, input) => input.split(',').map(Number).join(',') === v.answer.join(','),
  stars: (v, input) => Number(input) === v.answer[0],
  scroll: (v, input) => input.split(',').map(Number).join(',') === v.answer.join(','),
};
export const checkInput = (v, input) => Boolean(CHECK[v.kind]?.(v, String(input ?? '')));

/* ── Where a room may be entered ── */
const doneToday = (state, task, now) => { const t = state.tasks?.[task]; return t?.status === 'done' && t.period === periodKey('day', now); };
/* The entry offered where he stands: 藏经阁's door, or a 暗室 a 秘境 rerun rolled here today. */
export function entryHere(content, state, now) {
  const data = mishiData(content);
  if (!data) return null;
  const today = dayKey(now), offer = state.mishi_offer;
  // A rolled 暗室 stands only while the run that rolled it is on (state.rerun).
  return data.entries.find(e => !doneToday(state, e.task, now) && (e.place ? state.place === e.place : Boolean(state.rerun) && offer?.task === e.task && offer.place === state.place && offer.day === today)) ?? null;
}
/* For Look's task list (look.mjs tasksBrief): the room's board offered here, as a hosted game is. */
export function mishiHosted(content, state, now) {
  const e = entryHere(content, state, now);
  return e ? { [e.task]: { status: 'offered' } } : {};
}
const openedToday = (state, now) => (state.mishi_log?.day === dayKey(now) ? state.mishi_log.n : 0);
const limits = data => data.limits;

/* The hook a 秘境 rerun calls with its cache roll's seed: a 暗室 instead of a plain cache, or null. */
export function mishiRoll(content, state, { seed, now, rerun = 'mijing' }) {
  const data = mishiData(content);
  const e = data?.entries.find(x => x.rerun === rerun);
  if (!e || doneToday(state, e.task, now) || openedToday(state, now) >= limits(data).per_day) return null;
  return mix(hashOf(`${seed}|mishi`)) % 1000 < Math.round((e.chance ?? 0) * 1000) ? { task: e.task, rooms: e.rooms } : null;
}
/* …and on a hit, the room offered where the rerun stands, for today. */
export function mishiOffer(content, state, { place, now, rerun = 'mijing' }) {
  const e = mishiData(content)?.entries.find(x => x.rerun === rerun);
  if (!e) return state;
  return { ...clone(state), mishi_offer: { task: e.task, place, day: dayKey(now) } };
}

/* ── The open room ── */
const openNow = (state, now) => (state.mishi && state.mishi.day === dayKey(now) ? state.mishi : null);
/* The room open today where he stands — the only one his taps can reach. */
const roomHere = (state, now) => (openNow(state, now)?.place === state.place ? state.mishi : null);
const dealOf = (content, state, m) => { const data = mishiData(content); return dealRoom(data, roomOf(data, m.room), m.seed, state.lang); };
/* 跳过这一道 — always there (Hanli 10-27: 「这个也没有跳过去的办法」; the 四条 rule: every board can be left, nothing blocks).
   A skipped mechanism opens the next; a room with one skipped pays nothing. */
const canSkip = (data, m) => !m.done;
/* The help tiers (mishi.json `help`: 1 how it plays, 2 what her page means, 3 nearly the answer): opened one by one by
   问银月 (`ask`), she says each in her own words; the page shows one only once she let the wait go by (`hint`). */
export const HELP_TIERS = 3;
const tierOf = (m, i) => m.tiers?.[i] ?? 0;
const shownOf = (m, i) => m.shown?.[i] ?? (m.hints?.includes(i) ? tierOf(m, i) || 1 : 0);
const helpText = (p, tier, lang, vars) => fmt(p.help?.[tier - 1] ?? p.help?.[p.help.length - 1], lang, vars);
const hintAt = (data, m) => (m.asked_at ? new Date(new Date(m.asked_at).getTime() + limits(data).hint_wait_s * 1000).toISOString() : null);

/* Look's `mishi` — the page's and Ling's: the mechanisms and their state, never her pages. */
export function mishiLook(content, state, ctx) {
  const data = mishiData(content);
  if (!data) return {};
  const lang = state.lang, e = entryHere(content, state, ctx.now);
  // The room stands where it was entered: walked away from, it waits there (and so does its 所得).
  // …until 出去: then the board is put away and nothing of the room stands (the day's done).
  const m = openNow(state, ctx.now)?.place === state.place && !doneToday(state, state.mishi.task, ctx.now) ? state.mishi : null;
  if (!m || (!m.done && m.task !== e?.task)) {
    if (!e) return {};
    return { mishi: { task: e.task, door: true, left_today: Math.max(0, limits(data).per_day - openedToday(state, ctx.now)) } };
  }
  const room = roomOf(data, m.room), dealt = dealOf(content, state, m);
  const puzzles = room.puzzles.map((p, i) => {
    const v = dealt[i], at = m.solved.includes(i) ? 'solved' : m.skipped.includes(i) ? 'skipped' : i === m.step ? 'open' : 'shut';
    return {
      kind: p.kind, at, ...(at === 'shut' ? {} : { his: fmt(p.his, lang, v.vars), page: v.page }),
      ...(at === 'solved' ? { right: fmt(p.right, lang, v.vars) } : {}),
      // The year read off the scroll is his once read: the dial after it begins from it.
      // …and so is the year a dial stopped on: the 铜掌 after it begins from it (Hanli 10-27: 「刚才铜盘上那一岁」 is shown, never remembered).
      ...(at !== 'shut' && at !== 'open' && v.year != null ? { read: yearName(v.year, lang) } : {}),
      // His goal, in his words only — a dial's `{n}` where the carving is his (never a var of her page).
      ...(at === 'open' && p.goal ? { goal: fmt(p.goal, lang, v.page.n != null ? { n: v.page.n } : {}) } : {}),
      ...(at === 'open' ? { tier: tierOf(m, i) } : {}),
      // The help tier read off the page when she did not say it in time (her words first; this the fallback).
      ...(shownOf(m, i) ? { hint: helpText(p, shownOf(m, i), lang, v.vars) } : {}),
    };
  });
  return {
    mishi: {
      task: m.task, room: { id: room.id, name: pick(room.name, lang), line: pick(room.line, lang) }, step: m.step, of: room.puzzles.length, puzzles,
      wrong: m.wrong, can_skip: canSkip(data, m), asked_at: m.asked_at ?? null, hint_at: hintAt(data, m), hint_wait_s: limits(data).hint_wait_s,
      ...(m.done ? { done: true, escaped: !m.skipped.length, ...(m.paid ? { paid: m.paid } : {}), escape: m.skipped.length ? null : pick(room.escape, lang) } : {}),
    },
  };
}

/* Her tool (Mishi, --for=yinyue): her pages — the open puzzle's and those behind it — and how to play them. `how` first. */
export function herMishi(content, state, now) {
  const data = mishiData(content), m = data && roomHere(state, now);
  if (!m || m.done) return null;
  const room = roomOf(data, m.room), dealt = dealOf(content, state, m), lang = state.lang;
  const pages = room.puzzles.map((p, i) => ({ step: i + 1, kind: p.kind, done: m.solved.includes(i) || m.skipped.includes(i), text: fmt(p.her, lang, dealt[i].vars) })).filter(x => x.step - 1 <= m.step);
  // The open mechanism's help, up to the tier he has asked for: how it plays first, then the hints (Hanli 10-27).
  const p = room.puzzles[m.step], tier = tierOf(m, m.step);
  const help = p?.help ? p.help.slice(0, tier).map(h => fmt(h, lang, dealt[m.step].vars)) : [];
  const how = lang === 'en'
    ? 'A hidden room. These old pages are yours alone — he cannot see them, and the page never shows them. When he asks how it works, tell him how it plays first (help 1), in a line or two, as yourself. Then hint only as far as `help` goes — never past the last tier he asked for. Ask what he sees on the mechanism. Never guess an answer or make one up: the mechanism judges every try. Do not read the page out whole for him to copy.'
    : '这是一间密室。这几页古籍只有你看得见、读得懂——他看不到，页面上也不会显示。他问怎么玩，先用你自己的话、一两句讲清玩法（help 第一条）；再提示，只说到 help 里他问到的那一条为止，别越过。问他机关上看见了什么。别猜答案，别编——对不对由机关说了算。别把整页原文念给他照抄。';
  return { how, open: true, room: pick(room.name, lang), step: m.step + 1, of: room.puzzles.length, pages, ...(help.length ? { help, tier } : {}) };
}

/* What he sees on the open mechanism now, in words for her (the try's own input shape; nothing of her page). */
function seenOf(v, input, turned, lang) {
  const en = lang === 'en', parts = input.split(',').filter(x => x !== '');
  const SEEN = {
    dial: () => { const [st, br] = parts.map(Number); const at = Number.isInteger(st) && Number.isInteger(br) && STEMS[st] && BRANCHES[br] ? `${STEMS[st]}${BRANCHES[br]}` : '?'; return en ? `The needle reads ${at}${turned ? `; turned locked ${turned} so far` : ''}.` : `针下是${at}${turned ? `，已扣转${turned}年` : ''}。`; },
    hand: () => (parts.length ? (en ? `Pressed: ${parts.map(id => wenName(id, 'en')).join(', ')}.` : `已按：${parts.map(id => wenName(id, 'zh')).join('、')}。`) : (en ? 'Nothing pressed yet.' : '还没按。')),
    luoshu: () => (parts.length ? (en ? `Tapped the squares of ${parts.map(i => v.page.grid[Number(i)]).join(', ')} dots.` : `已点：${parts.map(i => `${v.page.grid[Number(i)]}点`).join('、')}。`) : (en ? 'Nothing tapped yet.' : '还没点。')),
    stars: () => (en ? (parts.length ? 'One cluster picked.' : 'Nothing picked yet.') : (parts.length ? '已点了一簇。' : '还没点。')),
    scroll: () => (parts.length ? (en ? `Picked: ${parts.map(i => v.page.cols[Math.floor(Number(i) / 5)]?.[Number(i) % 5] ?? '?').join('')}.` : `已点：${parts.map(i => v.page.cols[Math.floor(Number(i) / 5)]?.[Number(i) % 5] ?? '?').join('')}。`) : (en ? 'Nothing picked yet.' : '还没点。')),
  };
  return SEEN[v.kind]?.() ?? '';
}

/* ── The verb ── */
export function mishi(state, content, ctx, args = {}) {
  const data = mishiData(content);
  if (!data) return refuse('no-mishi', null);
  const action = String(args.action ?? 'info');
  const act = ACTIONS[action];
  if (!act) return refuse('unknown-action', null, { actions: Object.keys(ACTIONS) });
  return act(state, content, ctx, args, data);
}
const view = (content, s, ctx) => mishiLook(content, s, ctx).mishi ?? null;
const lineOf = (pair, lang, vars = {}) => fmt(pair, lang, vars);

const ACTIONS = {
  info: (state, content, ctx) => ({ state: null, result: { ok: true, mishi: view(content, state, ctx) } }),

  open(state, content, ctx, args, data) {
    const e = entryHere(content, state, ctx.now);
    if (!e || (args.task && String(args.task) !== e.task)) return refuse('not-here', null);
    const m = openNow(state, ctx.now);
    if (m && m.task === e.task && !m.done) return { state: null, result: { ok: true, resumed: true, mishi: view(content, state, ctx) } };
    // Out of it today (the board still standing until 出去): not again until tomorrow.
    if (m && m.task === e.task && m.done) return refuse('done-today', null);
    if (openedToday(state, ctx.now) >= limits(data).per_day) return refuse('limit-today', lineOf({ zh: '今天不进暗室了，明天再来。', en: 'No more hidden rooms today; come back tomorrow.' }, state.lang));
    const s = clone(state), day = dayKey(ctx.now), seed = seedOf(state);
    // A room not paid this week first; among them the day's own pick.
    const paid = s.mishi_log?.paid ?? {};
    const fresh = e.rooms.filter(r => !recentlyPaid(data, paid[r], ctx.now));
    const pool = fresh.length ? fresh : e.rooms;
    const room = pool[draw(`${seed}|${day}`, e.task, pool.length)];
    s.mishi = { task: e.task, room, day, place: state.place, at: ctx.now.toISOString(), seed: `${seed}|${room}|${day}`, step: 0, step_at: ctx.now.toISOString(), wrong: 0, asked_at: null, hints: [], solved: [], skipped: [] };
    s.mishi_log = { day, n: openedToday(state, ctx.now) + 1, paid };
    return { state: s, result: { ok: true, opened: room, mishi: view(content, s, ctx) } };
  },

  try(state, content, ctx, args, data) {
    const m = roomHere(state, ctx.now);
    if (!m || m.done) return refuse('no-room', null);
    if (args.step != null && Number(args.step) !== m.step) return refuse('stale', null, { mishi: view(content, state, ctx) });
    const dealt = dealOf(content, state, m), room = roomOf(data, m.room), p = room.puzzles[m.step];
    const s = clone(state), sm = s.mishi;
    if (!checkInput(dealt[m.step], args.input)) {
      sm.wrong += 1;
      // Every few misses, her next help tier is offered unasked (limits.offer_after; Hanli 10-27).
      const every = limits(data).offer_after ?? 2, offer = sm.wrong % every === 0 && tierOf(sm, m.step) < HELP_TIERS;
      return { state: s, result: { ok: true, right: false, wrong: sm.wrong, can_skip: canSkip(data, sm), ...(offer ? { offer: true } : {}) } };
    }
    sm.solved.push(m.step);
    const line = lineOf(p.right, state.lang, dealt[m.step].vars);
    return advance(s, content, ctx, data, { right: true, line });
  },

  /* 问银月 (and unasked: a room opened, a mechanism new, a few misses): the next help tier opened and handed back as
     facts for her to say in her own words — with what he sees on the board now (`input`, the try's shape). Her clock
     starts too: the tier's text shows on the page only if she let it go by (`hint`). */
  ask(state, content, ctx, args, data) {
    const m = roomHere(state, ctx.now);
    if (!m || m.done) return refuse('no-room', null);
    if (args.step != null && Number(args.step) !== m.step) return refuse('stale', null);
    const room = roomOf(data, m.room), p = room.puzzles[m.step], dealt = dealOf(content, state, m), v = dealt[m.step], lang = state.lang;
    const s = clone(state), sm = s.mishi;
    const tier = Math.min(HELP_TIERS, tierOf(sm, m.step) + 1);
    sm.tiers = { ...(sm.tiers ?? {}), [m.step]: tier };
    sm.asked_at = ctx.now.toISOString();
    const told = (p.help ?? []).slice(0, tier).map(h => fmt(h, lang, v.vars));
    // Nobody to say it (`alone`: she sleeps in the token, or the phone, which has no chat): the page reads the tier at once.
    if (args.alone === true || args.alone === 'true' || args.alone === '1' || args.alone === 1) {
      sm.shown = { ...(sm.shown ?? {}), [m.step]: tier };
      if (!sm.hints.includes(m.step)) sm.hints.push(m.step);
    }
    const goal = p.goal ? fmt(p.goal, lang, v.page.n != null ? { n: v.page.n } : {}) : null;
    const before = room.puzzles.map((q, i) => (i < m.step && dealt[i].year != null ? yearName(dealt[i].year, lang) : null)).filter(Boolean);
    return { state: s, result: { ok: true, asked: true, tier, of: HELP_TIERS, step: m.step + 1, steps: room.puzzles.length, room: pick(room.name, lang), goal, help: told, seen: seenOf(v, String(args.input ?? ''), Number(args.turned) || 0, lang), wrong: sm.wrong, ...(before.length ? { read: before[before.length - 1] } : {}), hint_at: hintAt(data, sm), ...(sm.shown?.[m.step] === tier ? { hint: told[told.length - 1] } : {}) } };
  },

  asked(state, content, ctx, args, data) {
    const m = roomHere(state, ctx.now);
    if (!m || m.done) return refuse('no-room', null);
    const s = clone(state);
    s.mishi.asked_at = ctx.now.toISOString();
    return { state: s, result: { ok: true, hint_at: hintAt(data, s.mishi) } };
  },

  hint(state, content, ctx, args, data) {
    const m = roomHere(state, ctx.now);
    if (!m || m.done) return refuse('no-room', null);
    const at = hintAt(data, m);
    // Only after he asked her and the wait went by: she is the clue's first door, the page the fallback.
    // …or at once when nobody can say it (`alone`: the page found her not there to hear the tier).
    const alone = ['1', 'true', 1, true].includes(args.alone);
    if (!alone && (!at || ctx.now < new Date(at))) return refuse('too-soon', null, { hint_at: at });
    const dealt = dealOf(content, state, m), p = roomOf(data, m.room).puzzles[m.step];
    const s = clone(state), tier = Math.max(1, tierOf(m, m.step));
    if (!s.mishi.hints.includes(m.step)) s.mishi.hints.push(m.step);
    s.mishi.shown = { ...(s.mishi.shown ?? {}), [m.step]: tier };
    return { state: s, result: { ok: true, tier, hint: helpText(p, tier, state.lang, dealt[m.step].vars) } };
  },

  /* 出去 — out of the room, its board put away for the day (what he found was read on it first). */
  leave(state, content, ctx) {
    const m = roomHere(state, ctx.now);
    if (!m || !m.done) return refuse('no-room', null);
    const s = clone(state);
    s.tasks = { ...s.tasks, [m.task]: { status: 'done', period: periodKey('day', ctx.now), done_at: ctx.now.toISOString(), ...(m.skipped.length ? { skipped: true } : {}) } };
    return { state: s, result: { ok: true, left: m.task } };
  },

  skip(state, content, ctx, args, data) {
    const m = roomHere(state, ctx.now);
    if (!m || m.done) return refuse('no-room', null);
    if (!canSkip(data, m)) return refuse('not-stuck', null);
    const s = clone(state);
    s.mishi.skipped.push(m.step);
    return advance(s, content, ctx, data, { skipped: true });
  },
};

const recentlyPaid = (data, at, now) => Boolean(at) && now - new Date(at) < limits(data).repeat.days * 864e5;

/* The next mechanism, or out: escaped with nothing skipped pays (less within the week, and no
   find); with a skip, it pays nothing. The board stands with what he found until 出去 (leave). */
function advance(s, content, ctx, data, said) {
  const m = s.mishi, room = roomOf(data, m.room);
  m.step += 1; m.wrong = 0; m.asked_at = null; m.step_at = ctx.now.toISOString();
  if (m.step < room.puzzles.length) return { state: s, result: { ok: true, ...said, step: m.step, mishi: view(content, s, ctx) } };
  m.done = true;
  if (m.skipped.length) return { state: s, result: { ok: true, ...said, out: true, escaped: false, paid: null, mishi: view(content, s, ctx) } };
  const repeat = recentlyPaid(data, s.mishi_log?.paid?.[room.id], ctx.now);
  const g = data.pay.grant, factor = repeat ? limits(data).repeat.factor : 1;
  const rare = !repeat && room.rare && mix(hashOf(`${m.seed}|rare`)) % 1000 < Math.round(room.rare.chance * 1000);
  const grant = { ...g, wealth: Math.round((g.wealth ?? 0) * factor), ...(repeat || !room.find ? {} : { item: room.find.item, n: room.find.n ?? 1 }), ...(rare ? { more: { [room.rare.item]: 1 } } : {}) };
  const paid = pay(content, s, ctx, grant);
  if (!repeat) s.mishi_log = { ...s.mishi_log, paid: { ...(s.mishi_log?.paid ?? {}), [room.id]: ctx.now.toISOString() } };
  const named = id => (id ? itemName(itemOf(content, id), s, s.lang) ?? id : null);
  m.paid = { wealth: paid.wealth, item: paid.item ?? null, item_name: named(paid.item), n: grant.n ?? null, rare: rare ? room.rare.item : null, rare_name: rare ? named(room.rare.item) : null, repeat };
  return { state: s, result: { ok: true, ...said, out: true, escaped: true, line: said.line, escape: pick(room.escape, s.lang), paid: m.paid, mishi: view(content, s, ctx) } };
}
