// read.js — 书: the novel the game is told from, read in the game's own frame
// (the app runs in a sandboxed iframe: every link here navigates in place, no
// new window). story/index.json names the books; a book's book.json its
// 卷 and 回 (《鹿鼎记》's form: the contents list each 卷, then its 回 with the
// 回目; prev/next go 回 by 回) and appendix; each is a markdown file (read-md.js).
// Two lines (2026-10-01), 今 as interludes (2026-10-02): a 古 回's 「第N回」 and tag, a 今 interlude's 「今 · N」, are computed
// from book.json's order; ?draft=1 shows the 回 still in draft, numbered in place.
import { esc } from './esc.js';
import { bookEntries, entryById, fillHero, heroOf, renderMarkdown } from './read-md.js';
import { playMarks, wireMarks } from './marks.js';
import { addressSay, codexHtml, codexOf } from './codex.js';
import { content, verb, worldPath } from './rules.js';
import { createListener, listenHtml, loadManifest } from './pingshu.js';

const WORDS = {
  zh: { back: '← 回到灵境', toc: '目录', prev: '←', next: '→', none: '书还没有写。', failed: '这一回没能打开。', only: '这一回只有中文。',
    chgs: (n) => `本回改动 ${n} 处`, chg: (i, n) => `改 ${i}/${n}`, okOne: '确认这一处', undo: '撤销', oked: (h) => `已确认：${h}`, undoLast: (h) => `撤销上一处确认（${h}）`, undone: '已撤销', none0: '本回改动都已确认', okFailed: '没能确认，稍后再试。',
    backLooking: '正在取原文……', backFailed: '没能改回。', close: '关闭', cancel: '取消', backNow: '现文', backWas: '改回后（原文）', backNone: '（无）', backYes: '确认改回',
    backWhere: (s, en) => `写入工作区的这一回${s ? `，并同步 ${s} 个场景` : ''}，随即提交${en ? `；英文待同步 ${en} 处` : ''}。`,
    backDone: (c, en) => `已改回原文（提交 ${c}）${en ? `；英文待同步 ${en} 处` : ''}` },
  en: { back: '← Back to Lingjing', toc: 'Contents', prev: '←', next: '→', none: 'The book is not written yet.', failed: 'This chapter could not be opened.', only: 'This chapter is in Chinese only.',
    chgs: (n) => `${n} change${n === 1 ? '' : 's'} here`, chg: (i, n) => `${i}/${n}`, okOne: 'Confirm this one', undo: 'Undo', oked: (h) => `Confirmed: ${h}`, undoLast: (h) => `Undo the last confirm (${h})`, undone: 'Undone', none0: 'All changes here confirmed', okFailed: 'Could not confirm; try again later.',
    backLooking: 'Fetching the original…', backFailed: 'Could not put it back.', close: 'Close', cancel: 'Cancel', backNow: 'Now', backWas: 'Put back (original)', backNone: '(none)', backYes: 'Put it back',
    backWhere: (s, en) => `Written to the checkout${s ? `, ${s} scene(s) kept in step` : ''}, then committed${en ? `; English to follow at ${en}` : ''}.`,
    backDone: (c, en) => `Put back (commit ${c})${en ? `; English to follow at ${en}` : ''}` },
};
const STORY = '../story/';
const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'en' ? 'en' : 'zh';
const view = { draft: params.get('draft') === '1' };
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
  for (const k of ['book', 'ch', 'lang', 'draft']) q.delete(k);
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
  const all = bookEntries(book, view);
  // 「只看改动」 (rules/changes.mjs): what changed since each 回 was last confirmed.
  const changed = await verb('changes', { book: bookId }).catch(() => null);
  const counts = changed?.ok ? changed.entries ?? {} : {};
  // 「↶ 改回原文」 only on the builder's machine (the skills checkout is there).
  devTools = !!changed?.dev;
  // An old chapter id (read.html?ch=02, before the 回) opens its 回.
  const want = entryById(book, params.get('ch'), view)?.id;
  const at = Math.max(0, all.findIndex((c) => c.id === want));
  const ch = all[at];
  document.title = `${pick(book.title)} · ${pick(ch.label ?? ch.title)}`;
  $('booktitle').textContent = pick(book.title);
  $('toc').setAttribute('aria-label', w.toc);
  $('toc').innerHTML = `<div class="toch">${esc(w.toc)}</div>` + tocHtml(all, at, bookId, counts);
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
    const res = await fetch(`${STORY}${encodeURIComponent(bookId)}/${ch.file.split('/').map(encodeURIComponent).join('/')}`);
    if (!res.ok) throw new Error(String(res.status));
    const md = await res.text();
    const who = await hero, f = await files;
    codex = codexOf(f, { lang, gender: who.gender, say: addressSay(f.people, who.gender, lang) });
    const opts = {
      codex, chapter: ch.id, absorbs: ch.absorbs, hui: ch.huimu ? ch : null, src: (file) => worldPath(world, file), lang,
      memory: memoryPlate(await memories, world), classics: await classics,
      // The words not read at sight (book.json `pinyin`): pinyin over every one.
      pinyin: book.pinyin ?? {},
    };
    const filled = fillHero(md, who);
    paint = (changes) => {
      $('chapter').innerHTML = (lang === 'en' ? `<p class="note">${esc(w.only)}</p>` : '') + renderMarkdown(filled, { ...opts, changes, revert: devTools });
      wireMarks($('chapter'));
      rail(changes);
      tocCount(ch.id, changes?.count ?? 0);
    };
    setCurrent(counts[ch.id] ?? null);
    reading = { bookId, id: ch.id };
  } catch {
    $('chapter').innerHTML = `<p class="note">${esc(w.failed)}</p>`;
  }
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
  $('listen').innerHTML = html;
  $('listen').querySelector('[data-listen]')?.addEventListener('click', (e) => {
    const b = e.currentTarget;
    listener.open(b.closest('[data-listen-slot]'), b.dataset.listen, b.dataset.listenUrl);
  });
}

/// The contents: each 卷's name, then its 回 — a 古 回's number and its 古 tag, a side line's 「今 · N」 / 「未 · 序」,
/// and the 回目 after it (古 two lines, 今 one; on a phone they wrap under the
/// number); the appendix last.
function tocHtml(all, at, bookId, counts = {}) {
  let volume = null;
  return all.map((c, i) => {
    const head = c.volume && c.volume.id !== volume ? `<div class="tocv">${esc(pick(c.volume.name))}</div>` : '';
    if (c.volume) volume = c.volume.id;
    const words = c.huimu
      ? `<span class="tn">${esc(pick(c.label))}${c.line !== 'gu' ? '' : `<i class="tag">${esc(pick(c.tag))}</i>`}${c.draft ? `<i class="tag draft">${lang === 'en' ? 'draft' : '草稿'}</i>` : ''}${chgBadge(counts[c.id]?.count)}</span><span class="tm">${(c.huimu[lang] ?? c.huimu.zh ?? []).map((l) => `<span>${esc(l)}</span>`).join('')}</span>`
      : esc(pick(c.title)) + chgBadge(counts[c.id]?.count);
    return `${head}<a data-id="${esc(c.id)}" href="${esc(hrefWith({ book: bookId, ch: c.id }))}" class="${[i === at ? 'on' : '', c.huimu ? `hui ${c.line}` : 'apx'].filter(Boolean).join(' ')}">${words}</a>`;
  }).join('');
}

/* ── 「只看改动」 ──
   The marks are drawn by read-md.js from the rules' changes (rules/changes.mjs,
   book-diff.js — the phone reads the same); here the list beside the text (a
   drop-down on a narrow screen) and the count in the contents. Each change is
   confirmed on its own (Hanli 2026-10-05: 逐条确认, no whole-回 confirm) — its
   「✓ 确认这一处」 at its end, or ✓ on its row in the list; 撤销 takes back the
   last confirm, one at a time. */
let paint = () => {}, reading = null;
const chgBadge = (n) => (n ? `<i class="chgn" title="${esc(w.chgs(n))}">${n}</i>` : '');
function tocCount(id, n) {
  const a = $('toc').querySelector(`a[data-id="${CSS.escape(id)}"]`);
  if (!a) return;
  a.querySelector('.chgn')?.remove();
  (a.querySelector('.tn') ?? a).insertAdjacentHTML('beforeend', chgBadge(n));
}
const undoHtml = (c) => (c?.undo ? `<button type="button" class="chgundo" data-chg-undo="1" title="${esc(c.undo.head)}">↶ ${esc(w.undoLast(c.undo.head))}</button>` : '');
function rail(c) {
  const box = $('chgrail');
  if (!c?.count && !c?.undo) { box.hidden = true; box.innerHTML = ''; return; }
  const wide = matchMedia('(min-width: 1241px)').matches;
  const was = box.querySelector('details');
  const open = was ? was.open : wide;
  box.hidden = false;
  box.innerHTML = `<details class="chgbox"${open ? ' open' : ''}><summary>${esc(c.count ? w.chgs(c.count) : w.none0)}</summary><ol>`
    + c.items.map((it) => `<li><button type="button" data-chg-go="${it.n}" class="go ${esc(it.kind)}"><b>${esc(w.chg(it.n, c.count))}</b>${esc(it.head)}</button><button type="button" class="okmini" data-chg-ok="${it.n}" title="${esc(w.okOne)}" aria-label="${esc(w.okOne)}">✓</button></li>`).join('')
    + `</ol>${undoHtml(c)}</details>`;
}
let current = null, toastOff = 0;
const setCurrent = (c) => { current = c; paint(c); };
function toast(html) {
  document.getElementById('chgtoast')?.remove();
  if (!html) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="chgtoast" id="chgtoast" role="status">${html}</div>`);
  clearTimeout(toastOff);
  toastOff = setTimeout(() => document.getElementById('chgtoast')?.remove(), 6000);
}
/// The block after change n (unchanged), to hold still on screen while the marks redraw.
function anchorAfter(n) {
  const end = n == null ? null : document.querySelector(`[data-chg-end="${n}"]`);
  const el = end?.nextElementSibling ?? null;
  return el ? { tag: el.tagName, text: el.textContent.slice(0, 40), top: el.getBoundingClientRect().top } : null;
}
function holdAnchor(a) {
  if (!a) return;
  const el = [...$('chapter').children].find((x) => x.tagName === a.tag && x.textContent.slice(0, 40) === a.text);
  if (el) scrollBy(0, el.getBoundingClientRect().top - a.top);
}
async function act(what, n) {
  if (!reading) return;
  const args = { book: reading.bookId, id: reading.id, do: what };
  if (what === 'confirm') Object.assign(args, { item: n, rev: current?.rev ?? '', crev: current?.crev ?? '' });
  const head = current?.items?.find((it) => it.n === n)?.head;
  const anchor = anchorAfter(what === 'confirm' ? n : null);
  const res = await verb('changes', args).catch(() => null);
  const next = res?.entries?.[reading.id];
  // The text moved under the page: read it again, marked against the new text.
  if (res?.refused === 'moved') { location.reload(); return; }
  if (next) { const y = scrollY; setCurrent(next); scrollTo(0, y); holdAnchor(anchor); }
  if (res?.ok) { toast(what === 'confirm' ? `${esc(w.oked(head ?? ''))}<button type="button" class="chgundo" data-chg-undo="1">${esc(w.undo)}</button>` : esc(w.undone)); return; }
  toast(esc(w.okFailed));
}
function goChange(n) {
  const to = document.getElementById(`chg-${n}`);
  if (!to) return;
  to.scrollIntoView({ block: 'center' });
  to.classList.remove('flash');
  void to.offsetWidth;
  to.classList.add('flash');
  if (!matchMedia('(min-width: 1241px)').matches) $('chgrail').querySelector('details')?.removeAttribute('open');
}
document.addEventListener('click', (e) => {
  const go = e.target.closest?.('[data-chg-go]');
  if (go) { e.preventDefault(); goChange(go.dataset.chgGo); return; }
  const back = e.target.closest?.('[data-chg-back]');
  if (back) { e.preventDefault(); previewBack(back, Number(back.dataset.chgBack)); return; }
  const yes = e.target.closest?.('[data-chg-back-do]');
  if (yes) { e.preventDefault(); yes.disabled = true; doBack(yes, Number(yes.dataset.chgBackDo)); return; }
  if (e.target.closest?.('[data-chg-back-no]')) { e.preventDefault(); e.target.closest('.chg-backbox')?.remove(); return; }
  const ok = e.target.closest?.('[data-chg-ok]');
  if (ok) { e.preventDefault(); ok.disabled = true; act('confirm', Number(ok.dataset.chgOk)); return; }
  const undo = e.target.closest?.('[data-chg-undo]');
  if (undo) { e.preventDefault(); undo.disabled = true; act('undo'); return; }
  const x = e.target.closest?.('.chg-x');
  if (x) { e.preventDefault(); const old = x.nextElementSibling; if (old) old.hidden = !old.hidden; x.classList.toggle('on', !old?.hidden); }
});

/* 「↶ 改回原文」 (Hanli 2026-10-05; the builder's tool): two steps — the
   change as it would read put back (原文) beside the words now (现文), then
   「确认改回」 writes it in the skills checkout, with the scenes that quote it,
   and commits (rules/revert.mjs); the page then reads the new text. */
let devTools = false;
const blockLines = (list, cls) => list.map((t) => `<p class="${cls}">${esc(t.replace(/^#+\s*/, '').replace(/^>\s?/gm, ''))}</p>`).join('');
async function previewBack(btn, n) {
  const row = btn.closest('.chg-okrow');
  row.querySelector('.chg-backbox')?.remove();
  row.insertAdjacentHTML('beforeend', `<div class="chg-backbox"><p class="dim">${esc(w.backLooking)}</p></div>`);
  const box = row.querySelector('.chg-backbox');
  const res = await verb('changes', { book: reading.bookId, id: reading.id, do: 'preview', item: n, rev: current?.rev ?? '' }).catch(() => null);
  if (!res?.ok) {
    box.innerHTML = `<p class="warn">${esc(res?.say ?? w.backFailed)}</p>${[...(res?.dirty ?? []), ...(res?.stuck ?? [])].map((d) => `<p class="dim">${esc(d)}</p>`).join('')}<button type="button" class="chgundo" data-chg-back-no="1">${esc(w.close)}</button>`;
    return;
  }
  const was = [...res.swapped.map((x) => x.was), ...res.restored], now = [...res.swapped.map((x) => x.now), ...res.dropped];
  box.innerHTML = `<div class="cols"><div><b>${esc(w.backNow)}</b>${blockLines(now, 'now') || `<p class="dim">${esc(w.backNone)}</p>`}</div>`
    + `<div><b>${esc(w.backWas)}</b>${blockLines(was, 'was') || `<p class="dim">${esc(w.backNone)}</p>`}</div></div>`
    + `<p class="dim">${esc(w.backWhere(res.scenes.length, res.en_pending))}</p>`
    + `<button type="button" class="chg-okone" data-chg-back-do="${n}">${esc(w.backYes)}</button> <button type="button" class="chgundo" data-chg-back-no="1">${esc(w.cancel)}</button>`;
}
async function doBack(btn, n) {
  const box = btn.closest('.chg-backbox');
  const res = await verb('changes', { book: reading.bookId, id: reading.id, do: 'revert', item: n, rev: current?.rev ?? '' }).catch(() => null);
  if (!res?.ok) { box.insertAdjacentHTML('beforeend', `<p class="warn">${esc(res?.say ?? w.backFailed)}</p>`); btn.disabled = false; return; }
  try { sessionStorage.setItem('lj-back', w.backDone(res.commit, res.en_pending)); } catch { /* none */ }
  location.reload();
}
try { const said = sessionStorage.getItem('lj-back'); if (said) { sessionStorage.removeItem('lj-back'); setTimeout(() => toast(esc(said)), 600); } } catch { /* none */ }

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
