// rules/hui.mjs — 卷 and 回: the game names its parts as the book does
// (Hanli, 2026-09-29: 「故事叫回和卷，游戏也需要一致的叫法」 — never 章).
// Part of the rules engine; rules.mjs is its one door.
//
// The words are the book's (story/<id>/book.json: each 卷's name, each 回's
// number and 回目); a scene says only which 回 it is (`hui`). Every label the
// page and Ling show — the header, the close card, 「即将开放」, the 恩仇簿,
// the 九鼎录, the 前情提要 — is made here from those two, never written twice.
// The game's chapters (00-prologue, 00-waimen, 01-ji …) stay the internal
// unit: the map, the locks, the beta's wait. A 回 ends where the scenes'
// `hui` turns, which may be inside a chapter (序章's 第一回 → 第二回).
import { pick } from '../state.mjs';

const DIGITS = '〇一二三四五六七八九';
/* 1 → 一, 10 → 十, 13 → 十三, 21 → 二十一 (a book of ninety-nine 回 at most). */
export function zhNumber(n) {
  if (n < 10) return DIGITS[n];
  const tens = Math.floor(n / 10), ones = n % 10;
  return `${tens === 1 ? '' : DIGITS[tens]}十${ones ? DIGITS[ones] : ''}`;
}

/* The book's 回 by id, each with its 卷: {id, n, huimu, juan}. Once per world. */
const BOOKS = new WeakMap();
function bookIndex(content) {
  if (!BOOKS.has(content)) {
    const m = new Map();
    for (const juan of content.book?.volumes ?? []) for (const h of juan.hui ?? []) m.set(h.id, { ...h, juan });
    BOOKS.set(content, m);
  }
  return BOOKS.get(content);
}
export const huiOf = (content, id) => (id ? bookIndex(content).get(id) ?? null : null);

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

/* A 回 named, in four sizes:
     short  第五回                                  · Chapter 5
     juan   卷一 · 第五回                            · Volume One · Chapter 5
     head   卷一 · 第五回　漏勺夜半通三关              · … — the 回目's first line
     book   卷一 · 第五回　漏勺夜半通三关　萝卜一根收小狰 · … — the 回目 whole
   null for a 回 the book does not have. */
const FORMS = {
  short: (h, lang) => (lang === 'en' ? `Chapter ${h.n}` : `第${zhNumber(h.n)}回`),
  juan: (h, lang) => `${pick(h.juan.name, lang)} · ${FORMS.short(h, lang)}`,
  head: (h, lang) => `${FORMS.juan(h, lang)}${lang === 'en' ? ' — ' : '　'}${pick(h.huimu, lang)[0]}`,
  book: (h, lang) => `${FORMS.juan(h, lang)}${lang === 'en' ? ' — ' : '　'}${pick(h.huimu, lang).join(lang === 'en' ? ' / ' : '　')}`,
};
export function huiLabel(content, id, lang, form = 'juan') {
  const h = huiOf(content, id);
  return h ? FORMS[form](h, lang) : null;
}

/* A chapter's 回, in the book's order. */
export const chapterHuis = (content, ch) => [...new Set(Object.values(ch?.scenes ?? {}).map(sc => sc.hui).filter(Boolean))]
  .sort((a, b) => (huiOf(content, a)?.n ?? 0) - (huiOf(content, b)?.n ?? 0));

/* A chapter's first 回: the book's own word (a 回 whose `opens` names the
   chapter — 第九回 opens 01-ji though no scene of it is played yet) or, with
   none, its scenes' first. */
export function firstHui(content, ch) {
  const told = [...bookIndex(content).values()].filter(h => h.opens === ch?.id).sort((a, b) => a.n - b.n)[0]?.id;
  const played = chapterHuis(content, ch)[0];
  if (!told) return played ?? null;
  return !played || huiOf(content, told).n <= huiOf(content, played).n ? told : played;
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

/* 「第九回 · 即将开放」: a chapter still being written (`coming`), named by its first 回. */
export function comingOf(content, ch, lang) {
  const name = huiLabel(content, firstHui(content, ch), lang, 'short') ?? pick(ch.title, lang);
  return lang === 'en' ? `${name} · coming soon` : `${name} · 即将开放`;
}

/* 「第三回 · 完」. */
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
  if (!last || passed.includes(now) || (huiOf(content, last)?.n ?? 0) >= (huiOf(content, now)?.n ?? 0)) return null;
  return last;
}
