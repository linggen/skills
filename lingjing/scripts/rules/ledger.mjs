// rules/ledger.mjs — 恩仇簿: who was kind, who wronged, what was promised —
// and the player's own words at that moment (哇时刻 5, 「世界记得你」).
// Part of the rules engine; rules.mjs is its one door.
//
// An entry: {who, kind: 恩|仇|诺, what: {zh|en}, said?, chapter, day, at, by?, kept?, settled?}
//   said     the player's words, verbatim, ≤ QUOTE_MAX characters — only ever
//            text the engine saw them type (LINGGEN_USER_WORDS), never the model's copy
//   chapter, day   when: the chapter id and the save's day (dayKey); a reader
//            is told the 回 instead — the scene's `at`, else the chapter's (rules/hui.mjs)
//   at       where: the scene, or `place:<id>:<day>` on the open map — one entry
//            per person per `at`
//   by       'ling' when Ling wrote it through Remember; authored exits leave it out
//   kept     a 诺 settled: true kept, false broken; `settled` is its when
// It lives in the save (state.ledger): it travels with the cloud save and
// resets with it — never in ling-mem.
import { CAST } from '../content.mjs';
import { dayKey, personOf, pick } from '../state.mjs';
import { atScene, creatureOf, sceneOf } from './world.mjs';
import { chapterLabel, huiLabel, sceneHui } from './hui.mjs';

export const LEDGER_KINDS = ['恩', '仇', '诺'];
export const QUOTE_MAX = 30;
const WHAT_MAX = 60;

const refuse = (refused, why, extra = {}) => ({ state: null, result: { ok: false, refused, say: null, why, ...extra } });

/* Words as compared: whitespace runs made one space, the ends trimmed, and a
   quote's own wrapping marks (「」『』“”"') taken off. */
export const normQuote = text => String(text ?? '').replace(/\s+/gu, ' ').trim().replace(/^[「『“"'‘]+|[」』”"'’]+$/gu, '').trim();

/* What the player typed, as the engine handed it over — null when it did not
   (the page, an old engine): a quote is then refused, never trusted. A page's
   own report (`[scene] …`) is not the player's words. */
export function heardOf(ctx) {
  if (!Array.isArray(ctx?.words)) return null;
  return ctx.words.filter(w => typeof w === 'string' && !/^\s*\[[a-z]+\]/i.test(w)).map(normQuote).filter(Boolean);
}

/* The quote checked against what was typed: verbatim (after whitespace), one
   to QUOTE_MAX characters. */
function checkQuote(raw, heard) {
  const quote = normQuote(raw);
  if (!quote) return { refused: 'no-quote', why: 'The quote is empty.' };
  if ([...quote].length > QUOTE_MAX) return { refused: 'quote-too-long', why: `At most ${QUOTE_MAX} characters — trim it to a clean phrase inside what they typed.`, max: QUOTE_MAX };
  if (!heard) return { refused: 'unheard', why: 'The player\'s typed words are not available here, so no quote can be kept.' };
  if (!heard.some(w => w.includes(quote))) return { refused: 'not-said', why: 'The player did not type these words — a quote is only ever their own, verbatim.' };
  return { quote };
}

/* Where an entry is written: the scene being played, else the place on this day. */
export function ledgerAt(content, s, now) {
  if (atScene(content, s)) return sceneOf(content, s).id;
  return `place:${s.place ?? '-'}:${dayKey(now)}`;
}

/* A person in the world (people.json, a slot as the one it stands for), the
   companion, or a named creature — by id or by name in either language. */
export function whoOf(content, s, raw) {
  const key = String(raw ?? '').trim();
  if (!key) return null;
  const people = content.people?.people ?? [];
  const named = (x) => x?.name && [x.name.zh, x.name.en].some(n => n && n.toLowerCase() === key.toLowerCase());
  const person = personOf(content, s, key) ?? people.find(named);
  if (person) return { id: person.id, name: person.name };
  const cast = Object.entries(CAST).find(([id, name]) => id === key || named({ name }));
  if (cast) return { id: cast[0], name: cast[1] };
  const beast = creatureOf(content, key) ?? content.creatures.creatures.find(named);
  return beast?.name ? { id: beast.id, name: beast.name } : null;
}

/* The name an entry's person goes by, in the player's language. */
export const ledgerName = (content, s, who, lang = s.lang) => pick(whoOf(content, s, who)?.name, lang) ?? who;

/* A 诺 settled: the oldest open promise to `who`, kept or broken — or null. */
export function settlePromise(s, who, kept, when) {
  const i = (s.ledger ?? []).findIndex(e => e.who === who && e.kind === '诺' && e.kept == null);
  if (i < 0) return null;
  const e = { ...s.ledger[i], kept: Boolean(kept), settled: when };
  s.ledger = s.ledger.map((x, j) => (j === i ? e : x));
  return e;
}

/* The open promises, oldest first. */
export const openPromises = s => (s.ledger ?? []).filter(e => e.kind === '诺' && e.kept == null);

/* An authored exit's `ledger` (his ruling, prologue-v3: the hero repays every
   debt once strong, good or bad): who and what, once each; a slot (`ban`) is
   written as the person it stands for, and the same debt is never written
   twice. `said: true` keeps the player's last typed line with it when it fits
   (≤ QUOTE_MAX, and not the choice's own label — a tap is not their words).
   An exit's `settles` marks a 诺 kept or broken. */
export function writeLedger(content, s, exit, ctx = {}) {
  const out = [];
  const now = ctx.now ?? new Date();
  const when = { chapter: s.chapter, day: dayKey(now) }, at = ledgerAt(content, s, now);
  for (const e of exit.ledger ?? []) {
    const who = personOf(content, s, e.who)?.id ?? e.who;
    if ((s.ledger ?? []).some(x => x.who === who && x.what?.zh === e.what.zh)) continue;
    const said = e.said === true ? lastLine(ctx, exit) : null;
    const entry = { who, kind: e.kind, what: e.what, ...when, at, ...(said ? { said } : {}) };
    s.ledger = [...(s.ledger ?? []), entry];
    out.push(entry);
  }
  for (const x of exit.settles ?? []) {
    const who = personOf(content, s, x.who)?.id ?? x.who;
    const done = settlePromise(s, who, x.kept !== false, when);
    if (done) out.push(done);
  }
  return out;
}

function lastLine(ctx, exit) {
  const heard = heardOf(ctx);
  const line = heard?.[heard.length - 1];
  if (!line || [...line].length > QUOTE_MAX) return null;
  const labels = [exit.label?.zh, exit.label?.en].filter(Boolean).map(normQuote);
  return labels.includes(line) ? null : line;
}

/* Remember — Ling writes a real moment into the 簿 herself, and the rules
   check it: `who` is someone in the world; one entry per person per scene;
   the quote is the player's own typed words. `keep` / `break` settle a 诺. */
export function remember(state, content, ctx, args) {
  const action = String(args.action ?? 'write');
  if (!['write', 'keep', 'break'].includes(action)) return refuse('unknown-action', 'write, keep or break.', { actions: ['write', 'keep', 'break'] });
  const found = whoOf(content, state, args.who);
  if (!found) return refuse('unknown-person', 'Only a person in the world, the companion or a named creature goes into the 簿.', { who: args.who ?? null });
  const s = structuredClone(state), now = ctx.now ?? new Date();
  const when = { chapter: s.chapter, day: dayKey(now) };
  if (action !== 'write') {
    const e = settlePromise(s, found.id, action === 'keep', when);
    if (!e) return refuse('no-promise', `No open 诺 to ${pick(found.name, s.lang)}.`);
    return { state: s, result: { ok: true, settled: rowOf(content, s, e) } };
  }
  const kind = String(args.kind ?? '');
  if (!LEDGER_KINDS.includes(kind)) return refuse('bad-kind', 'kind is 恩, 仇 or 诺.', { kinds: LEDGER_KINDS });
  const what = String(args.what ?? '').replace(/\s+/gu, ' ').trim();
  if (!what || [...what].length > WHAT_MAX) return refuse('bad-what', `what: one short line (≤ ${WHAT_MAX} characters) of what happened.`);
  const at = ledgerAt(content, s, now);
  let said = null;
  if (args.quote != null && String(args.quote).trim()) {
    const q = checkQuote(args.quote, heardOf(ctx));
    if (!q.quote) return refuse(q.refused, q.why, q.max ? { max: q.max } : {});
    said = q.quote;
  }
  const i = (s.ledger ?? []).findIndex(e => e.who === found.id && e.at === at);
  if (i >= 0) {
    // The story wrote this person here already: the player's words may still
    // join its entry — once, and never over Ling's own.
    const here = s.ledger[i];
    if (!said || here.said || here.by === 'ling') return refuse('written-here', 'One entry per person per scene — this one is written already.', { entry: rowOf(content, s, here) });
    s.ledger = s.ledger.map((e, j) => (j === i ? { ...e, said } : e));
    return { state: s, result: { ok: true, quoted: rowOf(content, s, s.ledger[i]) } };
  }
  const entry = { who: found.id, kind, what: { [s.lang === 'en' ? 'en' : 'zh']: what }, ...when, at, by: 'ling', ...(said ? { said } : {}) };
  s.ledger = [...(s.ledger ?? []), entry];
  return { state: s, result: { ok: true, wrote: rowOf(content, s, entry) } };
}

/* One entry as a reader sees it: the name, the words, when. */
export function rowOf(content, s, e) {
  return {
    who: e.who, name: ledgerName(content, s, e.who), kind: e.kind, what: pick(e.what, s.lang),
    ...(e.said ? { said: e.said } : {}),
    // A small place, a short label — 「第三回」 (rules/hui.mjs `short`); the header keeps the whole.
    chapter: huiLabel(content, sceneHui(content, e.at), s.lang, 'short') ?? chapterLabel(content, s, content.chapters[e.chapter], s.lang, 'short') ?? null,
    ...(e.kept != null ? { kept: e.kept } : {}),
  };
}
