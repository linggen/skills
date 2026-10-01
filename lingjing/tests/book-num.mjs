// The number the BOOK gives a 回 (「第N回」), counted from book.json's order as
// the reader counts it (book-order.js) — never written into a test, so the
// tests hold while 今 回 land between the 古 (2026-10-01: j01, h01, j02, h02 …).
import { bookEntries, huiLabel } from '../scripts/book-order.js';

export function bookNo(content, id, lang = 'zh') {
  const i = bookEntries(content.book).findIndex(h => h.id === id);
  if (i < 0) throw new Error(`${id} is no published 回 of the book`);
  return huiLabel(i + 1, lang);
}
