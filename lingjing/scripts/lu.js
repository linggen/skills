// lu.js — 九鼎录, the book of the spine (redesign-v2 § 六), and the chapter's
// title card. Pure drawing: the rules' `story` read in, HTML out, every
// word esc()'d. The page opens it from the 录 chip; nothing here costs a
// model turn, and nothing here writes.
import { esc } from './esc.js';

export const LU_WORDS = {
  zh: {
    chip: '录', title: '九鼎录', close: '合上', found: '已寻回 {n}/9', map: '九鼎',
    states: { found: '已寻回', current: '寻访中', dark: '未至' },
    now: '眼下：{what}', mystery: '谜：{q}', people: '人物谱', her: '{name}记起的', open: '悬而未决',
    kinds: { story: '途中所遇', tamed: '随行', fought: '交过手', known: '相识' },
    none: '还没有什么可记的。', ending: '终局 · {title}', noOpen: '眼下没有悬着的谜。',
    titleClose: '入章', sep: '',
  },
  en: {
    chip: 'Record', title: 'The Nine Cauldrons', close: 'Close', found: '{n}/9 found', map: 'The nine',
    states: { found: 'found', current: 'seeking', dark: 'not yet' },
    now: 'Now: {what}', mystery: 'The riddle: {q}', people: 'People met', her: 'What {name} remembers', open: 'Still open',
    kinds: { story: 'met on the way', tamed: 'walks with you', fought: 'fought', known: 'acquainted' },
    none: 'Nothing to record yet.', ending: 'The end · {title}', noOpen: 'No riddle open now.',
    titleClose: 'Begin', sep: ' ',
  },
};

const say = (t, vars) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const wordsOf = (lang) => LU_WORDS[lang] ?? LU_WORDS.zh;

/* The nine as a 3×3 of seals, in the order the story finds them: lit when
   found, glowing where the player seeks now, dark ahead (province only). */
function mapHtml(cauldrons, w) {
  return `<div class="lumap" aria-label="${esc(w.map)}">${cauldrons.map((c) => `<div class="ding ${esc(c.state)}" title="${esc(c.title ?? w.states[c.state] ?? '')}">
    <i aria-hidden="true"></i><b>${esc(c.province)}</b><span>${esc(w.states[c.state] ?? '')}</span></div>`).join('')}</div>`;
}

/* A chapter as a scroll: its intro, the scenes played stitched into one
   passage, and — the chapter being played — where it stands and its riddle. */
function chapterHtml(ch, w, open) {
  const recap = (ch.recap ?? []).join(w.sep);
  const now = ch.state === 'current' && ch.now ? `<p class="lunow">${esc(say(w.now, { what: ch.now }))}</p>` : '';
  const q = ch.mystery ? `<p class="luq${ch.state === 'done' ? ' dim' : ''}">${esc(say(w.mystery, { q: ch.mystery }))}</p>` : '';
  return `<details class="luch ${esc(ch.state)}"${open ? ' open' : ''}><summary>${esc(ch.title)}</summary>
    ${ch.intro ? `<p class="luintro">${esc(ch.intro)}</p>` : ''}${recap ? `<p class="lurecap">${esc(recap)}</p>` : ''}${now}${q}</details>`;
}

export function luHtml(book, { lang = 'zh', her = null } = {}) {
  const w = wordsOf(lang);
  if (!book?.ok) return `<div class="lu"><header class="luhead"><b>${esc(w.title)}</b><button class="act quiet" data-lu-close>${esc(w.close)}</button></header><p class="dim">${esc(w.none)}</p></div>`;
  const chapters = book.chapters ?? [];
  const last = chapters.length - 1;
  const people = (book.people ?? []).map((p) => `<span class="luperson ${esc(p.kind)}" title="${esc(p.from ?? '')}"><b>${esc(p.name)}</b><i>${esc(w.kinds[p.kind] ?? '')}</i></span>`).join('');
  const recalled = book.her?.length ? `<section class="lusec luher"><h3>${esc(say(w.her, { name: her ?? '' }))}</h3>${book.her.map((l) => `<blockquote>${esc(l)}</blockquote>`).join('')}</section>` : '';
  return `<div class="lu" role="dialog" aria-label="${esc(w.title)}">
    <header class="luhead"><b>${esc(w.title)}</b>${book.cauldrons?.length ? `<span class="dim">${esc(say(w.found, { n: book.found ?? 0 }))}</span>` : ''}
      ${book.ending ? `<span class="luend">${esc(say(w.ending, { title: book.ending.title }))}</span>` : ''}
      <button class="act quiet" data-lu-close>${esc(w.close)}</button></header>
    ${book.cauldrons?.length ? mapHtml(book.cauldrons, w) : ''}
    <section class="lusec">${chapters.length ? chapters.map((c, i) => chapterHtml(c, w, i === last)).join('') : `<p class="dim">${esc(w.none)}</p>`}</section>
    ${people ? `<section class="lusec"><h3>${esc(w.people)}</h3><div class="lupeople">${people}</div></section>` : ''}
    ${recalled}
    <section class="lusec"><h3>${esc(w.open)}</h3>${(book.open ?? []).length ? book.open.map((q) => `<p class="luq">${esc(q)}</p>`).join('') : `<p class="dim">${esc(w.noOpen)}</p>`}</section>
  </div>`;
}

/* The chapter's title card on the stage, once, when a chapter has just begun. */
export function titleCardHtml(chapter, lang = 'zh') {
  if (!chapter?.fresh || !chapter.intro) return '';
  const w = wordsOf(lang);
  return `<div class="titlecard" role="note"><b>${esc(chapter.title)}</b><p>${esc(chapter.intro)}</p>
    <button class="act" data-titlecard="${esc(chapter.id)}">${esc(w.titleClose)}</button></div>`;
}

export const luChipHtml = (lang, open) => `<button class="luchip" data-lu aria-expanded="${open ? 'true' : 'false'}" title="${esc(wordsOf(lang).title)}">${esc(wordsOf(lang).chip)}</button>`;
