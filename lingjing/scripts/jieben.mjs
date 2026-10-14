// jieben.mjs — 节本: the game's own cut of a book passage (Hanli, 2026-10-14: 「可以，先做古三」).
//
// Players do not read 卷一's ~220k characters in play. So a scene passage may be condensed: its
// `story` (what the dialogue box plays, what rhythm.mjs counts) becomes about a third of the book's
// passage, and the book's own passage stands beside it, verbatim, as `story_full` (an exit: its
// `story_full`; the rest after a game: `story_after_full`). 「读原著」 opens the book at the box.
//
// The rule a 节本 keeps: every sentence comes from the book's own words, in the book's order —
// trimmed, joined, lightly bridged, never a new line or another voice. This module is that check,
// and the box's way back to the book's paragraph. Tolerance, stated:
// - a sentence (zh: cut at 。！？…, a closing quote kept; en: at . ! ? followed by a capital or a
//   quote) is measured against two neighbouring paragraphs of the original — a join may span them;
// - zh: its characters (punctuation aside) are covered by character pairs found there; en: its
//   words by word pairs. At least MIN of each sentence, and TOTAL of the whole passage;
// - each sentence's paragraph is at or after the last one's (the book's order; inside a paragraph
//   trimming may shuffle a clause, as the approved sample does: 「二十年前考过」 for 「考过了。二十年前。」);
// - a sentence shorter than SHORT units (「腿。」, "Legs.") is read with the one before it.
// Pure: no DOM, no fs.

export const MIN = 0.8, TOTAL = 0.9, SHORT = { zh: 4, en: 3 };

const MARKS = (t) => String(t ?? '')
  .replace(/\[([^\]\n]*)\]\{[^}\n]*\}/g, '$1')
  .replace(/\{[^}\n]*\}/g, '')
  .replace(/\*\*|⟪|⟫/g, '');
const PUNCT_ZH = /[\s，。！？、：；「」『』“”‘’—…（）()《》〈〉·,.!?;:'"*_-]/g;

/* The words a passage says, its marks gone: zh as one run of characters, en as lower-case words. */
export const unitsOf = (text, lang) => (lang === 'en'
  ? MARKS(text).toLowerCase().replace(/[’‘]/g, "'").split(/[^a-z0-9']+/).filter(Boolean)
  : [...MARKS(text).replace(PUNCT_ZH, '')]);

const parasOf = (text) => String(text ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/* A paragraph's sentences, as written (marks and all). */
export function sentencesOf(para, lang) {
  const t = MARKS(para).replace(/\s+/g, lang === 'en' ? ' ' : '').trim();
  const cut = lang === 'en' ? t.split(/(?<=[.!?…]["”’]?)\s+(?=["“‘(A-Z])/) : t.split(/(?<=[。！？…][」』”]?)(?![」』”。！？…])/);
  const out = [];
  for (const s of cut.map((x) => x.trim()).filter(Boolean)) {
    if (out.length && unitsOf(s, lang).length < SHORT[lang]) out[out.length - 1] += (lang === 'en' ? ' ' : '') + s;
    else out.push(s);
  }
  if (out.length > 1 && unitsOf(out[0], lang).length < SHORT[lang]) out.splice(0, 2, out[0] + (lang === 'en' ? ' ' : '') + out[1]);
  return out;
}

const key = (u, i, lang) => (lang === 'en' ? `${u[i]} ${u[i + 1]}` : u[i] + u[i + 1]);
const pairsOf = (u, lang) => { const g = new Set(); for (let i = 0; i + 1 < u.length; i += 1) g.add(key(u, i, lang)); return g; };
function covered(u, pairs, lang, ones) {
  if (u.length === 1) return ones.has(u[0]) ? 1 : 0; // a one-word line (「左边」 is two, "Left." one): found whole
  const c = new Array(u.length).fill(false);
  for (let i = 0; i + 1 < u.length; i += 1) if (pairs.has(key(u, i, lang))) { c[i] = true; c[i + 1] = true; }
  return c.filter(Boolean).length;
}

/* Each sentence of the game text (a passage, or its paragraphs as a list) read against the
   original: where it comes from (`at`, the original's paragraph index) and how much of it the
   book's own words cover (`cov`, 0–1). */
export function sourcesOf(game, full, lang = 'zh') {
  const orig = parasOf(full).map((p) => unitsOf(p, lang));
  const windows = orig.map((_, k) => pairsOf([...orig[k], ...(orig[k + 1] ?? [])], lang));
  const ones = orig.map((_, k) => new Set([...orig[k], ...(orig[k + 1] ?? [])]));
  const alone = orig.map((u) => [pairsOf(u, lang), new Set(u)]);
  // A window holds two paragraphs: the sentence's own is the one of the two that covers more of it.
  const cover = (u, k) => covered(u, alone[k][0], lang, alone[k][1]);
  const own = (u, k) => (k + 1 < orig.length && cover(u, k + 1) > cover(u, k) ? k + 1 : k);
  const rows = [];
  let home = 0;
  (Array.isArray(game) ? game : parasOf(game)).forEach((para, p) => {
    for (const s of sentencesOf(para, lang)) {
      const u = unitsOf(s, lang);
      let best = -1, at = -1;
      for (let k = home; k < orig.length; k += 1) {
        const n = covered(u, windows[k], lang, ones[k]);
        if (n > best) { best = n; at = k; }
        if (n === u.length) break;
      }
      if (at >= 0) at = own(u, at);
      rows.push({ para: p, s, at, n: u.length, hit: Math.max(0, best), cov: u.length ? Math.max(0, best) / u.length : 1 });
      if (at >= 0 && best >= MIN * u.length) home = at; // a sentence not from the book moves nothing
    }
  });
  return rows;
}

/* Does the game text come from its original, sentence by sentence, in order? The sentences that
   do not, and the whole passage's cover. */
export function checkJieben(game, full, lang = 'zh', { min = MIN, total = TOTAL } = {}) {
  const rows = sourcesOf(game, full, lang);
  const n = rows.reduce((a, r) => a + r.n, 0), hit = rows.reduce((a, r) => a + r.hit, 0);
  const cover = n ? hit / n : 1;
  const bad = rows.filter((r) => r.cov < min);
  return { ok: !bad.length && cover >= total, cover, bad, rows };
}

/* For each paragraph of the game text, the original paragraph it opens on — 读原著 opens the book
   there. Null for a paragraph the original does not hold. */
export function anchorsOf(game, full, lang = 'zh') {
  const rows = sourcesOf(game, full, lang), out = [];
  for (const r of rows) if (out[r.para] === undefined) out[r.para] = r.cov >= MIN ? r.at : null;
  return out;
}

/* A paragraph's opening words, as the reader finds them in the book: zh its first characters, en its first words. */
export const headOf = (para, lang = 'zh', n = lang === 'en' ? 6 : 12) => {
  const u = unitsOf(para, lang).slice(0, n);
  return lang === 'en' ? u.join(' ') : u.join('');
};
export { parasOf };
