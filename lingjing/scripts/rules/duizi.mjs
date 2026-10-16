// rules/duizi.mjs — 对对子, an AI mini-game (design.md § AI mini-games; Hanli
// 2026-10-16). Part of the rules engine; rules.mjs is its one door.
//
// 先生出上联, the player writes the 下联. The rules own the form — length, the
// 下联's last tone, no character at the same place, no copying (scripts/
// couplet.js, the card checks the same as he types) — and the outcome: Ling
// grades only the fuzzy parts on the rubric (0–2 each, worlds/<id>/aigames.json
// `duizi.rubric`); the marks there combine both, pay and step the ladder.
// Reverse: he gives a 上联, the teacher answers — no score, no pay.
// 银月, awake, may give one hint a round and offer her own 下联 (her tool,
// `--for=yinyue`); asleep in the token, her part is not there at all.
// The classic 下联 reaches Ling's judging only, and the card once graded.
import { dayKey, pick, seedOf } from '../state.mjs';
import { clone, pay, refuse, spendStamina } from './core.mjs';
import { hashOf } from './travel.mjs';
import { herAwake, herAway } from './companion.mjs';
import { ofJuan } from './world.mjs';
import { checkCouplet, checkUpper, hanOf } from '../couplet.js';

const cfgOf = content => content.aigames?.duizi ?? null;
const text = v => String(v ?? '').trim();
const SEEN_KEEP = 60;

/* ════════ Where, who, which rungs ════════ */

/* The teacher where he stands: his place, his scene behind the player, his 卷
   open — and only in Chinese (couplets do not translate; design.md). */
function teacherHere(content, state, now) {
  const cfg = cfgOf(content);
  if (!cfg || state.lang !== 'zh') return null;
  const done = state.done_scenes ?? [];
  return (cfg.teachers ?? []).find(t => t.at === state.place && done.includes(t.after) && ofJuan(content, t, now)) ?? null;
}
const teacherOf = (content, id) => (cfgOf(content)?.teachers ?? []).find(t => t.id === id) ?? null;
const rungOf = (content, id) => (cfgOf(content)?.rungs ?? []).find(r => r.id === id) ?? null;
const whoName = (content, t, lang) => pick((content.people?.people ?? []).find(p => p.id === t.who)?.name, lang) ?? t.who;

/* Today's slot, the day's counts begun again; what was won stays. */
function dayOf(state, now) {
  const d = state.duizi ?? {};
  const keep = { good: d.good ?? {}, open: d.open ?? [], seen: d.seen ?? [] };
  return d.day === dayKey(now) ? { ...keep, ...d } : { ...keep, day: dayKey(now), played: 0, reversed: 0, round: null, rev: null };
}
/* A teacher's rungs he may play: the first always, then each he has opened. */
const rungsOpen = (t, d) => t.rungs.filter((id, i) => i === 0 || d.open.includes(id));
const herHere = (content, state) => herAwake(state) && !herAway(content, state);
const roundGraded = r => Boolean(r?.mark);
const roundPending = r => Boolean(r?.down) && !r.mark;

/* ════════ What the page and Ling see — never the classic 下联 before the grade ════════ */

const markBrief = (content, id, lang) => { const m = (cfgOf(content).marks ?? []).find(x => x.id === id); return m ? { id, name: pick(m.name, lang), good: Boolean(m.good) } : { id, name: id, good: false }; };

function roundBrief(content, state, r) {
  if (!r) return null;
  const lang = state.lang, rung = rungOf(content, r.rung);
  return {
    rung: r.rung, rung_name: pick(rung?.name, lang), up: r.up, allow: rung?.allow ?? 0,
    ...(r.down ? { down: r.down, form: r.form } : {}),
    ...(roundPending(r) ? { pending: true, sent_at: r.sent_at } : {}),
    ...(r.skipped ? { skipped: true } : {}),
    ...(roundGraded(r) ? { grades: r.grades, sum: r.sum, mark: markBrief(content, r.mark, lang), ref: r.ref, src: r.src, ...(r.paid ? { paid: r.paid } : {}) } : {}),
    ...(r.unlocked ? { unlocked: r.unlocked } : {}),
    ...(r.hint ? { hint_used: true } : {}),
    ...(r.her ? { her: r.her } : {}),
  };
}

export function duiziBrief(content, state, now) {
  const t = teacherHere(content, state, now);
  if (!t) return null;
  const cfg = cfgOf(content), d = dayOf(state, now), lang = state.lang;
  const open = rungsOpen(t, d);
  const her = herHere(content, state);
  return {
    teacher: whoName(content, t, lang), rounds_left: Math.max(0, cfg.rounds - d.played), reverse_left: Math.max(0, cfg.reverse - d.reversed),
    rungs: t.rungs.map(id => ({ id, name: pick(rungOf(content, id)?.name, lang), n: rungOf(content, id)?.n, open: open.includes(id), good: d.good[id] ?? 0, need: cfg.need })),
    rung: open.at(-1), max: Math.max(...t.rungs.map(id => rungOf(content, id)?.n ?? 0)), free: cfg.free ?? '',
    rubric: cfg.rubric.map(x => ({ id: x.id, name: pick(x.name, lang) })),
    ...(d.round ? { round: roundBrief(content, state, d.round) } : {}),
    ...(d.rev ? { rev: d.rev } : {}),
    ...(her ? { her: true } : {}),
  };
}

/* Ling's view: the brief, and while a 下联 waits, the rubric to grade by and the classic 下联 to judge by. */
const JUDGE_NOTE = 'Grade only the three rubric parts, 0–2 each, on the 下联 as written — never length, tone or repeated characters (the rules checked them: `form`). `reference` is the classic 下联, to judge by only: never say it before the grade lands; the card shows it after. Then speak as the teacher in his `voice`: one or two lines on THIS answer, no numbers, no rubric names.';
function lingView(content, state, now, extra = {}) {
  const d = dayOf(state, now), r = d.round, cfg = cfgOf(content), t = teacherOf(content, r?.teacher) ?? teacherHere(content, state, now);
  return {
    ok: true, ...extra, duizi: duiziBrief(content, state, now) ?? (r ? { round: roundBrief(content, state, r) } : null),
    ...(roundPending(r) ? { judge: { note: JUDGE_NOTE, up: r.up, down: r.down, form: r.form, reference: r.ref, rubric: cfg.rubric.map(x => ({ id: x.id, name: pick(x.name, 'zh'), about: x.about })) } } : {}),
    ...(t ? { voice: pick(t.voice, state.lang) } : {}),
  };
}

/* 银月's view — her note first (another member reads her call by its head). */
const HER_NOTE = [
  '对对子 — the teacher sets a 上联, the player answers. You are the proud 妖王 at his side: tease, never flatter.',
  'hint (once a round, only when the player asks or is stuck): call Couplet with action hint, then give ONE small pointer — a word kind, an image to pair — never the whole 下联, never the classic one.',
  'offer (once a round): your own 下联 to the same 上联 — call Couplet with action offer and `down` (as many characters as the 上联). Sometimes better than his, sometimes deliberately crooked for the fun of it — then own it, proudly. It scores nothing.',
  '【对对子】先生出上联，他对下联。你是他身边那位骄傲的妖王：可以逗他，不奉承。提示（每回合一次，他开口要或卡住时）：先调 Couplet（action hint），再给一点点——词性、该配的意象——绝不说出整句下联。你也可以对一句（每回合一次）：调 Couplet（action offer，down 与上联同字数）。有时比他对得好，有时故意歪一点，歪了也理直气壮。不计分。',
].join(' ');
function herView(content, state, now, extra = {}) {
  const r = dayOf(state, now).round;
  return { how: HER_NOTE, ok: true, ...extra, ...(r ? { round: { up: r.up, ...(r.down ? { his: r.down, form: r.form } : {}), ...(r.mark ? { mark: markBrief(content, r.mark, state.lang).name } : {}), hint_used: Boolean(r.hint), offered: Boolean(r.her) } } : { round: null, how_none: 'No couplet is set today.' }) };
}

const VIEWS = { ling: lingView, yinyue: herView, page: (content, state, now, extra) => ({ ok: true, ...extra, duizi: duiziBrief(content, state, now) }) };
const viewFor = (ctx, content, state, extra) => VIEWS[ctx.reader ?? 'page'](content, state, ctx.now, extra);
const done = (ctx, content, s, extra) => ({ state: s, result: viewFor(ctx, content, s, extra) });

/* ════════ The actions — who may take each ════════ */

/* The round's 上联: one not dealt lately on this rung, seeded by day, save and round. */
function dealUp(content, state, rung, d) {
  const all = rung.ladder, seen = new Set(d.seen);
  const fresh = all.filter(row => !seen.has(row[0]));
  const pool = fresh.length ? fresh : all;
  return pool[hashOf(`${d.day}|${seedOf(state)}|duizi|${rung.id}|${d.played}`) % pool.length];
}

function open(state, content, ctx, args, s, d) {
  const t = teacherHere(content, state, ctx.now), cfg = cfgOf(content);
  if (!t) return refuse('not-here', '这里没有出对子的先生。');
  if (roundPending(d.round)) return refuse('pending', '上一联先生还在看。', viewFor(ctx, content, state, {}));
  if (d.round && !roundGraded(d.round) && !d.round.skipped) return { state: null, result: viewFor(ctx, content, state, { again: true }) };
  if (d.played >= cfg.rounds) return refuse('rounds-done', `今天的对子对够了（${cfg.rounds} 联）。明日再来。`);
  const open_ = rungsOpen(t, d), id = text(args.rung) || open_.at(-1);
  if (!open_.includes(id)) return refuse('rung-shut', '这一级还没到。', { open: open_ });
  const empty = spendStamina(content, s, ctx, 'game');
  if (empty) return empty;
  const rung = rungOf(content, id), [up, ref, src] = dealUp(content, s, rung, d);
  d.played += 1;
  d.seen = [...d.seen.filter(x => x !== up), up].slice(-SEEN_KEEP);
  d.round = { teacher: t.id, rung: id, up, ref, src, down: null, at: ctx.now.toISOString() };
  s.duizi = d;
  return done(ctx, content, s, { opened: true });
}

function submit(state, content, ctx, args, s, d) {
  const r = d.round;
  if (!r || roundGraded(r) || r.skipped) return refuse('not-open', null, viewFor(ctx, content, state, {}));
  const down = hanOf(args.down).join('');
  if (r.down === down) return { state: null, result: viewFor(ctx, content, state, { again: true }) };
  if (r.down) return refuse('pending', '这一联已经交了，先生在看。', viewFor(ctx, content, state, {}));
  const form = checkCouplet(content.tones, r.up, down, { allow: rungOf(content, r.rung)?.allow ?? 0, free: cfgOf(content).free ?? '' });
  if (form.checks.len !== 'ok') return refuse('not-matched', `上联 ${form.n} 个字，下联也要 ${form.n} 个字。`, { form });
  Object.assign(r, { down, form, sent_at: ctx.now.toISOString() });
  s.duizi = d;
  return done(ctx, content, s, { submitted: true, form });
}

function skip(state, content, ctx, args, s, d) {
  const r = d.round;
  if (!r || r.down || r.skipped) return refuse('not-open', null);
  r.skipped = true;
  s.duizi = d;
  return done(ctx, content, s, { skipped: true });
}

/* The grade: three parts 0–2 (Ling's); the first mark that fits the sum and the form decides, pays, and steps the ladder. */
const gradeOf = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(2, Math.trunc(Number(v)))));
export const markFor = (cfg, sum, formOk) => cfg.marks.find(m => sum >= m.min && (!m.form || formOk)) ?? cfg.marks.at(-1);

function grade(state, content, ctx, args, s, d) {
  const cfg = cfgOf(content), r = d.round;
  if (!roundPending(r)) return refuse('not-pending', null, viewFor(ctx, content, state, {}));
  const grades = Object.fromEntries(cfg.rubric.map(x => [x.id, gradeOf(args[x.id])]));
  const missing = Object.keys(grades).filter(k => grades[k] == null);
  if (missing.length) return refuse('need-grades', null, { need: cfg.rubric.map(x => x.id), missing });
  const sum = Object.values(grades).reduce((a, b) => a + b, 0);
  const mark = markFor(cfg, sum, r.form.ok);
  Object.assign(r, { grades, sum, mark: mark.id, graded_at: ctx.now.toISOString() });
  r.paid = mark.pay ? pay(content, s, ctx, mark.pay) : null;
  const unlocked = mark.good ? stepLadder(content, d, r) : null;
  if (unlocked) r.unlocked = unlocked.name;
  s.duizi = d;
  return done(ctx, content, s, { graded: true, mark: markBrief(content, mark.id, s.lang), sum, ...(r.paid ? { paid: r.paid } : {}), ...(unlocked ? { unlocked } : {}) });
}

/* A good answer counts on its rung; `need` of them opens the teacher's next rung. */
function stepLadder(content, d, r) {
  const cfg = cfgOf(content), t = teacherOf(content, r.teacher);
  d.good = { ...d.good, [r.rung]: (d.good[r.rung] ?? 0) + 1 };
  const next = t?.rungs[t.rungs.indexOf(r.rung) + 1];
  if (!next || d.open.includes(next) || d.good[r.rung] < cfg.need) return null;
  d.open = [...d.open, next];
  return { id: next, name: pick(rungOf(content, next)?.name, 'zh') };
}

/* Reverse — his 上联 (the page's), the teacher's 下联 (Ling's): checked, shown, never scored. */
function reverse(state, content, ctx, args, s, d) {
  const t = teacherHere(content, state, ctx.now), cfg = cfgOf(content);
  if (!t) return refuse('not-here', '这里没有出对子的先生。');
  if (d.rev && !d.rev.down) return refuse('pending', '先生还在想你那一联。', viewFor(ctx, content, state, {}));
  if (d.reversed >= cfg.reverse) return refuse('reverse-done', `今天出给先生的上联够了（${cfg.reverse} 联）。明日再来。`);
  const max = Math.max(...t.rungs.map(id => rungOf(content, id)?.n ?? 0));
  const up = hanOf(args.up).join(''), shape = checkUpper(content.tones, up, max);
  if (!shape.fits) return refuse('bad-upper', `上联要 1 到 ${max} 个字。`, { shape });
  d.reversed += 1;
  d.rev = { up, tail: shape.tail, down: null, at: ctx.now.toISOString() };
  s.duizi = d;
  return done(ctx, content, s, { reversed: true, shape });
}

function answer(state, content, ctx, args, s, d) {
  if (!d.rev || d.rev.down) return refuse('not-open', null, viewFor(ctx, content, state, {}));
  const down = hanOf(args.down).join(''), n = hanOf(d.rev.up).length;
  const rung = (cfgOf(content).rungs ?? []).find(x => x.n === n);
  const form = checkCouplet(content.tones, d.rev.up, down, { allow: rung?.allow ?? 1, free: cfgOf(content).free ?? '' });
  if (form.checks.len !== 'ok') return refuse('not-matched', null, { form, need: n });
  Object.assign(d.rev, { down, form });
  s.duizi = d;
  return done(ctx, content, s, { answered: true, form });
}

/* 银月's: one hint a round, one 下联 of her own — never scored. */
function hint(state, content, ctx, args, s, d) {
  const r = d.round;
  if (!r || roundGraded(r) || r.skipped) return refuse('not-open', null, viewFor(ctx, content, state, {}));
  if (r.hint) return refuse('hint-used', null, viewFor(ctx, content, state, {}));
  r.hint = true;
  s.duizi = d;
  return done(ctx, content, s, { hint: true });
}

function offer(state, content, ctx, args, s, d) {
  const r = d.round;
  if (!r || r.skipped) return refuse('not-open', null, viewFor(ctx, content, state, {}));
  if (r.her) return refuse('offered', null, viewFor(ctx, content, state, {}));
  const down = hanOf(args.down).join('');
  const form = checkCouplet(content.tones, r.up, down, { allow: rungOf(content, r.rung)?.allow ?? 0, free: cfgOf(content).free ?? '' });
  if (form.checks.len !== 'ok') return refuse('not-matched', null, { form, need: form.n });
  r.her = { down, form };
  s.duizi = d;
  return done(ctx, content, s, { offered: true, form });
}

const read = (state, content, ctx) => ({ state: null, result: viewFor(ctx, content, state, {}) });

/* Who may take each action: the page's taps, Ling's grade and answer, 银月's hint and offer.
   Ling may submit too — only the player's own typed 下联, verbatim (guide `duizi`). */
const ACTIONS = {
  read: { by: ['page', 'ling', 'yinyue'], run: read },
  open: { by: ['page'], run: open },
  submit: { by: ['page', 'ling'], run: submit },
  skip: { by: ['page'], run: skip },
  reverse: { by: ['page'], run: reverse },
  grade: { by: ['ling'], run: grade },
  answer: { by: ['ling'], run: answer },
  hint: { by: ['yinyue'], run: hint },
  offer: { by: ['yinyue'], run: offer },
};

export function duizi(state, content, ctx, args = {}) {
  if (!cfgOf(content)) return refuse('not-here', null);
  if (state.lang !== 'zh') return refuse('zh-only', null);
  const reader = ctx.reader ?? 'page', action = text(args.action) || 'read', a = ACTIONS[action];
  if (!a) return refuse('unknown-action', null, { actions: Object.keys(ACTIONS) });
  if (!a.by.includes(reader)) return refuse('not-yours', null, { by: a.by });
  if (reader === 'yinyue' && !herHere(content, state)) return refuse('no-host', '银月不在身边。');
  const s = clone(state);
  return a.run(state, content, ctx, args, s, dayOf(s, ctx.now));
}
