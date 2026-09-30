// read-md.js — the little markdown the book is written in, as HTML: headings,
// paragraphs, **bold**, > blockquotes, --- scene breaks and pipe tables, plus the
// book's own: `# 第N回　上联　下联`, a 回's number and its 回目 (the couplet
// set as two centred lines); `::: 男` / `::: 女` … `:::`, a passage told for one hero
// (fillHero); `::: 忆 <n>`, 银月's memory n as its one colour plate;
// `[words]{注=id}`, words naming a 图鉴 entry (worlds/<world>/codex.json,
// scripts/codex.js) — a subject's card after the paragraph of its first
// appearance (the entry's `first.book`), a dotted link after that; a knowledge
// figure under every paragraph that names it; and `《书名》{典=id}`, a classic the chapter names,
// linked both ways to its entry in 「附 · 本回典籍」 at the 回's end
// (story/<book>/classics.json). Pure: no DOM, every word escaped (read.html's
// reader and its test both use it).
import { esc } from './esc.js';
import { fill, genderOf } from './state.mjs';
import { codexHtml, isSubject } from './codex.js';

/* ── The book's form (《鹿鼎记》's, Hanli 2026-09-29: 「按回卷改」): book.json's
   `volumes` (卷 = ten 回) hold its `hui` (回, numbered through
   the whole book, each with a 回目 of two seven-character lines); the reader
   walks them flat, 卷 by 卷. ── */

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

/// Every 回 in book order, then the appendix: each with its `title` ({zh, en}:
/// 「第五回　漏勺夜半通三关　萝卜一根收小狰」), `label` (第五回) and, for a 回,
/// its `volume` ({id, n, name}). A book still in plain `chapters` reads as it was.
export function bookEntries(book) {
  const hui = (book?.volumes ?? []).flatMap((v) => (v.hui ?? []).map((h) => ({
    ...h,
    volume: { id: v.id, n: v.n, name: v.name },
    label: { zh: huiLabel(h.n), en: huiLabel(h.n, 'en') },
    title: { zh: `${huiLabel(h.n)}　${(h.huimu?.zh ?? []).join('　')}`, en: `${huiLabel(h.n, 'en')} · ${(h.huimu?.en ?? []).join(' / ')}` },
  })));
  return [...hui, ...(book?.chapters ?? []), ...(book?.appendix ?? []).map((a) => ({ ...a, volume: null }))];
}

/// The entry an id names — a 回's own id, or an old chapter id its `aliases` map
/// (序章上's `00` → `h01`), so an old read.html?ch= link still opens its 回.
export function entryById(book, id) {
  const all = bookEntries(book), want = book?.aliases?.[id] ?? id;
  return all.find((c) => c.id === want) ?? null;
}

// `# 第三回　上联　下联`: a 回's title line (full-width or plain spaces between).
const HUIMU = /^(第[零一二三四五六七八九十百]+回)[\s　]+(\S+)[\s　]+(\S+)$/;

/// The hero the drafts were written with: the name a page with no save shows.
export const HERO = '周星星';

/// The hero from what Look says (`name`, `gender`), or the drafts' own — 周星星,
/// and the male words — when there is no save, no name or no gender yet.
export const heroOf = (seen) => ({
  name: (typeof seen?.name === 'string' && seen.name.trim()) || HERO,
  gender: genderOf(seen) === 'female' ? 'female' : 'male',
});

/// `{男词|女词}`: the word for the hero's gender — keyed on the HERO, so a
/// word about 阿禾 (always the other gender) reads `{她|他}`. Unset → male.
export const genderWords = (md, gender) =>
  String(md ?? '').replace(/\{([^{}|\n]*)\|([^{}|\n]*)\}/g, (_, male, female) => (gender === 'female' ? female : male));

const VARIANT = /^:::\s*(男|女)\s*$/;
const VARIANT_END = /^:::\s*$/;

/// `::: 男` … `:::` and `::: 女` … `:::`: a passage told two ways. The hero's
/// block stays (female → 女; male or unset → 男), the other goes, and so do the
/// fence lines; a lone block with no twin simply vanishes for the other hero.
/// Only a line that is exactly `::: 男`/`::: 女` opens one, so `::: 忆 <n>`
/// plates are left alone. An unclosed block runs to the end.
export function genderBlocks(md, gender) {
  const want = gender === 'female' ? '女' : '男';
  const out = [];
  let inside = null;
  for (const line of String(md ?? '').split('\n')) {
    const bare = line.replace(/\r$/, '').trim();
    if (inside === null) {
      const open = VARIANT.exec(bare);
      if (open) inside = open[1];
      else out.push(line);
      continue;
    }
    if (VARIANT_END.test(bare)) { inside = null; continue; }
    if (inside === want) out.push(line);
  }
  return out.join('\n');
}

/// A chapter's markdown with the player in it, before rendering: the hero's
/// variant blocks, then the gendered words, then `{name}` (state.mjs `fill`, the scenes' own token). The name is
/// a word, never markup, so a `*` or `|` in it goes full-width and can't open
/// bold or split a table row (renderMarkdown escapes the rest).
export function fillHero(md, hero = {}) {
  const name = String(hero.name || HERO).replace(/\*/g, '＊').replace(/\|/g, '｜');
  return fill(genderWords(genderBlocks(md, hero.gender), hero.gender), { name });
}

// `::: 忆 <n> [caption]` — 银月's memory n as its one colour plate (memories.json).
const MEMORY = /^:::\s*忆\s+(\d+)\s*(.*)$/;
const GLOSS = /\[([^\]\n]+)\]\{注=([^{}\n]+)\}/g;
// `《书名》{典=id}` — a classic named in the text (classics.json).
const CLASSIC = /《([^》\n]+)》\{典=([\w-]+)\}/g;
// `[words]{典=id}` — a thing the classic tells of (河伯), linked to that classic's entry
// without naming the book in a speaker's mouth (his, 2026-09-29).
const CLASSIC_WORDS = /\[([^\]\n]+)\]\{典=([\w-]+)\}/g;
const entryOf = (codex, id) => (codex instanceof Map ? codex.get(id) : Object.hasOwn(codex ?? {}, id) ? codex[id] : null) ?? null;
// A gloss whose entry is missing reads as its words, nothing more; a classic
// with no entry (or no `cite`) reads as its 《书名》. A subject links to its card
// (data-codex), a knowledge figure to the figure under the paragraph (data-note).
// A subject whose card stands right by (`near(id)`) reads as its words: the card
// is there (his, 2026-09-29: 「下面就是图片和文字」).
const inline = (t, codex, cite, near = () => false) => esc(t)
  .replace(GLOSS, (_, words, id) => {
    const e = entryOf(codex, id);
    if (e && isSubject(e) && near(id)) return words;
    return e ? `<span class="gloss" role="button" tabindex="0" data-${isSubject(e) ? 'codex' : 'note'}="${id}">${words}</span>` : words;
  })
  .replace(CLASSIC_WORDS, (_, words, id) => cite?.(id, words, true) ?? words)
  .replace(CLASSIC, (_, words, id) => cite?.(id, words) ?? `《${words}》`)
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const glossIds = (lines, codex) => [...new Set(lines.flatMap((l) => [...esc(l).matchAll(GLOSS)].map((m) => m[2])))].filter((id) => entryOf(codex, id));
/// How many blocks after its card a mention still stands by it (the card's own paragraph is 0).
export const NEAR = 2;
const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/// The anchor ids of a classic's entry and of its n-th mention (from 1).
export const classicAnchor = (id, n = 0) => (n ? `dian-${id}-${n}` : `dian-${id}`);

/// 「附 · 本回典籍」: one entry per classic the 回 named, in the order first
/// named — its name and one line of background, the passage in the edition's
/// own (traditional) text, the simplified rendering, the 白话, where the
/// 回 names it (each a jump back: 「第三回」, or 「第三回 · 第2处」 when it is
/// named more than once) and the source it was copied from.
/// `cited` is [[id, [{n, where}…]]…].
export function classicsAppendix(cited, classics = {}) {
  if (!cited.length) return '';
  const back = (id, { n, where }, many) => {
    const label = [where, many ? `第${n}处` : ''].filter(Boolean).join(' · ') || `第${n}处`;
    return `<a href="#${classicAnchor(id, n)}" data-dian-jump="${classicAnchor(id, n)}">↑ ${esc(label)}</a>`;
  };
  const entry = ([id, refs]) => {
    const c = classics[id], src = c.source ?? {};
    const plain = (Array.isArray(c.plain) ? c.plain : [c.plain]).filter(Boolean).map((l) => `<p class="plain"><span class="tag">白话</span>${esc(l)}</p>`).join('');
    return `<article class="dianent" id="${classicAnchor(id)}"><h3>《${esc(c.title)}》</h3><p class="about">${esc(c.about ?? '')}</p>`
      + `<blockquote class="orig" lang="zh-Hant"><span class="tag">原文</span>${esc(c.original)}</blockquote>`
      + plain + (c.note ? `<p class="dnote">${esc(c.note)}</p>` : '')
      + `<p class="where">本回见：${refs.map((r) => back(id, r, refs.length > 1)).join('　')}</p>`
      + `<p class="src">出处：<a href="${esc(src.url ?? '')}" target="_blank" rel="noopener">${esc(src.edition ?? '')}</a>${src.section ? ` · ${esc(src.section)}` : ''}${src.license ? ` · ${esc(src.license)}` : ''}</p></article>`;
  };
  return `<hr><section class="dian" aria-label="附 · 本回典籍"><h2>附 · 本回典籍</h2>${cited.map(entry).join('')}</section>`;
}

/// `opts.classics` → classics.json's classics: `《书名》{典=id}` links to its entry
/// at the chapter's end (and back); none, or no entry: the 《书名》 alone.
/// `opts.memory(n)` → memory n's plate src, or null (none: plates are left out);
/// `opts.codex` → the resolved 图鉴 (codex.js codexOf: a Map, or an object) and
/// `opts.chapter` → this 回's id in book.json (h03), which `first.book` names;
/// `opts.src`, `opts.lang` → codexHtml.
export function renderMarkdown(md, opts = {}) {
  const codex = opts.codex, classics = opts.classics ?? {};
  // A subject's card stands once: after the first paragraph that names it, in
  // the 回 of its first appearance.
  // A mention in the same section — between two scene breaks (`---`), or two
  // headings — within NEAR blocks after its card links nowhere; a farther one
  // opens the card over the page.
  const carded = new Map();
  let block = 0, section = 0;
  const near = (id) => { const at = carded.get(id); return !!at && at.section === section && block - at.block <= NEAR; };
  const figures = (ids) => ids.map((id) => entryOf(codex, id)).map((e) => {
    if (!isSubject(e)) return codexHtml(e, opts);
    if (carded.has(e.id) || !opts.chapter || e.first?.book !== opts.chapter) return '';
    carded.set(e.id, { block, section });
    return codexHtml(e, { ...opts, first: true });
  }).join('');
  const inl = (l) => inline(l, codex, cite, near);
  // Each classic named: its mentions in order, with where each sits — the 回
  // (from its title line), or the heading it sits under in a plain chapter.
  const cited = new Map();
  let heading = '';
  const cite = (id, words, bare = false) => {
    if (!Object.hasOwn(classics, id) || !classics[id]?.original || !classics[id]?.source?.url) return null;
    const refs = cited.get(id) ?? [];
    refs.push({ n: refs.length + 1, where: heading });
    cited.set(id, refs);
    return `<a class="gloss dianref" href="#${classicAnchor(id)}" id="${classicAnchor(id, refs.length)}" data-dian-jump="${classicAnchor(id)}">${bare ? words : `《${words}》`}</a>`;
  };
  // <!-- … --> is a note for the writers (女主变体 and the like), never read.
  const lines = String(md ?? '').replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const out = [];
  let para = [], quote = [], table = [];
  const flush = () => {
    if (para.length) {
      block += 1;
      const figs = figures(glossIds(para, codex)), p = `<p>${para.map(inl).join('<br>')}</p>`;
      out.push(figs ? `<div class="noted">${p}${figs}</div>` : p);
      para = [];
    }
    if (quote.length) {
      block += 1;
      const figs = figures(glossIds(quote, codex));
      out.push(`<blockquote>${quote.map((l) => `<p>${inl(l)}</p>`).join('')}</blockquote>${figs}`);
      quote = [];
    }
    if (table.length) {
      block += 1;
      const [head, , ...body] = table;
      out.push(`<table><thead><tr>${cells(head).map((c) => `<th>${inl(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inl(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      table = [];
    }
  };
  for (const line of lines) {
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      section += 1;
      const hui = h[1].length === 1 && HUIMU.exec(h[2].trim());
      if (hui) { heading = hui[1]; out.push(`<h1 class="huimu"><span class="hui">${esc(hui[1])}</span><span class="line">${esc(hui[2])}</span><span class="line">${esc(hui[3])}</span></h1>`); continue; }
      if (h[1].length <= 2) heading = h[2].replace(CLASSIC, '《$1》').replace(/\*\*/g, '');
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      continue;
    }
    const mem = MEMORY.exec(line.trim());
    if (mem) {
      flush();
      const src = opts.memory?.(Number(mem[1]));
      if (src) out.push(`<figure class="panel memplate"><img src="${esc(src)}" alt="${esc(mem[2])}" loading="lazy">${mem[2] ? `<figcaption>${inline(mem[2])}</figcaption>` : ''}</figure>`);
      continue;
    }
    // A scene break: a quiet 「◇」 (read.css), and a new section for the cards.
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flush(); section += 1; out.push('<hr class="scene">'); continue; }
    if (/^\s*>/.test(line)) { if (para.length || table.length) flush(); quote.push(line.replace(/^\s*>\s?/, '')); continue; }
    if (/^\s*\|/.test(line)) { if (para.length || quote.length) flush(); table.push(line); continue; }
    if (!line.trim()) { flush(); continue; }
    if (quote.length || table.length) flush();
    para.push(line.trim());
  }
  flush();
  const appendix = classicsAppendix([...cited], classics);
  if (appendix) out.push(appendix);
  return out.join('\n');
}
