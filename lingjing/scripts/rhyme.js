// rhyme.js — English 对对子's form, checked the same on the page (as he types)
// and in the rules (on submit), as couplet.js is for the Chinese: rules/duizi.mjs
// imports it, and so does the card. No file, no network: the syllable and rhyme
// table is worlds/<id>/rhymes.json (tools/rhyme-table.py, from the CMU
// Pronouncing Dictionary), handed in.
//
// A word the table does not know is counted by its spelling and never failed —
// when unsure, the player is not. Each check says `ok`, `bad`, `unsure` or
// `wait` (nothing to check yet); the form holds when none is `bad` or `wait`.
// Two kinds of rung: `word` (one word answered by its opposite: one word, not a
// form of the prompt's) and `line` (as many syllables, a rhyme on the last
// stressed syllable, no more of the prompt's words than `allow`).

/* A line's words: lower case, curly quotes straightened, hyphens and dashes split, outer quotes off. */
export const wordsOf = (s) => String(s ?? '').toLowerCase().replace(/[‘’ʼ]/g, "'").split(/[^a-z']+/)
  .map((w) => w.replace(/^'+|'+$/g, '')).filter((w) => /[a-z]/.test(w));

/* The table as a lookup (word → its pronunciations, each {n, tail}), built once per table. */
const LOOKUP = new WeakMap();
function lookupOf(table) {
  if (!table?.tails) return new Map();
  if (!LOOKUP.has(table)) {
    const m = new Map();
    for (const [tail, list] of Object.entries(table.tails)) {
      for (const e of list.split(' ')) {
        const at = e.search(/\d+$/);
        const w = e.slice(0, at);
        if (!m.has(w)) m.set(w, []);
        m.get(w).push({ n: Number(e.slice(at)), tail });
      }
    }
    LOOKUP.set(table, m);
  }
  return LOOKUP.get(table);
}

const SIBILANT = /(^|\.)(S|Z|SH|ZH|CH|JH)$/;
/* A word's pronunciations from the table — itself; an old `-'d` as its `-ed` (restor'd = restored);
   a possessive as its base plus the s. Null: unknown. */
export function soundsOf(table, word) {
  const m = lookupOf(table), w = String(word ?? '');
  if (m.has(w)) return m.get(w);
  if (w.endsWith("'d") && m.has(`${w.slice(0, -2)}ed`)) return m.get(`${w.slice(0, -2)}ed`);
  if (w.endsWith("'s") && m.has(w.slice(0, -2))) {
    return m.get(w.slice(0, -2)).map((p) => (SIBILANT.test(p.tail) ? { n: p.n + 1, tail: `${p.tail}.@.Z` } : { n: p.n, tail: `${p.tail}.Z` }));
  }
  return null;
}

/* The spelling's guess for an unknown word: its vowel groups, a silent final e off. */
export function guessSyllables(word) {
  const w = String(word ?? '').replace(/'/g, '');
  let n = (w.match(/[aeiouy]+/g) ?? []).length;
  if (n > 1 && /[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w)) n -= 1;
  if (n > 1 && /[^aeiouytd]ed$/.test(w)) n -= 1;
  return Math.max(1, n);
}

/* A line's syllables as a range over every pronunciation; an unknown word counts its guess ±1. */
export function syllablesOf(table, line) {
  let lo = 0, hi = 0, unknown = 0;
  for (const w of Array.isArray(line) ? line : wordsOf(line)) {
    const ps = soundsOf(table, w);
    if (ps) { lo += Math.min(...ps.map((p) => p.n)); hi += Math.max(...ps.map((p) => p.n)); continue; }
    const g = guessSyllables(w);
    unknown += 1; lo += Math.max(1, g - 1); hi += g + 1;
  }
  return { lo, hi, unknown };
}

/* Do two last words rhyme? Known: a rhyme tail they share. Unknown: their spelling from the last vowel on, else unsure. */
const spellTail = (w) => (w.replace(/'/g, '').match(/[aeiouy]+[^aeiouy]*$/) ?? [w])[0];
export function rhymeOf(table, a, b) {
  if (!a || !b) return 'wait';
  if (a === b) return 'bad';
  const pa = soundsOf(table, a), pb = soundsOf(table, b);
  if (pa && pb) return pa.some((p) => pb.some((q) => q.tail === p.tail)) ? 'ok' : 'bad';
  return spellTail(a) === spellTail(b) ? 'ok' : 'unsure';
}

/* Has a word any rhyme in the table but itself? (orange, month: none — a line ending so can only be answered by its count.) */
export function hasRhyme(table, word) {
  const ps = soundsOf(table, word);
  if (!ps || !table?.tails) return false;
  return ps.some((p) => (table.tails[p.tail] ?? '').split(' ').some((e) => e.replace(/\d+$/, '') !== word));
}

const baseOf = (w) => w.replace(/'s$/, '');
/* The prompt's words the answer reuses — distinct, past the free ones. */
export const sharedOf = (up, down, free = []) => {
  const u = new Set(up.map(baseOf));
  return [...new Set(down.map(baseOf).filter((w) => u.has(w) && !free.includes(w)))];
};
/* One word answered by another: the same word, or one inside the other (kind · unkind), is a copy. */
const formOfWord = (a, b) => a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)));

/* The syllables' verdict: within reach is `ok` (`unsure` past an unknown word); short is `wait`; long is `bad`, never past an unknown word. */
function lenOf(u, d, have) {
  if (!have) return 'wait';
  if (d.hi < u.lo) return 'wait';
  if (d.lo <= u.hi && d.hi >= u.lo) return u.unknown || d.unknown ? 'unsure' : 'ok';
  return u.unknown || d.unknown ? 'unsure' : 'bad';
}

const CHECKS = {
  word: [
    { id: 'one', of: (x) => (!x.down.length ? 'wait' : x.down.length === 1 ? 'ok' : 'bad') },
    { id: 'copy', of: (x) => (!x.down.length ? 'wait' : x.down.some((w) => x.up.some((v) => formOfWord(v, w))) ? 'bad' : 'ok') },
  ],
  line: [
    { id: 'len', of: (x) => lenOf(x.us, x.ds, x.down.length) },
    { id: 'rhyme', of: (x) => (lenOf(x.us, x.ds, x.down.length) === 'wait' ? 'wait' : rhymeOf(x.table, x.up.at(-1), x.down.at(-1))) },
    { id: 'copy', of: (x) => (sharedOf(x.up, x.down, x.free).length > x.allow ? 'bad' : x.down.length ? 'ok' : 'wait') },
  ],
};
export const RHYME_CHECK_IDS = { word: CHECKS.word.map((c) => c.id), line: CHECKS.line.map((c) => c.id) };
const READY = { word: (c) => c.one === 'ok', line: (c) => c.len === 'ok' || c.len === 'unsure' };

/* The form of an answer against its prompt — couplet.js's shape: each check's verdict,
   the words shared, whether it holds (`ok`) and whether it may be sent (`ready`).
   `n` and `have` are syllables (the fewest the words may have). */
export function checkRhyme(table, up, down, { kind = 'line', allow = 0, free = [] } = {}) {
  const k = CHECKS[kind] ? kind : 'line';
  const u = wordsOf(up), d = wordsOf(down);
  const x = { up: u, down: d, us: syllablesOf(table, u), ds: syllablesOf(table, d), table, allow, free };
  const checks = Object.fromEntries(CHECKS[k].map((c) => [c.id, c.of(x)]));
  const verdicts = Object.values(checks);
  return { n: x.us.lo, have: x.ds.lo, checks, shared: sharedOf(u, d, free), ok: !verdicts.includes('bad') && !verdicts.includes('wait'), ready: READY[k](checks) };
}

/* A prompt he gives (the reverse game): its words and syllables, within the teacher's longest. */
export function checkPrompt(table, up, max) {
  const u = wordsOf(up), s = syllablesOf(table, u);
  return { n: s.lo, words: u.length, kind: u.length === 1 ? 'word' : 'line', fits: u.length >= 1 && s.lo <= max };
}
