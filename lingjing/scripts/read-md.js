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
import { codexHtml, isSubject, rubyName } from './codex.js';

/* The book's form — its 回 in order and numbered as walked (「第N回」 never
   stored), the 古/今 lines and the draft rule — is book-order.js's, shared
   with the game (rules/hui.mjs). */
import { bookEntries, resolveId } from './book-order.js';
export { LINES, bookEntries, cnNumber, huiLabel, jinLabel, resolveId } from './book-order.js';

/// The entry an id names in the view — a 回's own id, an old chapter id its
/// `aliases` map (序章上's `00` → `h01`), or a 回 folded into another
/// (`absorbs`: h03 → 古二, j02 → 今 · 一), so an old read.html?ch= link still
/// opens the page that holds it. A draft's id names nothing in the published view.
export function entryById(book, id, opts = {}) {
  const all = bookEntries(book, opts), want = resolveId(book, id);
  return all.find((c) => c.id === want) ?? null;
}

/// A 回's title as the page sets it, from book.json — never from the file's
/// own title line: a 古 回's number with its 古 tag, a 今 interlude's 「今 · 一」
/// (its own tag already), 草稿 in the draft view, then the 回目, one line per line.
export function huimuHtml(h) {
  const draft = h.draft ? '<span class="tag draft">草稿</span>' : '';
  const tag = h.line === 'jin' ? '' : `<span class="tag">${esc(h.tag.zh)}</span>`;
  return `<h1 class="huimu ${h.line}"><span class="hui">${esc(h.label.zh)}${tag}${draft}</span>`
    + `${(h.huimu?.zh ?? []).map((l) => `<span class="line">${esc(l)}</span>`).join('')}</h1>`;
}

// `# 第三回　上联　下联`: a 回's title line (full-width or plain spaces between).
const HUIMU = /^(第[零一二三四五六七八九十百]+回)[\s　]+(\S+)[\s　]+(\S+)$/;
// `# 今 · 一　一句话`: a 今 interlude's title line — 「今 · N」 (no 回 number),
// then one line in 沈芒's voice. Tried before HUIMU.
const HUIMU_JIN = /^(今\s*·\s*[零一二三四五六七八九十百]+)[\s　]+(\S.*)$/;

/// The hero the world fixes (people.json `hero`, 2026-09-30): the name a page
/// shows when nothing else names him.
export const HERO = '沈小满';

/// The hero from what it is handed (`name`, `gender`), else the fixed one —
/// 沈小满, and the male words.
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
// is there (his, 2026-09-29: 「下面就是图片和文字」). A creature named by its
// own name carries its pinyin over it (his, 2026-10-02: 蛫, 蠪侄 aren't read at sight).
const inline = (t, codex, cite, near = () => false) => esc(t)
  .replace(GLOSS, (_, words, id) => {
    const e = entryOf(codex, id);
    const said = e?.pinyin && words === esc(e.name) ? rubyName(e) : words;
    if (e && isSubject(e) && near(id)) return said;
    return e ? `<span class="gloss" role="button" tabindex="0" data-${isSubject(e) ? 'codex' : 'note'}="${id}">${said}</span>` : said;
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
/// `opts.chapter` → this 回's id in book.json (h02), which `first.book` names — or one of `opts.absorbs`, the ids folded into it (h03);
/// `opts.src`, `opts.lang` → codexHtml; `opts.hui` → this 回's entry
/// (bookEntries): the file's first `# ` title line is set from it (huimuHtml).
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
    if (carded.has(e.id) || !opts.chapter || ![opts.chapter, ...(opts.absorbs ?? [])].includes(e.first?.book)) return '';
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
  let para = [], quote = [], table = [], titled = false;
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
      if (h[1].length === 1 && opts.hui?.huimu && !titled) { titled = true; heading = opts.hui.label.zh; out.push(huimuHtml(opts.hui)); continue; }
      const jin = h[1].length === 1 && HUIMU_JIN.exec(h[2].trim());
      if (jin) { heading = jin[1]; out.push(`<h1 class="huimu jin"><span class="hui">${esc(jin[1])}</span><span class="line">${esc(jin[2])}</span></h1>`); continue; }
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
