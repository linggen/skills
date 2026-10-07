// The label the BOOK gives a 回 (「第N回」, or 「今 · N」 for a 今 interlude),
// computed from book.json's order as the reader computes it (book-order.js) —
// never written into a test, so the tests hold while the book's form moves
// (2026-10-02: 古 回 numbered 第一回…第八回, the 今 between them unnumbered; 第九回 since 古七 was split, 2026-10-07).
// An id folded into another (`absorbs`, h03 → h02) names the one that holds it.
import { bookEntries, resolveId } from '../scripts/book-order.js';

export function bookNo(content, id, lang = 'zh') {
  const h = bookEntries(content.book).find(e => e.id === resolveId(content.book, id));
  if (!h?.label) throw new Error(`${id} is no published 回 of the book`);
  return h.label[lang];
}
