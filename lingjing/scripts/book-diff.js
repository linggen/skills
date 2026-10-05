// book-diff.js — 「只看改动」: what changed in a 回 since the reader last
// confirmed it (Hanli 2026-10-05: 「把新加的或改的内容变个颜色，右边给个link，
// 我能点过去只看改的地方……给我个按钮点了后，代表确认了，去掉link和颜色」).
// Computed by rule, never by a model: the two texts are cut into blocks
// (paragraphs, quotes, headings — the units both readers draw), aligned by an
// LCS over their keys; a changed block is then aligned sentence by sentence.
// A key is the block's words with the book's marks ({注=…}, {典=…}, **bold**)
// and all whitespace taken out, so a change to those alone is no change.
// Pure: no DOM, no files — the rules (rules/changes.mjs) run it for both the
// Mac reader and the phone, and read-md.js uses its keys and sentences to
// draw the marks it hands back. The phone's mirror of `keyOf` and
// `sentencesOf` is linggen-mobile lib/services/lingjing/jiuding_changes.dart.

const GLOSS = /\[([^\]\n]+)\]\{[^{}\n]*=[^{}\n]*\}/g;
const CLASSIC = /《([^》\n]+)》\{典=[^{}\n]+\}/g;
const TAG = /\{[^{}=\n]*=[^{}\n]*\}/g;
const BOLD = /\*\*([^*]+)\*\*/g;

/// A line's words as a reader sees them: `[x]{注=…}` → x, `《书》{典=…}` → 《书》,
/// any other `{k=v}` gone, `**x**` → x.
export const plainOf = (s) => String(s ?? '').replace(GLOSS, '$1').replace(CLASSIC, '《$1》').replace(TAG, '').replace(BOLD, '$1');

/// FNV-1a over UTF-16 code units, as 8 hex digits (the phone hashes the same way).
export function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/// The words with every space gone: two texts equal here are the same text.
export const bare = (plain) => String(plain ?? '').replace(/\s+/g, '');
/// A block's or a sentence's key, from its plain words.
export const keyOf = (plain) => fnv(bare(plain));

const ENDS = new Set(['。', '！', '？', '!', '?']);
// What still belongs to the sentence after its end: closing quotes and brackets,
// and `*` so `**快跑！**` stays whole in the source.
const CLOSERS = new Set(['。', '！', '？', '!', '?', '」', '』', '”', '’', '"', '）', ')', '*']);

/// A text cut into sentences: after 。！？ (and the closers that follow), and at
/// each line break. A piece that is only spaces is dropped. The same cut works
/// on the plain words and on the marked-up source line (the marks hold no 。).
export function sentencesOf(text) {
  const out = [];
  const push = (s) => { if (s.trim()) out.push(s); };
  let cur = '';
  const t = String(text ?? '');
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (c === '\n') { push(cur); cur = ''; continue; }
    cur += c;
    if (!ENDS.has(c)) continue;
    while (i + 1 < t.length && CLOSERS.has(t[i + 1])) cur += t[(i += 1)];
    push(cur);
    cur = '';
  }
  push(cur);
  return out;
}

const HEADING = /^(#{1,4})\s+(.*)$/;
const MEMORY = /^:::\s*忆\s+\d+/;
const SCENE = /^\s*(---|\*\*\*)\s*$/;

/// A 回's markdown (the hero already filled in) as the blocks the readers
/// draw: `{kind: 'para'|'quote'|'heading', text, key, nth}` — `text` the plain
/// words (lines joined by \n), `nth` the block's place among blocks of the same
/// key (so two 「……」 paragraphs are told apart). The file's first `# ` line is
/// the 回's title (set from book.json) and is left out; scene breaks, plates
/// and tables are not text and are left out too.
export function blocksOf(md) {
  // A writers' note goes; its line breaks stay, so a block's lines are the file's.
  const lines = String(md ?? '').replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, (c) => '\n'.repeat(c.split('\n').length - 1)).split('\n');
  const out = [], seen = new Map();
  let para = [], quote = [], table = false, titled = false, from = 0;
  // Each block keeps its source (`src`: the lines as written, a quote's without
  // its `>`) and where it stands in the file (`start`, `end`: line indices,
  // end exclusive) — what 改回原文 (rules/changes.mjs) rewrites.
  const add = (kind, rows, src, start, end, level) => {
    const text = rows.map(plainOf).join('\n').replace(/\n+$/, '');
    if (!bare(text)) return;
    const key = keyOf(text), nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    out.push({ kind, text, key, nth, src, start, end, ...(level ? { level } : {}) });
  };
  const flush = (at) => {
    if (para.length) add('para', para.map((l) => l.trim()), para.join('\n'), from, at);
    if (quote.length) add('quote', quote, quote.join('\n'), from, at);
    para = []; quote = []; table = false;
  };
  lines.forEach((line, i) => {
    const h = HEADING.exec(line);
    if (h) {
      flush(i);
      if (h[1].length === 1 && !titled) { titled = true; return; }
      add('heading', [h[2].trim()], h[2].trim(), i, i + 1, h[1].length);
      return;
    }
    if (MEMORY.test(line.trim()) || SCENE.test(line)) { flush(i); return; }
    if (/^\s*>/.test(line)) { if (para.length || table) flush(i); if (!quote.length) from = i; quote.push(line.replace(/^\s*>\s?/, '')); return; }
    if (/^\s*\|/.test(line)) { if (para.length || quote.length) flush(i); table = true; return; }
    if (!line.trim()) { flush(i); return; }
    if (quote.length || table) flush(i);
    if (!para.length) from = i;
    para.push(line);
  });
  flush(lines.length);
  return out;
}

/// A block as the book writes it: a heading's #s, a quote's `>`.
export const blockSrc = (b) => {
  const src = b.src ?? b.text;
  if (b.kind === 'heading') return `${'#'.repeat(b.level ?? 2)} ${src}`;
  if (b.kind === 'quote') return src.split('\n').map((l) => `> ${l}`).join('\n');
  return src;
};

/// The longest common subsequence of two key lists, as matched index pairs.
export function lcs(a, b) {
  const n = a.length, m = b.length;
  const w = m + 1, len = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      len[i * w + j] = a[i] === b[j] ? len[(i + 1) * w + j + 1] + 1 : Math.max(len[(i + 1) * w + j], len[i * w + j + 1]);
    }
  }
  const pairs = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { pairs.push([i, j]); i += 1; j += 1; }
    else if (len[(i + 1) * w + j] >= len[i * w + j + 1]) i += 1;
    else j += 1;
  }
  return pairs;
}

/// How alike two texts are: the Dice share of their character pairs (0…1).
export function likeness(a, b) {
  const grams = (s) => { const t = bare(s), m = new Map(); for (let i = 0; i < t.length - 1; i += 1) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
  const x = grams(a), y = grams(b);
  let both = 0, all = 0;
  for (const [g, c] of x) { both += Math.min(c, y.get(g) ?? 0); all += c; }
  for (const c of y.values()) all += c;
  return all ? (2 * both) / all : bare(a) === bare(b) ? 1 : 0;
}
/// Above this a new block is the old one rewritten, not a new one.
export const ALIKE = 0.4;

/// One changed block's sentences against its old self: which of the new
/// sentences are new (indices), and the old sentences that went, each placed
/// before the new sentence it sat ahead of (`at`; the count of sentences = the end).
export function sentenceDiff(oldText, newText) {
  const a = sentencesOf(oldText), b = sentencesOf(newText);
  const pairs = lcs(a.map(keyOf), b.map(keyOf));
  const keptB = new Set(pairs.map(([, j]) => j));
  const s = b.map((_, j) => j).filter((j) => !keptB.has(j));
  const gone = [];
  let pi = 0;
  a.forEach((sent, i) => {
    while (pi < pairs.length && pairs[pi][0] < i) pi += 1;
    if (pi < pairs.length && pairs[pi][0] === i) return;
    const at = pi < pairs.length ? pairs[pi][1] : b.length;
    // Placed after the new sentences that replaced it, when a rewrite stands there.
    const last = gone.at(-1);
    if (last && last.at === at) last.text.push(sent.trim());
    else gone.push({ at, text: [sent.trim()] });
  });
  return { s, gone };
}

/// The head of a block for the change list: its first ~12 characters.
export const headOf = (text, n = 12) => { const t = String(text ?? '').replace(/\s+/g, ''); return t.length > n ? `${t.slice(0, n)}…` : t; };

/// What changed from `oldMd` to `newMd` (both hero-filled; `oldMd` null = all
/// new). Returns `{count, items, marks, gone}`:
/// - `marks`: `[{key, nth, kind: 'new'|'changed', item, s?, gone?}]` — a new
///   or rewritten block of the new text (`s` its new sentences' indices,
///   `gone` its sentences that went: `[{at, text: [..]}]`);
/// - `gone`: `[{before: {key, nth}|null, text: [..], item}]` — old blocks
///   that went, shown as one small mark before the block now standing there
///   (null: at the end);
/// - `items`: `[{n, kind, head}]` — the change list, one per run of marked
///   blocks with nothing unchanged between them (from 1, in reading order);
///   `count` = items.length.
export function changesOf(oldMd, newMd) {
  const { items, marks, gone } = walk(oldMd, newMd);
  return { count: items.length, items, marks, gone };
}

/// The two texts aligned, in reading order: `seq` holds each old block that
/// went (`{cut: i, item}`) before the new block it stands ahead of, and each
/// new block (`{j, same: i}` when unchanged, `{j, item, from: i?}` when new or
/// rewritten from old block i) — what changesOf reports and confirmItem keeps.
function walk(oldMd, newMd) {
  const now = blocksOf(newMd);
  const was = oldMd == null ? [] : blocksOf(oldMd);
  const pairs = lcs(was.map((b) => b.key), now.map((b) => b.key));
  const same = new Map(pairs.map(([i, j]) => [j, i]));
  // Each gap between matched blocks: the old blocks that went and the new that came.
  const gaps = [];
  let pi = 0, pj = 0;
  for (const [i, j] of [...pairs, [was.length, now.length]]) {
    if (i > pi || j > pj) gaps.push({ old: range(pi, i), new: range(pj, j), end: j });
    pi = i + 1; pj = j + 1;
  }
  const mark = new Map(); // new index → mark
  const from = new Map(); // new index → the old block it was rewritten from
  const cut = new Map(); // new index it sits before (now.length = end) → old indices
  for (const g of gaps) {
    // A new block takes the most alike old block still ahead of it in the gap (order kept).
    let at = 0;
    for (const j of g.new) {
      let best = -1, score = ALIKE;
      for (let k = at; k < g.old.length; k += 1) {
        const l = likeness(was[g.old[k]].text, now[j].text);
        if (l > score) { score = l; best = k; }
      }
      if (best >= 0) { from.set(j, g.old[best]); at = best + 1; }
    }
    const takenOld = new Set(g.new.map((j) => from.get(j)).filter((i) => i != null));
    for (const j of g.new) {
      const o = from.get(j);
      mark.set(j, o == null ? { kind: 'new' } : { kind: 'changed', ...sentenceDiff(was[o].text, now[j].text) });
    }
    // An old block that went sits before the first new block of the gap
    // rewritten from a later old block, else at the gap's end.
    for (const i of g.old) {
      if (takenOld.has(i)) continue;
      const pos = g.new.find((j) => (from.get(j) ?? -1) > i) ?? g.end;
      (cut.get(pos) ?? cut.set(pos, []).get(pos)).push(i);
    }
  }
  // Items: runs of marked blocks and cuts with no unchanged block between.
  const items = [], marks = [], gone = [], seq = [];
  let open = null;
  const item = (kind, head) => {
    if (open) { if (open.kind !== kind) open.kind = 'mixed'; return open.n; }
    open = { n: items.length + 1, kind, head };
    items.push(open);
    return open.n;
  };
  for (let j = 0; j <= now.length; j += 1) {
    if (cut.has(j)) {
      const olds = cut.get(j), text = olds.map((i) => was[i].text);
      const n = item('removed', `删：${headOf(text[0])}`);
      gone.push({ before: j < now.length ? { key: now[j].key, nth: now[j].nth } : null, text, item: n });
      for (const i of olds) seq.push({ cut: i, item: n });
    }
    if (j === now.length) break;
    const m = mark.get(j);
    if (!m) { open = null; seq.push({ j, same: same.get(j) }); continue; }
    // A rewritten block is listed by what is new in it, not by its opening
    // words (Hanli 2026-10-05: a paragraph edited again after he confirmed it
    // read as the whole paragraph back) — the first new sentence, else the
    // first that went.
    const sents = m.kind === 'changed' ? sentencesOf(now[j].text) : null;
    const head = m.kind !== 'changed' ? headOf(now[j].text)
      : m.s.length ? headOf(sents[m.s[0]]) : m.gone.length ? `删：${headOf(m.gone[0].text[0])}` : headOf(now[j].text);
    const out = { key: now[j].key, nth: now[j].nth, kind: m.kind, item: item(m.kind, head) };
    if (m.kind === 'changed') { out.s = m.s; if (m.gone.length) out.gone = m.gone; }
    marks.push(out);
    seq.push({ j, item: out.item, from: from.get(j) });
  }
  return { was, now, seq, items, marks, gone };
}

/// 「改回原文」: `newMd` with change `n` put back as `oldMd` has it — a
/// rewritten block back to its old words, a new block gone, a cut block back
/// in its place — every other line of `newMd` as it was. Returns `{md,
/// swapped: [{now, was}], dropped: [now], restored: [was]}` (block texts as
/// written), or null when there is no change n.
export function revertItem(oldMd, newMd, n) {
  const { was, now, seq, items } = walk(oldMd, newMd);
  if (!items.some((it) => it.n === n)) return null;
  const lines = String(newMd).replace(/\r\n/g, '\n').split('\n');
  const swap = new Map(), before = new Map();
  const swapped = [], dropped = [], restored = [];
  seq.forEach((e, k) => {
    if (e.item !== n) return;
    if ('cut' in e) {
      // Before the next block of the new text, or at the end.
      const next = seq.slice(k + 1).find((x) => 'j' in x);
      const at = next ? now[next.j].start : lines.length;
      (before.get(at) ?? before.set(at, []).get(at)).push(blockSrc(was[e.cut]));
      restored.push(blockSrc(was[e.cut]));
    } else if (e.from != null) {
      swap.set(now[e.j].start, { end: now[e.j].end, text: blockSrc(was[e.from]) });
      swapped.push({ now: blockSrc(now[e.j]), was: blockSrc(was[e.from]) });
    } else {
      swap.set(now[e.j].start, { end: now[e.j].end, text: null });
      dropped.push(blockSrc(now[e.j]));
    }
  });
  const out = [];
  for (let i = 0; i <= lines.length; i += 1) {
    for (const t of before.get(i) ?? []) {
      if (out.length && out.at(-1).trim()) out.push('');
      out.push(...t.split('\n'), '');
    }
    if (i === lines.length) break;
    const s = swap.get(i);
    if (!s) { out.push(lines[i]); continue; }
    if (s.text != null) out.push(...s.text.split('\n'));
    else if (!(lines[s.end] ?? '').trim() && s.end < lines.length) i = s.end; // the blank after it goes too
    i = Math.max(i, s.end - 1);
  }
  while (out.length > 1 && !out.at(-1).trim() && !out.at(-2).trim()) out.pop();
  return { md: out.join('\n'), swapped, dropped, restored };
}

/// Blocks as the text they stand for, in the book's own markdown (marks kept)
/// — what a confirmed version is kept as once a part of it was confirmed
/// (blocksOf reads it back to the same blocks: a title line first).
export function blocksMd(blocks, title = '# 　') {
  return `${title}\n\n${blocks.map(blockSrc).join('\n\n')}\n`;
}

/// A file's title line (its first `# `), which blocksOf leaves out.
export const titleOf = (md) => String(md ?? '').split('\n').find((l) => /^#\s/.test(l)) ?? '# 　';

/// 「确认这一处」: the confirmed version with change `n` (changesOf's item n)
/// taken in and every other change left as it was — so the next changesOf
/// shows them all but that one. Returns the new confirmed text, or null when
/// there is no such change.
export function confirmItem(oldMd, newMd, n) {
  const { was, now, seq, items } = walk(oldMd, newMd);
  if (!items.some((it) => it.n === n)) return null;
  const keep = [];
  for (const e of seq) {
    if ('cut' in e) { if (e.item !== n) keep.push(was[e.cut]); continue; }
    if (e.item == null || e.item === n) keep.push(now[e.j]);
    else if (e.from != null) keep.push(was[e.from]);
  }
  return blocksMd(keep, titleOf(oldMd));
}

const sentKey = (x) => keyOf(plainOf(x));

/// What a commit did to a 回, as keys: the sentences it brought in and took
/// out, and the blocks it added and cut. Several commits merge into one.
export function commitDelta(parentMd, childMd, into = { added: new Set(), removed: new Set(), addedBlocks: new Set(), removedBlocks: new Set() }) {
  const { was: P, now: K, seq } = walk(parentMd, childMd);
  for (const e of seq) {
    if ('cut' in e) { into.removedBlocks.add(P[e.cut].key); for (const x of sentencesOf(P[e.cut].text)) into.removed.add(keyOf(x)); continue; }
    if (e.item == null) continue;
    if (e.from == null) { into.addedBlocks.add(K[e.j].key); for (const x of sentencesOf(K[e.j].text)) into.added.add(keyOf(x)); continue; }
    const a = sentencesOf(P[e.from].text).map(keyOf), b = sentencesOf(K[e.j].text).map(keyOf);
    const sa = new Set(a), sb = new Set(b);
    for (const k of b) if (!sa.has(k)) into.added.add(k);
    for (const k of a) if (!sb.has(k)) into.removed.add(k);
  }
  return into;
}

/// 「记为已确认」 by what commits did (Hanli's dictated edits, 2026-10-05):
/// the confirmed version moves toward the text now — never away from it — by
/// those commits' doing alone: in a rewritten block, the new sentences they
/// brought in come in and the ones they took out go; a block they added comes
/// in, one they cut goes. Every other change stays to be confirmed.
/// Returns `{md, taken}`.
export function acceptDelta(confMd, newMd, d) {
  const { was, now, seq } = walk(confMd, newMd);
  const keep = [];
  let taken = 0;
  for (const e of seq) {
    if ('cut' in e) {
      const b = was[e.cut];
      const theirs = d.removedBlocks.has(b.key) || sentencesOf(b.text).every((x) => d.removed.has(keyOf(x)));
      if (theirs) taken += 1; else keep.push(b);
      continue;
    }
    if (e.item == null) { keep.push(now[e.j]); continue; }
    const n = now[e.j];
    if (e.from == null) {
      const theirs = d.addedBlocks.has(n.key) || sentencesOf(n.text).every((x) => d.added.has(keyOf(x)));
      if (theirs) { keep.push(n); taken += 1; }
      continue;
    }
    // A rewritten block: their sentences in, their cuts out — sentence by sentence.
    const c = was[e.from];
    const cs = sentencesOf(c.src ?? c.text), ns = sentencesOf(n.src);
    const ck = cs.map(sentKey), nk = ns.map(sentKey);
    const pairs = lcs(ck, nk);
    const keptC = new Set(pairs.map(([i]) => i)), keptN = new Set(pairs.map(([, j]) => j));
    const out = [];
    let ci = 0;
    const flushC = (upto) => { for (; ci < upto; ci += 1) if (keptC.has(ci) || !d.removed.has(ck[ci])) out.push(cs[ci]); };
    ns.forEach((sent, j) => {
      const pair = pairs.find(([, pj]) => pj === j);
      if (pair) { flushC(pair[0]); out.push(cs[pair[0]]); ci = pair[0] + 1; return; }
      if (!keptN.has(j) && d.added.has(nk[j])) out.push(sent);
    });
    flushC(cs.length);
    const src = out.join('');
    if (src === cs.join('')) { keep.push(c); continue; }
    taken += 1;
    keep.push(bare(plainOf(src)) === bare(n.text) ? n : { ...c, src, text: plainOf(src) });
  }
  return { md: blocksMd(keep, titleOf(confMd)), taken };
}

/// 「记为已确认」 by words: the blocks of `newMd` holding `words` (marks and
/// spaces ignored) taken into the confirmed version as they now read, each
/// in the place of the old block it rewrote — nothing else.
export function acceptWords(confMd, newMd, words) {
  const { was, now, seq } = walk(confMd, newMd);
  const want = bare(plainOf(words));
  if (!want) return null;
  const hit = new Set(now.map((b, j) => (bare(b.text).includes(want) ? j : -1)).filter((j) => j >= 0));
  if (!hit.size) return null;
  const keep = [];
  let taken = 0;
  for (const e of seq) {
    if ('cut' in e) { keep.push(was[e.cut]); continue; }
    if (e.item == null || hit.has(e.j)) { keep.push(now[e.j]); if (e.item != null) taken += 1; }
    else if (e.from != null) keep.push(was[e.from]);
  }
  return { md: blocksMd(keep, titleOf(confMd)), taken };
}

const range = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k);

/// The marks of one 回 keyed for drawing: `mark(key, nth)` → its mark or null,
/// `cutBefore(key, nth)` → the cuts standing before that block, `cutsAtEnd`.
export function markIndex(changes) {
  const marks = new Map((changes?.marks ?? []).map((m) => [`${m.key}#${m.nth}`, m]));
  const cuts = new Map();
  const end = [];
  for (const g of changes?.gone ?? []) {
    if (!g.before) { end.push(g); continue; }
    const k = `${g.before.key}#${g.before.nth}`;
    (cuts.get(k) ?? cuts.set(k, []).get(k)).push(g);
  }
  return { mark: (key, nth) => marks.get(`${key}#${nth}`) ?? null, cutBefore: (key, nth) => cuts.get(`${key}#${nth}`) ?? [], cutsAtEnd: end };
}
