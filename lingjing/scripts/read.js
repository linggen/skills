// read.js — 书: the novel the game is told from, read in the game's own frame
// (the app runs in a sandboxed iframe: every link here navigates in place, no
// new window). story/index.json names the books; a book's book.json its
// chapters and appendix; each chapter is a markdown file (read-md.js).
import { esc } from './esc.js';
import { fillHero, heroOf, renderMarkdown } from './read-md.js';
import { playMarks, wireMarks } from './marks.js';
import { content, verb, worldPath } from './rules.js';

const WORDS = {
  zh: { back: '← 回到灵境', toc: '目录', prev: '← 上一章', next: '下一章 →', none: '书还没有写。', failed: '这一章没能打开。', only: '这一章只有中文。' },
  en: { back: '← Back to Lingjing', toc: 'Contents', prev: '← Previous', next: 'Next →', none: 'The book is not written yet.', failed: 'This chapter could not be opened.', only: 'This chapter is in Chinese only.' },
};
const STORY = '../story/';
const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'en' ? 'en' : 'zh';
const w = WORDS[lang];
const pick = (pair) => (pair && typeof pair === 'object' ? pair[lang] ?? pair.zh ?? pair.en : pair ?? '');
const $ = (id) => document.getElementById(id);

/* A link back into this reader, the app's own query kept (app_mode and the rest). */
function hrefWith(changes) {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(changes)) (v == null ? q.delete(k) : q.set(k, v));
  return `read.html?${q.toString()}`;
}
function backHref() {
  const q = new URLSearchParams(location.search);
  for (const k of ['book', 'ch', 'lang']) q.delete(k);
  const s = q.toString();
  return `index.html${s ? `?${s}` : ''}`;
}

const getJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} ${r.status}`); return r.json(); };

async function main() {
  document.documentElement.lang = lang;
  $('back').textContent = w.back;
  $('back').href = backHref();
  $('langsw').innerHTML = ['zh', 'en'].map((l) => `<button data-lang="${l}" class="${l === lang ? 'on' : ''}">${l === 'zh' ? '中' : 'En'}</button>`).join('');
  $('langsw').addEventListener('click', (e) => { const l = e.target.closest('[data-lang]')?.dataset.lang; if (l) location.href = hrefWith({ lang: l }); });
  const index = await getJson(`${STORY}index.json`).catch(() => ({ books: [] }));
  const bookId = params.get('book') ?? index.books?.[0];
  if (!bookId) { $('chapter').innerHTML = `<p class="note">${esc(w.none)}</p>`; return; }
  const book = await getJson(`${STORY}${encodeURIComponent(bookId)}/book.json`);
  const all = [...(book.chapters ?? []), ...(book.appendix ?? [])];
  const at = Math.max(0, all.findIndex((c) => c.id === params.get('ch')));
  const ch = all[at];
  document.title = `${pick(book.title)} · ${pick(ch.title)}`;
  $('booktitle').textContent = pick(book.title);
  $('toc').setAttribute('aria-label', w.toc);
  $('toc').innerHTML = `<div class="toch">${esc(w.toc)}</div>` + all.map((c, i) => `<a href="${esc(hrefWith({ book: bookId, ch: c.id }))}" class="${i === at ? 'on' : ''}">${esc(pick(c.title))}</a>`).join('');
  $('toc').querySelector('a.on')?.scrollIntoView({ block: 'nearest' });
  // The player's name from the save (Look), asked beside the chapter; no save,
  // a failed or slow look reads with the drafts' hero — never blocks the book.
  const hero = Promise.race([verb('look'), new Promise((_, no) => setTimeout(no, 3000))]).then(heroOf, () => heroOf(null));
  // The world's art and notes: 小人书 panels and 注 figures, all in the text;
  // no notes file reads the words alone.
  const world = `worlds/${book.world ?? 'jiuding'}`;
  const notes = content(world, 'notes.json').then((n) => n?.notes ?? {}, () => ({}));
  // 银月's memories (`::: 忆 n`): the colour plates, from memories.json.
  const memories = content(world, 'memories.json').then((m) => m?.memories ?? [], () => []);
  try {
    const res = await fetch(`${STORY}${encodeURIComponent(bookId)}/${encodeURIComponent(ch.file)}`);
    if (!res.ok) throw new Error(String(res.status));
    const md = await res.text();
    $('chapter').innerHTML = (lang === 'en' ? `<p class="note">${esc(w.only)}</p>` : '') + renderMarkdown(fillHero(md, await hero), {
      panel: (id) => worldPath(world, `art/panels/${id}.webp`), notes: await notes, src: (file) => worldPath(world, file), lang,
      memory: memoryPlate(await memories, world),
    });
  } catch {
    $('chapter').innerHTML = `<p class="note">${esc(w.failed)}</p>`;
  }
  wireMarks($('chapter'));
  const prev = all[at - 1], next = all[at + 1];
  $('pager').innerHTML = `${prev ? `<a href="${esc(hrefWith({ book: bookId, ch: prev.id }))}">${esc(w.prev)} ${esc(pick(prev.title))}</a>` : '<span></span>'}${next ? `<a href="${esc(hrefWith({ book: bookId, ch: next.id }))}">${esc(pick(next.title))} ${esc(w.next)}</a>` : '<span></span>'}`;
  window.scrollTo(0, 0);
}

/// Memory n's panel k (from 1) as a src, or null while it is not painted.
const memoryPlate = (list, world) => (n, k = 1) => {
  const art = list.find((m) => m.n === n)?.panels?.[k - 1]?.art;
  return art ? worldPath(world, art) : null;
};

// A tap on a figure or a panel opens it large over the page, marks and all;
// Esc or a tap closes it.
function openLarge(e) {
  const pic = e.target.closest?.('.notefig .pic, figure.panel img');
  if (!pic) return;
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.append(pic.cloneNode(true));
  const close = () => { box.remove(); removeEventListener('keydown', onKey); };
  const onKey = (k) => { if (k.key === 'Escape') close(); };
  box.addEventListener('click', close);
  addEventListener('keydown', onKey);
  document.body.append(box);
  playMarks(box.querySelector('svg.marks'));
}
$('chapter').addEventListener('click', openLarge);

main().catch((e) => { console.warn('[lingjing] read', e); $('chapter').innerHTML = `<p class="note">${esc(w.failed)}</p>`; });
