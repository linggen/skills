// rules/seals.mjs — 师父传印: the master passes on one hand seal a week; the learned seals are kept in the 印谱; each grows
// from 生 through 熟 to 精 by clean casts, and a seal at 熟 or 精 lends its spell strength where a tower-defence kit resolves
// it. Part of the rules engine; rules.mjs is its one door. (Hanli 2026-11-10: 「结印是亮点」 · 「可以，按这个做」.)
//
// ALL DATA is worlds/<id>/chuanyin.json (`content.chuanyin`): the master, the week's wait, the book of seals in teaching
// order (each the move ids it strengthens, its gestures, its gate and its story seed), the mastery half-points and levels,
// the pay in small games. Nothing here names a seal, a person or a spell.
//
// THE SAVE: `seals.book[id] = { at: ISO | null, via: 'lesson' | 'step' | 'story', hp }` — `hp` mastery in half-points (a camera
// cast adds `mastery.cast.camera`, a tapped one `cast.tap`: half as much). A save from before has no `seals`: a seal the
// story's own 讲堂 lesson taught (the book row's `seed.marks` held in `marks`) reads as learned at 生, undated — derived on
// read, never migrated, so an old save loads untouched and the week's wait never counts from a seed.
//
// THE DEAL (rules/happenings.mjs `needs`): `seals.lesson` — the week is out and a seal whose spell he has met (the kits' own
// gate, `from.marks`) is not yet taught; `seals.drill` — at least `drill.min` seals learned. The tasks' pay is the task's own
// (`own: {games}`, playpay.mjs playGrant).
//
// THE VERB `seals` (the page's; Ling reads, never writes — rules.mjs PAGE_ACTIONS): `plan` (what the board teaches or drills),
// `book` (the 印谱 rows, the strength each seal lends, the words), `card` (what the share picture says), and the writes `learn`
// and `cast`. Mastery never drops: a report only adds.
import { dayKey, pick, seedOf } from '../state.mjs';
import { figureOf } from '../seal-figure.js'; // the gestures' strokes (the hand-seal kit's poses)

export const cfgOf = content => content.chuanyin ?? null;
const lang = state => (state?.lang === 'en' ? 'en' : 'zh');
const marksOf = state => state?.marks ?? [];
const rowsOf = content => cfgOf(content)?.book ?? [];
const gateOpen = (row, marks) => !row.from || (row.from.marks ?? []).some(m => marks.includes(m));
const seeded = (row, marks) => (row.seed?.marks ?? []).some(m => marks.includes(m));
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** The words in the save's language. */
export const wordsOf = (content, state) => cfgOf(content)?.words?.[lang(state)] ?? {};
const fill = (tpl, o) => String(tpl ?? '').replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');

/** The seals learned: each `{ at, via, hp }` — what the save keeps, and the story's seeds beside it (derived). */
export function heldOf(content, state) {
  const out = {}, stored = state?.seals?.book ?? {}, marks = marksOf(state);
  for (const row of rowsOf(content)) {
    const s = stored[row.id];
    if (s) out[row.id] = { at: s.at ?? null, via: s.via ?? 'lesson', hp: num(s.hp) };
    else if (seeded(row, marks)) out[row.id] = { at: null, via: 'story', hp: 0 };
  }
  return out;
}

/** The level a seal's half-points stand at (the last whose `at` is reached), and the next one. */
export function levelAt(content, hp) {
  const levels = cfgOf(content)?.mastery?.levels ?? [];
  let i = 0;
  levels.forEach((l, k) => { if (hp >= l.at) i = k; });
  return { index: i, level: levels[i] ?? null, next: levels[i + 1] ?? null };
}
/** The strength a seal lends its spell at these half-points: a share added to 1 (0.1 = +10%); 0 at 生. */
export const powerAt = (content, hp) => levelAt(content, hp).level?.power ?? 0;

/** The half-points one clean cast adds, by how it was made: with the hands before a lens (`hands`) or tapped (`tap`, half). */
export const castHp = (content, how) => num(cfgOf(content)?.mastery?.cast?.[how === 'tap' ? 'tap' : 'hands']);

/* ── The week ── */
const dayNo = key => Math.floor(Date.parse(`${key}T00:00:00Z`) / 864e5);
/** What he held before today (a seal learned today is not counted): the deal's own view, so a lesson dealt this morning stays
    dealt after he has passed it (the board's win is counted at the place the deal stands — rules/happenings.mjs) — until that
    deal's play is stamped after the learn (`happen.games[task]`): the lesson is over then, and is not dealt again the same day. */
function heldBefore(content, state, now, task = null) {
  const today = dayKey(now), played = task && state?.happen?.games?.[task] ? Date.parse(state.happen.games[task]) : null;
  return Object.fromEntries(Object.entries(heldOf(content, state)).filter(([, h]) => !h.at || dayKey(new Date(h.at)) !== today || (played != null && played >= Date.parse(h.at))));
}
/** The days since the last seal was learned (a dated one; the story's seeds are undated), or null when none was. */
export function daysSince(content, state, now, held = heldOf(content, state)) {
  const dated = Object.values(held).map(h => h.at).filter(Boolean).map(a => dayKey(new Date(a)));
  if (!dated.length) return null;
  return dayNo(dayKey(now)) - Math.max(...dated.map(dayNo));
}
/** The next seal to teach by the book's order — his spell met (`from`), not yet learned — or null. `week`: only when the
    week since the last lesson is out (the errand's lesson is not held back by it). */
export function lessonRow(content, state, now, { week = true, dealing = false, task = null } = {}) {
  const cfg = cfgOf(content);
  if (!cfg) return null;
  const held = dealing ? heldBefore(content, state, now, task) : heldOf(content, state), since = daysSince(content, state, now, held);
  if (week && since != null && since < (cfg.week?.days ?? 7)) return null;
  return rowsOf(content).find(r => !held[r.id] && gateOpen(r, marksOf(state))) ?? null;
}
/** Is the 印谱 shown (the 储物袋's pane)? Once he holds a seal. */
export const sealsShown = (content, state) => Object.keys(heldOf(content, state)).length > 0;
/** The seals he knows, by the book's order. */
export const learnedRows = (content, state) => rowsOf(content).filter(r => heldOf(content, state)[r.id]);

/* A number in (0, 1) from a key (FNV-1a), the save's own coin: the phone and the Mac read the same. */
function coin(key) {
  let h = 0x811c9dc5;
  for (const ch of String(key)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (((h ^ (h >>> 16)) >>> 0) + 1) / 4294967297;
}
/** The drill's seals today: `drill.pick` of the ones he knows (two or three), a day's pick the same on both devices. Null
    with fewer than `drill.min` learned. `prefer`: seal ids the next board can use, chosen first. */
export function drillRows(content, state, now, { prefer = [], min = null } = {}) {
  const cfg = cfgOf(content), learned = learnedRows(content, state);
  if (!cfg || !learned.length || learned.length < (min ?? cfg.drill?.min ?? 2)) return null;
  const [lo, hi] = cfg.drill?.pick ?? [2, 3], day = dayKey(now), key = r => coin(`${seedOf(state)}|${day}|drill|${r.id}`) - (prefer.includes(r.id) ? 1 : 0);
  const n = Math.min(learned.length, lo + Math.floor(coin(`${seedOf(state)}|${day}|drill-n`) * (hi - lo + 1)));
  return [...learned].sort((a, b) => key(a) - key(b)).slice(0, n);
}

/* ── The gates a happening's deal may name (rules/happenings.mjs `needs`) ── */
const NEEDS = {
  'seals.lesson': (content, state, now, task) => Boolean(lessonRow(content, state, now, { dealing: true, task })),
  'seals.drill': (content, state, now) => Boolean(drillRows(content, state, now)),
  'seals.step': () => false, // the errand's own board: never dealt by the draw, only asked for (quests/guan.json)
};
/** Does the deal's `needs` hold now (`task`: the deal's board)? None named: it does. An unknown name: it does not. */
export const needsHold = (content, state, needs, now, task = null) => needs == null || Boolean(NEEDS[needs]?.(content, state, now, task));

/* ── What the page reads ── */
function rowView(content, state, row, held, now) {
  const w = wordsOf(content, state), l = lang(state), h = held[row.id] ?? null;
  const lv = levelAt(content, h?.hp ?? 0), power = lv.level?.power ?? 0, pct = Math.round(power * 100);
  const head = lv.level ? fill(power ? w.levelPower : w.level, { name: pick(row.name, l), level: pick(lv.level.name, l), pct }) : pick(row.name, l);
  const per = castHp(content, 'hands') || 1;
  const left = lv.next ? Math.max(1, Math.ceil((lv.next.at - (h?.hp ?? 0)) / per)) : 0;
  return {
    id: row.id, name: pick(row.name, l), spell: pick(row.spell, l), does: pick(row.does, l), line: pick(row.line, l),
    figures: row.figures, learned: Boolean(h), via: h?.via ?? null, at: h?.at ?? null, day: h?.at ? dayKey(new Date(h.at)) : null,
    hp: h?.hp ?? 0, level: h ? { id: lv.level.id, name: pick(lv.level.name, l), power } : null, head: h ? head : pick(row.name, l),
    next: h ? (lv.next ? fill(w.next, { n: left, level: pick(lv.next.name, l) }) : w.top) : null,
    gate: gateOpen(row, marksOf(state)), move: row.move,
  };
}
/** The 印谱: every seal of the book (an unlearned one as an outline), what each lends a kit (`bonus`: move id → 1 + power),
    the figures' geometry (`figures`: seal id → hands in a 100-box), the words. */
export function bookView(content, state, now = new Date()) {
  const cfg = cfgOf(content);
  if (!cfg) return { ok: true, rows: [], bonus: {}, words: {}, figures: {} };
  const held = heldOf(content, state), bonus = {}, figures = {};
  const rows = rowsOf(content).map(r => {
    const v = rowView(content, state, r, held, now);
    if (v.learned && v.level?.power) for (const m of r.move ?? []) bonus[m] = 1 + v.level.power;
    for (const f of r.figures ?? []) figures[f] ??= figureOf(content.handkit?.seals?.[f]);
    return v;
  });
  const due = lessonRow(content, state, now);
  return { ok: true, rows, bonus, figures, words: wordsOf(content, state), master: cfg.master, due: due?.id ?? null,
    names: Object.fromEntries(Object.entries(content.handkit?.seals ?? {}).filter(([id]) => rows.some(r => r.figures.includes(id))).map(([id, s]) => [id, { name: pick(s.name, lang(state)), glyph: s.glyph, hint: pick(s.hint, lang(state)), how: pick(s.how, lang(state)) }])) };
}

/** What a board teaches or drills now. `intent`: the task's — 'lesson' (the weekly lesson; a drill when no seal is due),
    'drill' (a drill; the lesson when one is due and he has too few), 'step' (the errand's: the chain's seals). Never a dead end
    but one: nothing to teach and too few to drill → `none`. */
export function planView(content, state, now = new Date(), intent = 'lesson') {
  const cfg = cfgOf(content);
  if (!cfg) return { ok: true, mode: 'none' };
  const book = bookView(content, state, now), rowOf = id => book.rows.find(r => r.id === id);
  const base = { ok: true, words: book.words, figures: book.figures, names: book.names, exam: cfg.exam ?? {}, mastery: cfg.mastery?.cast ?? {} };
  const teach = r => ({ ...base, mode: 'lesson', seal: rowOf(r.id) });
  const drill = (prefer = [], min = null) => {
    const rows = drillRows(content, state, now, { prefer, min });
    return rows ? { ...base, mode: 'drill', seals: rows.map(r => rowOf(r.id)) } : null;
  };
  if (intent === 'step') {
    const held = heldOf(content, state), mine = (cfg.step?.seals ?? []).map(id => rowsOf(content).find(r => r.id === id)).filter(Boolean);
    const first = mine.find(r => !held[r.id] && gateOpen(r, marksOf(state)));
    if (first) return teach(first);
    // The errand's step is never a dead end: with one seal only (the second's spell not yet met) the drill is that one.
    return drill(cfg.step?.seals ?? [], 1) ?? { ...base, mode: 'none' };
  }
  const due = lessonRow(content, state, now);
  if (intent === 'drill') return drill() ?? (due ? teach(due) : { ...base, mode: 'none' });
  return (due ? teach(due) : drill()) ?? { ...base, mode: 'none' };
}

/** The share picture's facts: words and the seal's figures only — never his name, his 修为, a camera frame. */
export function cardView(content, state, id, now = new Date()) {
  const book = bookView(content, state, now), row = book.rows.find(r => r.id === id && r.learned);
  if (!row) return { ok: false, refused: 'not-learned', say: null };
  const w = book.words, ids = row.figures;
  return { ok: true, id, head: w.cardHead, learned: fill(w.cardLearned, { name: row.name }), line: row.line, does: row.does, level: row.level?.name ?? null,
    day: row.day ?? dayKey(now), brand: w.brand, figures: ids.map(f => ({ id: f, name: book.names[f]?.name ?? f, glyph: book.names[f]?.glyph ?? '', hands: book.figures[f]?.hands ?? [] })) };
}

/* ── The page's writes ── */
const refuse = (refused, extra = {}) => ({ state: null, result: { ok: false, refused, say: null, ...extra } });
const MOST_CASTS = 40; // one report, one board: a page that sends more is rounded down

/* A cast report: `casts` an object `{ id: n }` (or its JSON / `id:n,id:n`), `how` 'camera' | 'tap'. Learned seals only. */
function castsOf(args) {
  let c = args.casts;
  if (typeof c === 'string') {
    try { c = JSON.parse(c); } catch { c = Object.fromEntries(c.split(',').map(p => p.split(':')).filter(p => p[0])); }
  }
  if (c == null && args.id) c = { [String(args.id)]: args.n ?? 1 };
  return Object.entries(c && typeof c === 'object' ? c : {}).map(([id, n]) => [id, Math.max(0, Math.min(MOST_CASTS, Math.trunc(num(n))))]).filter(([, n]) => n > 0);
}

function withBook(state, content) {
  const s = structuredClone(state);
  s.seals = { ...(s.seals ?? {}), book: { ...(s.seals?.book ?? {}) } };
  const held = heldOf(content, state);
  for (const [id, h] of Object.entries(held)) s.seals.book[id] ??= { at: h.at, via: h.via, hp: h.hp }; // a seed becomes a row once it grows
  return s;
}

/** The `seals` verb: the page's reads and writes. */
export function seals(state, content, ctx, args = {}) {
  const cfg = cfgOf(content);
  if (!cfg) return refuse('no-book');
  const action = String(args.action ?? 'book'), now = ctx?.now ?? new Date();
  if (action === 'book') return { state: null, result: bookView(content, state, now) };
  if (action === 'plan') return { state: null, result: planView(content, state, now, String(args.intent ?? 'lesson')) };
  if (action === 'card') return { state: null, result: cardView(content, state, String(args.id ?? ''), now) };
  if (action === 'learn') return learn(state, content, now, args);
  if (action === 'cast') return cast(state, content, args);
  return refuse('unknown-action', { actions: ['book', 'plan', 'card', 'learn', 'cast'] });
}

/* A seal taught: passed in the 考. Only the seal the book would teach now (the week out, or the errand's own seals), once —
   a second report of the same is the same answer. The 考 itself is one clean cast. */
function learn(state, content, now, args) {
  const cfg = cfgOf(content), id = String(args.id ?? ''), row = rowsOf(content).find(r => r.id === id), how = args.how === 'tap' ? 'tap' : 'hands';
  if (!row) return refuse('no-such-seal');
  const held = heldOf(content, state);
  if (held[id]) return { state: null, result: { ok: true, learned: id, again: true, level: levelAt(content, held[id].hp).level?.id } };
  const via = args.via === 'step' ? 'step' : 'lesson';
  const due = via === 'step' ? (cfg.step?.seals ?? []).includes(id) && gateOpen(row, marksOf(state)) : lessonRow(content, state, now)?.id === id;
  if (!due) return refuse('not-due');
  const s = withBook(state, content);
  s.seals.book[id] = { at: now.toISOString(), via, hp: castHp(content, how) };
  return { state: s, result: { ok: true, learned: id, via, level: levelAt(content, s.seals.book[id].hp).level?.id, card: cardView(content, s, id, now) } };
}

/* Clean casts, in a lesson, a drill or a kit: the learned seals' half-points grow; a seal not learned counts nothing. */
function cast(state, content, args) {
  const how = args.how === 'tap' ? 'tap' : 'hands', per = castHp(content, how), held = heldOf(content, state);
  const gained = {}, ignored = [];
  const s = withBook(state, content);
  for (const [id, n] of castsOf(args)) {
    // A kit reports a move id (shoulu's `feijian`, the 手势斗法's `huodan`): a book seal answers to its own id or a move it strengthens.
    const row = rowsOf(content).find(r => r.id === id || (r.move ?? []).includes(id));
    if (!row || !held[row.id]) { ignored.push(id); continue; }
    const before = s.seals.book[row.id].hp;
    s.seals.book[row.id].hp = before + n * per;
    gained[row.id] = (gained[row.id] ?? 0) + n * per;
  }
  if (!Object.keys(gained).length) return { state: null, result: { ok: true, gained, ignored } };
  const up = Object.keys(gained).filter(id => levelAt(content, s.seals.book[id].hp).index > levelAt(content, held[id].hp).index);
  return { state: s, result: { ok: true, gained, ...(up.length ? { up } : {}), ...(ignored.length ? { ignored } : {}) } };
}
