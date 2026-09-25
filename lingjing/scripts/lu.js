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
    paipu: '牌谱 · {n}', paipuNote: '你手上的每一张牌，和它从哪里来。',
    how: { starter: '测灵根时所得', companion: '{creature}随你而来', tame: '收服{creature}', win: '胜{creature}所得', chance: '机缘所得', tale: '传闻《{tale}》', story: '{chapter}', old: '旧日所得' },
    at: '于{place}', kinds: { minion: '灵兽', spell: '法术' },
  },
  en: {
    chip: 'Record', title: 'The Nine Cauldrons', close: 'Close', found: '{n}/9 found', map: 'The nine',
    states: { found: 'found', current: 'seeking', dark: 'not yet' },
    now: 'Now: {what}', mystery: 'The riddle: {q}', people: 'People met', her: 'What {name} remembers', open: 'Still open',
    kinds: { story: 'met on the way', tamed: 'walks with you', fought: 'fought', known: 'acquainted' },
    none: 'Nothing to record yet.', ending: 'The end · {title}', noOpen: 'No riddle open now.',
    titleClose: 'Begin', sep: ' ',
    paipu: 'Cards · {n}', paipuNote: 'Every card you hold, and where it came from.',
    how: { starter: 'From the root test', companion: '{creature} came with you', tame: 'Tamed {creature}', win: 'Won from {creature}', chance: 'A chance taken', tale: 'The rumor “{tale}”', story: '{chapter}', old: 'From earlier days' },
    at: 'at {place}', kinds: { minion: 'Beast', spell: 'Spell' },
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

export function luHtml(book, { lang = 'zh', her = null, artBase = '' } = {}) {
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
    ${paipuHtml(book.cards, w, { artBase, her })}
    <section class="lusec"><h3>${esc(w.open)}</h3>${(book.open ?? []).length ? book.open.map((q) => `<p class="luq">${esc(q)}</p>`).join('') : `<p class="dim">${esc(w.noOpen)}</p>`}</section>
  </div>`;
}

/* 牌谱 — the deck as the road's memory (redesign-v2 § 五): each card, its
   cost, and where it was won. Read-only, like the rest of the book. */
function paipuHtml(cards, w, { artBase = '', her = null } = {}) {
  if (!cards?.length) return '';
  const origin = (f) => {
    const vars = { creature: f.creature ?? her ?? '', tale: f.tale ?? '', chapter: f.chapter ?? '' };
    const how = say(w.how[f.how] ?? w.how.old, vars);
    return f.place && f.how !== 'story' ? `${how} · ${say(w.at, { place: f.place })}` : how;
  };
  const row = (c) => `<div class="lucard">${c.art ? `<img src="${esc(artBase + c.art)}" alt="" loading="lazy">` : '<i class="noart" aria-hidden="true"></i>'}
    <div><b class="cost">${esc(c.cost ?? '')}</b> <b>${esc(c.name)}</b> <span class="small dim">${esc(w.kinds[c.kind] ?? '')}${c.atk != null ? ` · ${esc(c.atk)}/${esc(c.hp)}` : ''}</span>
    <div class="small">${esc(origin(c.from ?? {}))}${c.from?.day ? ` <span class="dim">· ${esc(c.from.day)}</span>` : ''}</div></div></div>`;
  return `<section class="lusec lupaipu"><h3>${esc(say(w.paipu, { n: cards.length }))}</h3><p class="small dim">${esc(w.paipuNote)}</p>${cards.map(row).join('')}</section>`;
}

/* The chapter's title card on the stage, once, when a chapter has just begun. */
export function titleCardHtml(chapter, lang = 'zh') {
  if (!chapter?.fresh || !chapter.intro) return '';
  const w = wordsOf(lang);
  return `<div class="titlecard" role="note"><b>${esc(chapter.title)}</b><p>${esc(chapter.intro)}</p>
    <button class="act" data-titlecard="${esc(chapter.id)}">${esc(w.titleClose)}</button></div>`;
}

export const luChipHtml = (lang, open) => `<button class="luchip" data-lu aria-expanded="${open ? 'true' : 'false'}" title="${esc(wordsOf(lang).title)}">${esc(wordsOf(lang).chip)}</button>`;
