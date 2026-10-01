// read.js — 书: the novel the game is told from, read in the game's own frame
// (the app runs in a sandboxed iframe: every link here navigates in place, no
// new window). story/index.json names the books; a book's book.json its
// 卷 and 回 (《鹿鼎记》's form: the contents list each 卷, then its 回 with the
// 回目; prev/next go 回 by 回) and appendix; each is a markdown file (read-md.js).
import { esc } from './esc.js';
import { bookEntries, entryById, fillHero, heroOf, renderMarkdown } from './read-md.js';
import { playMarks, wireMarks } from './marks.js';
import { addressSay, codexHtml, codexOf } from './codex.js';
import { content, worldPath } from './rules.js';
import { createListener, listenHtml, loadManifest } from './pingshu.js';

const WORDS = {
  zh: { back: '← 回到灵境', toc: '目录', prev: '←', next: '→', none: '书还没有写。', failed: '这一回没能打开。', only: '这一回只有中文。' },
  en: { back: '← Back to Lingjing', toc: 'Contents', prev: '←', next: '→', none: 'The book is not written yet.', failed: 'This chapter could not be opened.', only: 'This chapter is in Chinese only.' },
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
  const asked = params.get('book');
  // An old book id (?book=huxian-bing, before 《九鼎录》) opens the book it became.
  const bookId = (asked && index.aliases?.[asked]) ?? asked ?? index.books?.[0];
  if (!bookId) { $('chapter').innerHTML = `<p class="note">${esc(w.none)}</p>`; return; }
  const book = await getJson(`${STORY}${encodeURIComponent(bookId)}/book.json`);
  const all = bookEntries(book);
  // An old chapter id (read.html?ch=02, before the 回) opens its 回.
  const want = entryById(book, params.get('ch'))?.id;
  const at = Math.max(0, all.findIndex((c) => c.id === want));
  const ch = all[at];
  document.title = `${pick(book.title)} · ${pick(ch.label ?? ch.title)}`;
  $('booktitle').textContent = pick(book.title);
  $('toc').setAttribute('aria-label', w.toc);
  $('toc').innerHTML = `<div class="toch">${esc(w.toc)}</div>` + tocHtml(all, at, bookId);
  $('toc').querySelector('a.on')?.scrollIntoView({ block: 'nearest' });
  // 图鉴 (codex.json and the files it links): the cards and figures in the
  // text — the same entries the game draws. None reads the words alone.
  const world = `worlds/${book.world ?? 'jiuding'}`;
  worldDir = world;
  const files = Promise.all(['codex', 'people', 'creatures', 'items', 'arts'].map((f) => content(world, `${f}.json`).catch(() => null)))
    .then(([codex, people, creatures, items, arts]) => ({ codex, people, creatures, items, arts }));
  // The hero is the world's, fixed (people.json `hero`, 2026-09-30: 沈小满, a
  // boy) — the 回 not yet in the third person fill {name} and {他|她} with him.
  const hero = files.then((f) => heroOf(f.people?.hero ? { name: f.people.hero.name?.zh, gender: f.people.hero.gender } : null));
  // 银月's memories (`::: 忆 n`): the colour plates, from memories.json.
  const memories = content(world, 'memories.json').then((m) => m?.memories ?? [], () => []);
  // 附 · 本回典籍: the classics the book names (`《书名》{典=id}`), one file per book; none reads plain.
  const classics = getJson(`${STORY}${encodeURIComponent(bookId)}/classics.json`).then((c) => c?.classics ?? {}, () => ({}));
  try {
    const res = await fetch(`${STORY}${encodeURIComponent(bookId)}/${encodeURIComponent(ch.file)}`);
    if (!res.ok) throw new Error(String(res.status));
    const md = await res.text();
    const who = await hero, f = await files;
    codex = codexOf(f, { lang, gender: who.gender, say: addressSay(f.people, who.gender, lang) });
    $('chapter').innerHTML = (lang === 'en' ? `<p class="note">${esc(w.only)}</p>` : '') + renderMarkdown(fillHero(md, who), {
      codex, chapter: ch.id, src: (file) => worldPath(world, file), lang,
      memory: memoryPlate(await memories, world), classics: await classics,
    });
  } catch {
    $('chapter').innerHTML = `<p class="note">${esc(w.failed)}</p>`;
  }
  wireMarks($('chapter'));
  ear(bookId, ch.id);
  const prev = all[at - 1], next = all[at + 1];
  const short = (c) => esc(pick(c.label ?? c.title));
  $('pager').innerHTML = `${prev ? `<a href="${esc(hrefWith({ book: bookId, ch: prev.id }))}">${esc(w.prev)} ${short(prev)}</a>` : '<span></span>'}${next ? `<a href="${esc(hrefWith({ book: bookId, ch: next.id }))}">${short(next)} ${esc(w.next)}</a>` : '<span></span>'}`;
  window.scrollTo(0, 0);
}

/// ▶ 听书: a 回 with its whole 评书 on the CDN (pingshu.js) gets the player
/// at its head — play, pause, the seek bar, and the place left remembered
/// (the same as in the game's 录). No audio, nothing shows.
const listener = createListener();
async function ear(bookId, id) {
  const html = listenHtml(await loadManifest(bookId), id, lang, esc);
  if (!html) return;
  $('chapter').insertAdjacentHTML('afterbegin', html);
  $('chapter').querySelector('[data-listen]')?.addEventListener('click', (e) => {
    const b = e.currentTarget;
    listener.open(b.closest('[data-listen-slot]'), b.dataset.listen, b.dataset.listenUrl);
  });
}

/// The contents: each 卷's name, then its 回 — the number, and the 回目's two
/// lines after it (on a phone they wrap under the number); the appendix last.
function tocHtml(all, at, bookId) {
  let volume = null;
  return all.map((c, i) => {
    const head = c.volume && c.volume.id !== volume ? `<div class="tocv">${esc(pick(c.volume.name))}</div>` : '';
    if (c.volume) volume = c.volume.id;
    const words = c.huimu
      ? `<span class="tn">${esc(pick(c.label))}</span><span class="tm">${(c.huimu[lang] ?? c.huimu.zh ?? []).map((l) => `<span>${esc(l)}</span>`).join('')}</span>`
      : esc(pick(c.title));
    return `${head}<a href="${esc(hrefWith({ book: bookId, ch: c.id }))}" class="${[i === at ? 'on' : '', c.huimu ? 'hui' : 'apx'].filter(Boolean).join(' ')}">${words}</a>`;
  }).join('');
}

/// Memory n's one colour plate as a src, or null while it is not painted.
const memoryPlate = (list, world) => (n) => {
  const art = list.find((m) => m.n === n)?.art;
  return art ? worldPath(world, art) : null;
};

let codex = new Map(), worldDir = 'worlds/jiuding';

// A tap on a figure, a plate or a card's picture opens it large over the page,
// marks and all; a later mention's link opens the subject's card; 「原图」 the
// scan a traced figure was drawn from. Esc or a tap closes it.
function openLarge(e) {
  const scan = e.target.closest?.('[data-scan]');
  const link = e.target.closest?.('.gloss[data-codex]');
  const pic = e.target.closest?.('.notefig .pic, figure.panel img, .codexcard .cpic img');
  let shown = null, card = false;
  if (scan) { shown = document.createElement('img'); shown.src = scan.dataset.scan; }
  else if (link && codex.get(link.dataset.codex)) {
    card = true;
    shown = document.createElement('div');
    shown.className = 'boxcard';
    shown.setAttribute('role', 'dialog');
    shown.innerHTML = `<button class="boxclose" aria-label="×">×</button>${codexHtml(codex.get(link.dataset.codex), { src: (f) => worldPath(worldDir, f), lang })}`;
  } else if (pic) shown = pic.cloneNode(true);
  if (!shown) return;
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.append(shown);
  const close = () => { box.remove(); removeEventListener('keydown', onKey); };
  const onKey = (k) => { if (k.key === 'Escape') close(); };
  // A card closes on ×, Esc or a tap outside it; a picture on any tap.
  box.addEventListener('click', (c) => { if (!card || c.target === box || c.target.closest('.boxclose')) close(); });
  addEventListener('keydown', onKey);
  document.body.append(box);
  playMarks(box.querySelector('svg.marks'));
}
$('chapter').addEventListener('click', openLarge);

// A classic named in the text opens its entry in place, a note over the page
// (his, 2026-09-29: the jump to the chapter's end and back was too much work);
// the full 「附 · 本回典籍」 still stands at the end. The entry's own 「本回见」
// links jump in place, the spot lit so the eye finds it.
let note = null;
function closeNote() {
  note?.remove();
  note = null;
  removeEventListener('keydown', noteKey);
}
function noteKey(e) { if (e.key === 'Escape') closeNote(); }
function openNote(ref, entry) {
  closeNote();
  note = document.createElement('div');
  note.className = 'diannote';
  note.setAttribute('role', 'dialog');
  const body = entry.cloneNode(true);
  body.removeAttribute('id');
  body.querySelector('.where')?.remove();
  note.innerHTML = '<button class="dianclose" aria-label="×">×</button>';
  note.append(body);
  document.body.append(note);
  // Beside the name on a wide screen; a sheet from the bottom on a phone.
  if (innerWidth > 640) {
    const r = ref.getBoundingClientRect(), h = note.offsetHeight;
    const top = r.bottom + 8 + h < innerHeight ? r.bottom + 8 : Math.max(8, r.top - 8 - h);
    note.style.top = `${top}px`;
    note.style.left = `${Math.min(Math.max(8, r.left), innerWidth - note.offsetWidth - 8)}px`;
  } else note.classList.add('sheet');
  note.querySelector('.dianclose').addEventListener('click', closeNote);
  addEventListener('keydown', noteKey);
}
function jump(e) {
  const a = e.target.closest?.('[data-dian-jump]');
  const to = a && document.getElementById(a.dataset.dianJump);
  if (!to) {
    if (note && !e.target.closest?.('.diannote')) closeNote();
    return;
  }
  e.preventDefault();
  if (a.classList.contains('dianref')) return openNote(a, to);
  closeNote();
  to.scrollIntoView({ block: 'center' });
  to.classList.remove('lit');
  void to.offsetWidth;
  to.classList.add('lit');
}
document.addEventListener('click', jump);
addEventListener('scroll', () => { if (note && !note.classList.contains('sheet')) closeNote(); }, { passive: true });

main().catch((e) => { console.warn('[lingjing] read', e); $('chapter').innerHTML = `<p class="note">${esc(w.failed)}</p>`; });
