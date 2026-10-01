// rules/hui.mjs — 卷 and 回: the game names its parts as the book does
// (Hanli, 2026-09-29: 「故事叫回和卷，游戏也需要一致的叫法」 — never 章).
// Part of the rules engine; rules.mjs is its one door.
//
// The words are the book's (story/<id>/book.json: each 卷's name, each 回's
// 回目); a scene says only which 回 it is (`hui`). A 回's NUMBER is its place
// in the book as the reader counts it (book-order.js bookEntries, one source
// for both): 《九鼎录》 runs 今 and 古 alternately from 今一, so 古一 (h01) is
// 「第二回」 here as on the page. The game plays the 古 line only. Every label the
// page and Ling show — the header, the close card, 「即将开放」, the 恩仇簿,
// the 九鼎录, the 前情提要 — is made here from those two, never written twice.
// The game's chapters (00-prologue, 00-waimen, 01-ji …) stay the internal
// unit: the map, the locks, the beta's wait. A 回 ends where the scenes'
// `hui` turns, which may be inside a chapter (序章's 第一回 → 第二回).
import { pick } from '../state.mjs';
import { bookEntries, cnNumber, lineOf } from '../book-order.js';

/* 1 → 一, 10 → 十, 13 → 十三, 21 → 二十一: the reader's (book-order.js). */
export const zhNumber = cnNumber;

/* The book's 回 by id, each with its 卷: {id, line, tag, ord, huimu, juan,
   at, n}. `at` is its place in the book, drafts and all — the order the game
   sorts by; `n` its number as the published book reads (bookEntries): a draft
   takes none, as on the page, and is named by nothing. Once per world. */
const BOOKS = new WeakMap();
function bookIndex(content) {
  if (!BOOKS.has(content)) {
    const juans = new Map((content.book?.volumes ?? []).map(v => [v.id, v]));
    const shown = new Map(bookEntries(content.book).filter(h => h.volume).map(h => [h.id, h.n]));
    const m = new Map();
    bookEntries(content.book, { draft: true }).filter(h => h.volume)
      .forEach((h, at) => m.set(h.id, { ...h, juan: juans.get(h.volume.id), at, n: shown.get(h.id) ?? null }));
    BOOKS.set(content, m);
  }
  return BOOKS.get(content);
}
export const huiOf = (content, id) => (id ? bookIndex(content).get(id) ?? null : null);
/* A 回's place in the book, for sorting (a 回 the book has not: last). */
export const huiOrder = (content, id) => huiOf(content, id)?.at ?? Infinity;

/* scene id → its 回 id. Once per world. */
const SCENES = new WeakMap();
export function sceneHui(content, id) {
  if (!SCENES.has(content)) {
    const m = new Map();
    for (const ch of Object.values(content.chapters ?? {})) for (const sc of Object.values(ch.scenes ?? {})) if (sc.hui) m.set(sc.id, sc.hui);
    SCENES.set(content, m);
  }
  return SCENES.get(content).get(id) ?? null;
}

/* A 回 named, in four sizes — the number the book's (古五, h05, is 第十回
   once 今 runs beside it); the two with the 回目 carry the line's tag, as the
   reader's title does, so a player who meets 第二回 first sees it is the 古:
     short  第十回                                       · Chapter 10
     juan   卷一 · 第十回                                 · Volume One · Chapter 10
     head   卷一 · 第十回　古 · 漏勺夜半通三关              · … · Then — the 回目's first line
     book   卷一 · 第十回　古 · 漏勺夜半通三关　萝卜一根收小狰 · … · Then — the 回目 whole
   null for a 回 the book does not have, or one still a draft. */
const FORMS = {
  short: (h, lang) => (lang === 'en' ? `Chapter ${h.n}` : `第${zhNumber(h.n)}回`),
  juan: (h, lang) => `${pick(h.juan.name, lang)} · ${FORMS.short(h, lang)}`,
  head: (h, lang) => `${tagged(h, lang)}${pick(h.huimu, lang)[0]}`,
  book: (h, lang) => `${tagged(h, lang)}${pick(h.huimu, lang).join(lang === 'en' ? ' / ' : '　')}`,
};
const tagged = (h, lang) => (lang === 'en' ? `${FORMS.juan(h, lang)} · ${h.tag.en} — ` : `${FORMS.juan(h, lang)}　${h.tag.zh} · `);
export function huiLabel(content, id, lang, form = 'juan') {
  const h = huiOf(content, id);
  return h?.n ? FORMS[form](h, lang) : null;
}

/* A chapter's 回, in the book's order. */
export const chapterHuis = (content, ch) => [...new Set(Object.values(ch?.scenes ?? {}).map(sc => sc.hui).filter(Boolean))]
  .sort((a, b) => huiOrder(content, a) - huiOrder(content, b));

/* A chapter's first 回: the book's own word (a 回 whose `opens` names the
   chapter — 古九 opens 00-zhuji though no scene of it is played yet) or, with
   none, its scenes' first. */
export function firstHui(content, ch) {
  const told = [...bookIndex(content).values()].filter(h => h.opens === ch?.id).sort((a, b) => a.at - b.at)[0]?.id;
  const played = chapterHuis(content, ch)[0];
  if (!told) return played ?? null;
  return !played || huiOrder(content, told) <= huiOrder(content, played) ? told : played;
}

/* The 回 the save stands in: its scene's; between scenes (the open map, a
   chapter over), the last scene passed of its chapter; before any, the
   chapter's first. null in a chapter with no 回 (one still to be rewritten). */
export function huiNow(content, state) {
  const ch = content.chapters?.[state.chapter];
  if (!ch) return null;
  const here = ch.scenes?.[state.scene]?.hui;
  if (here) return here;
  const passed = (state.done_scenes ?? []).filter(id => ch.scenes?.[id]?.hui);
  return passed.length ? ch.scenes[passed.at(-1)].hui : chapterHuis(content, ch)[0] ?? null;
}

/* A chapter as the player is told it: the 回 it stands in when it is the
   save's own, else its first — or, with no 回, its own title. */
export function chapterLabel(content, state, ch, lang = state.lang, form = 'juan') {
  const id = ch?.id === state.chapter ? huiNow(content, state) : firstHui(content, ch);
  return huiLabel(content, id, lang, form) ?? pick(ch?.title, lang) ?? null;
}

/* 「第十八回 · 即将开放」: a chapter still being written (`coming`), named by its first 回. */
export function comingOf(content, ch, lang) {
  const name = huiLabel(content, firstHui(content, ch), lang, 'short') ?? nextJuan(content, lang) ?? pick(ch.title, lang);
  return lang === 'en' ? `${name} · coming soon` : `${name} · 即将开放`;
}

/* A chapter with no 回 yet (the old spine, 卷二 on): named by the 卷 after the
   book's last — 「卷二」 — so the wait reads 「卷二 · 即将开放」. */
function nextJuan(content, lang) {
  const n = (content.book?.volumes ?? []).length + 1;
  return n > 1 ? (lang === 'en' ? `Volume ${n}` : `卷${zhNumber(n)}`) : null;
}

/* 「卷一 · 沉鼎 · 完」 when a 回 is its 卷's last of its own line; else null.
   The book's 卷 ends on 今十, but the game plays the 古 line: its 卷 ends at 古十. */
export const juanEndOf = (content, id, lang) => {
  const h = huiOf(content, id);
  if (!h || h.juan?.hui?.filter(x => lineOf(x) === h.line).at(-1)?.id !== id) return null;
  return lang === 'en' ? `${pick(h.juan.name, 'en')} · The End` : `${pick(h.juan.name, 'zh')} · 完`;
};

/* 「第六回 · 完」 — the book's number. */
export const endLabel = (content, id, lang) => {
  const name = huiLabel(content, id, lang, 'short');
  return name && (lang === 'en' ? `${name} · The End` : `${name} · 完`);
};

/* The 回 that has just ended, while its close stands: the save is on the
   first scene of a later 回 (none of it passed yet) and the last scene it
   passed was of the one before. Derived from the scenes' `hui` alone —
   nothing flags it — so it holds inside a chapter as well as across one.
   A chapter ended and waiting is story.mjs closeOf's. */
export function huiEnded(content, state) {
  const now = state.scene ? sceneHui(content, state.scene) : null;
  if (!now) return null;
  const passed = (state.done_scenes ?? []).map(id => sceneHui(content, id)).filter(Boolean);
  const last = passed.at(-1);
  if (!last || passed.includes(now) || huiOrder(content, last) >= huiOrder(content, now)) return null;
  return last;
}
