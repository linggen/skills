// book-order.js — the book's 回 numbered as the book reads: ONE source for the
// reader (read-md.js) and the game (rules/hui.mjs, content.mjs's lint), so
// 「第N回」 means the same 回 in both. Pure: no DOM, no files.
//
/* ── The book's form (《鹿鼎记》's, Hanli 2026-09-29: 「按回卷改」; two lines,
   2026-10-01; interludes, 2026-10-02: 「两个线不应该并列写，减轻今线的戏份」):
   book.json's `volumes` (卷一 = eight 古 回 in four films of two, a 今
   interlude after each film, the book opening on 古一) hold their `hui` in
   the book's order; the reader walks them flat, 卷 by 卷, and NUMBERS them as
   it walks — never stored. The 古 回 count 第一回, 第二回 … through the book;
   a 今 interlude takes no 回 number — it reads 「今 · 一」 ("Now · 1"),
   counted within its own line. Each keeps a stable `id` (h01… 古, j01… 今)
   and its `line`; book.json's own `n` is the ordinal within its line, kept as
   `ord`. An id folded into another (`absorbs`: h03 into h02, j02 into j01)
   names the entry that absorbed it, so old links and old scene ids resolve. ── */

const DIGITS = '零一二三四五六七八九';
/// 1 → 一, 10 → 十, 14 → 十四, 20 → 二十, 99 → 九十九, 100 → 一百 (a 回's or a 卷's number).
export function cnNumber(n) {
  n = Math.floor(Number(n));
  if (!(n > 0)) return String(n);
  if (n >= 100) return `${cnNumber(Math.floor(n / 100))}百${n % 100 ? (n % 100 < 10 ? '零' : '') + (n % 100 < 20 && n % 100 >= 10 ? '一' : '') + cnNumber(n % 100) : ''}`;
  if (n < 10) return DIGITS[n];
  const t = Math.floor(n / 10), u = n % 10;
  return `${t === 1 ? '' : DIGITS[t]}十${u ? DIGITS[u] : ''}`;
}

/// 「第三回」, or "Chapter 3".
export const huiLabel = (n, lang = 'zh') => (lang === 'en' ? `Chapter ${n}` : `第${cnNumber(n)}回`);

/// 「今 · 一」, or "Now · 1": a 今 interlude's label — it takes no 回 number.
export const jinLabel = (n, lang = 'zh') => (lang === 'en' ? `Now · ${n}` : `今 · ${cnNumber(n)}`);

/// The two lines' tags: 古 (沈小满's world) and 今 (沈芒's). A 回 with no
/// `line` is 古 — the book before 2026-10-01.
export const LINES = { gu: { zh: '古', en: 'Then' }, jin: { zh: '今', en: 'Now' } };
export const lineOf = (h) => (h?.line === 'jin' ? 'jin' : 'gu');

/// The rule for drafts: a 回 flagged `draft` is left out — and so out of the
/// numbering — unless `opts.draft` (read.html?draft=1). The published view
/// therefore never shows a gap or a 第二回 with no 第一回; the draft view
/// numbers every 回 in place, as the book will read once they are approved.
export const shownIn = (opts) => (h) => !!opts?.draft || !h.draft;

/// Every id a 回 answers to: its own, then the ones it absorbed.
export const idsOf = (h) => [h.id, ...(h.absorbs ?? [])];

/// The id an old one now names: an old chapter id (`aliases`: 序章上's `00` →
/// h01), or a 回 folded into another (`absorbs`: h03 → h02); else itself.
export function resolveId(book, id) {
  if (id == null) return id;
  if (book?.aliases && Object.hasOwn(book.aliases, id)) return book.aliases[id];
  const into = (book?.volumes ?? []).flatMap((v) => v.hui ?? []).find((h) => (h.absorbs ?? []).includes(id));
  return into?.id ?? id;
}

/// Every 回 in book order, then the appendix: each numbered within its line by
/// its place in the view (`n`: 古 第五回 → 5, 今 「今 · 二」 → 2), with its
/// `label` (第五回 / 今 · 二), `line` and `tag` (古 / 今), `ord` (book.json's
/// ordinal within its line), `title` ({zh, en}: 「第五回　古 · 上联　下联」,
/// 「今 · 二　一句话」) and its `volume` ({id, n, name}). A book still in plain
/// `chapters` reads as it was.
export function bookEntries(book, opts = {}) {
  const count = { gu: 0, jin: 0 };
  const hui = (book?.volumes ?? []).flatMap((v) => (v.hui ?? []).filter(shownIn(opts)).map((h) => {
    const line = lineOf(h), tag = LINES[line], words = h.huimu ?? {};
    const n = (count[line] += 1);
    const label = line === 'jin' ? { zh: jinLabel(n), en: jinLabel(n, 'en') } : { zh: huiLabel(n), en: huiLabel(n, 'en') };
    const title = line === 'jin'
      ? { zh: `${label.zh}　${(words.zh ?? []).join('　')}`, en: `${label.en} · ${(words.en ?? []).join(' / ')}` }
      : { zh: `${label.zh}　${tag.zh} · ${(words.zh ?? []).join('　')}`, en: `${label.en} · ${tag.en} · ${(words.en ?? []).join(' / ')}` };
    return { ...h, ord: h.n, n, line, tag, volume: { id: v.id, n: v.n, name: v.name }, label, title };
  }));
  return [...hui, ...(book?.chapters ?? []), ...(book?.appendix ?? []).map((a) => ({ ...a, volume: null }))];
}
