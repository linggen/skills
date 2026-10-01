// book-order.js — the book's 回 numbered as the book reads: ONE source for the
// reader (read-md.js) and the game (rules/hui.mjs, content.mjs's lint), so
// 「第N回」 means the same 回 in both. Pure: no DOM, no files.
//
/* ── The book's form (《鹿鼎记》's, Hanli 2026-09-29: 「按回卷改」; two lines,
   2026-10-01: 「一句话标题，按你说的做」): book.json's `volumes` (卷 = twenty
   回, ten 古 and ten 今, alternating, opening on 今) hold its `hui` in the
   book's order; the reader walks them flat, 卷 by 卷, and NUMBERS them as it
   walks — 「第N回」 is never stored. Each 回 keeps a stable `id` (h01… 古,
   j01… 今) and its `line`; book.json's own `n` is the ordinal within its line
   (古一, 今一), kept as `ord`. ── */

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

/// The two lines' tags: 古 (沈小满's world) and 今 (沈芒's). A 回 with no
/// `line` is 古 — the book before 2026-10-01.
export const LINES = { gu: { zh: '古', en: 'Then' }, jin: { zh: '今', en: 'Now' } };
export const lineOf = (h) => (h?.line === 'jin' ? 'jin' : 'gu');

/// The rule for drafts: a 回 flagged `draft` is left out — and so out of the
/// numbering — unless `opts.draft` (read.html?draft=1). The published view
/// therefore never shows a gap or a 第二回 with no 第一回; the draft view
/// numbers every 回 in place, as the book will read once they are approved.
export const shownIn = (opts) => (h) => !!opts?.draft || !h.draft;

/// Every 回 in book order, then the appendix: each numbered by its place in
/// the view (`n`, `label` 第五回), with its `line` and `tag` (古 / 今), `ord`
/// (book.json's ordinal within its line), `title` ({zh, en}:
/// 「第五回　古 · 漏勺夜半通三关　萝卜一根收小狰」) and its `volume` ({id, n,
/// name}). A book still in plain `chapters` reads as it was.
export function bookEntries(book, opts = {}) {
  let n = 0;
  const hui = (book?.volumes ?? []).flatMap((v) => (v.hui ?? []).filter(shownIn(opts)).map((h) => {
    n += 1;
    const line = lineOf(h), tag = LINES[line], words = h.huimu ?? {};
    return {
      ...h,
      ord: h.n, n, line, tag,
      volume: { id: v.id, n: v.n, name: v.name },
      label: { zh: huiLabel(n), en: huiLabel(n, 'en') },
      title: { zh: `${huiLabel(n)}　${tag.zh} · ${(words.zh ?? []).join('　')}`, en: `${huiLabel(n, 'en')} · ${tag.en} · ${(words.en ?? []).join(' / ')}` },
    };
  }));
  return [...hui, ...(book?.chapters ?? []), ...(book?.appendix ?? []).map((a) => ({ ...a, volume: null }))];
}
