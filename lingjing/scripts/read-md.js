// read-md.js — the little markdown the book is written in, as HTML: headings,
// paragraphs, **bold**, > blockquotes, --- rules and pipe tables, plus two of
// the book's own: `::: 画 <panel-id> [caption]`, a 小人书 panel full width,
// `::: 男` / `::: 女` … `:::`, a passage told for one hero (fillHero), and
// `[words]{注=id}`, words with a knowledge figure set right under their paragraph
// (worlds/<world>/notes.json), and `《书名》{典=id}`, a classic the chapter names,
// linked both ways to its entry in 「附 · 本章典籍」 at the chapter's end
// (story/<book>/classics.json). Pure: no DOM, every word escaped (read.html's
// reader and its test both use it).
import { esc } from './esc.js';
import { fill, genderOf } from './state.mjs';
import { marksSvg } from './marks.js';

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
/// Only a line that is exactly `::: 男`/`::: 女` opens one, so `::: 画 <id>`
/// panels are left alone. An unclosed block runs to the end.
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

const PANEL = /^:::\s*画\s+([\w-]+)\s*(.*)$/;
// `::: 忆 <n>[.<k>] [caption]` — 银月's memory n (its panel k, from 1) as a colour plate (memories.json).
const MEMORY = /^:::\s*忆\s+(\d+)(?:\.(\d+))?\s*(.*)$/;
const GLOSS = /\[([^\]\n]+)\]\{注=([^{}\n]+)\}/g;
// `《书名》{典=id}` — a classic named in the text (classics.json).
const CLASSIC = /《([^》\n]+)》\{典=([\w-]+)\}/g;
const known = (notes, id) => Object.hasOwn(notes ?? {}, id);
// A gloss whose note is missing reads as its words, nothing more; a classic
// with no entry (or no `cite`) reads as its 《书名》.
const inline = (t, notes, cite) => esc(t)
  .replace(GLOSS, (_, words, id) => (known(notes, id) ? `<span class="gloss" role="button" tabindex="0" data-note="${id}">${words}</span>` : words))
  .replace(CLASSIC, (_, words, id) => cite?.(id, words) ?? `《${words}》`)
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const noteIds = (lines, notes) => [...new Set(lines.flatMap((l) => [...esc(l).matchAll(GLOSS)].map((m) => m[2])))].filter((id) => known(notes, id));
const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/// A note's figure: its picture (its `marks` drawn over it, marks.js), title,
/// lines and credit. `src(path)` resolves the picture under the world.
export function noteFigure(id, note, { src = (p) => p, lang = 'zh' } = {}) {
  const pick = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v[lang] ?? v.zh ?? v.en : v);
  const img = note.image ? `<div class="pic"><img src="${esc(src(note.image))}" alt="${esc(pick(note.title))}" loading="lazy">${marksSvg(note.marks, lang)}</div>` : '';
  const lines = (pick(note.lines) ?? []).map((l) => `<span>${esc(l)}</span>`).join('');
  return `<figure class="notefig" data-note="${esc(id)}">${img}<figcaption><b>${esc(pick(note.title))}</b>${lines}<small>${esc(pick(note.credit))}</small></figcaption></figure>`;
}

/// The anchor ids of a classic's entry and of its n-th mention (from 1).
export const classicAnchor = (id, n = 0) => (n ? `dian-${id}-${n}` : `dian-${id}`);

/// 「附 · 本章典籍」: one entry per classic the chapter named, in the order first
/// named — its name and one line of background, the passage in the edition's
/// own (traditional) text, the simplified rendering, the 白话, where the
/// chapter names it (each a jump back) and the source it was copied from.
/// `cited` is [[id, [{n, where}…]]…].
export function classicsAppendix(cited, classics = {}) {
  if (!cited.length) return '';
  const back = (id, { n, where }) => `<a href="#${classicAnchor(id, n)}" data-dian-jump="${classicAnchor(id, n)}">↑ ${esc(where || `第${n}处`)}</a>`;
  const entry = ([id, refs]) => {
    const c = classics[id], src = c.source ?? {};
    const plain = (Array.isArray(c.plain) ? c.plain : [c.plain]).filter(Boolean).map((l) => `<p class="plain"><span class="tag">白话</span>${esc(l)}</p>`).join('');
    return `<article class="dianent" id="${classicAnchor(id)}"><h3>《${esc(c.title)}》</h3><p class="about">${esc(c.about ?? '')}</p>`
      + `<blockquote class="orig" lang="zh-Hant"><span class="tag">原文</span>${esc(c.original)}</blockquote>`
      + (c.simplified && c.simplified !== c.original ? `<p class="simp" lang="zh-Hans"><span class="tag">简体</span>${esc(c.simplified)}</p>` : '')
      + plain + (c.note ? `<p class="dnote">${esc(c.note)}</p>` : '')
      + `<p class="where">本章见：${refs.map((r) => back(id, r)).join('　')}</p>`
      + `<p class="src">出处：<a href="${esc(src.url ?? '')}" target="_blank" rel="noopener">${esc(src.edition ?? '')}</a>${src.section ? ` · ${esc(src.section)}` : ''}${src.license ? ` · ${esc(src.license)}` : ''}</p></article>`;
  };
  return `<hr><section class="dian" aria-label="附 · 本章典籍"><h2>附 · 本章典籍</h2>${cited.map(entry).join('')}</section>`;
}

/// `opts.classics` → classics.json's classics: `《书名》{典=id}` links to its entry
/// at the chapter's end (and back); none, or no entry: the 《书名》 alone.
/// `opts.memory(n, k)` → memory n's panel k src, or null (none: plates are left out);
/// `opts.panel(id)` → a panel's src (none: panels are left out); `opts.notes`
/// → notes.json's notes; `opts.src`, `opts.lang` → noteFigure.
export function renderMarkdown(md, opts = {}) {
  const { notes } = opts, classics = opts.classics ?? {};
  // Each classic named: its mentions in order, with the heading each sits under.
  const cited = new Map();
  let heading = '';
  const cite = (id, words) => {
    if (!Object.hasOwn(classics, id) || !classics[id]?.original || !classics[id]?.source?.url) return null;
    const refs = cited.get(id) ?? [];
    refs.push({ n: refs.length + 1, where: heading });
    cited.set(id, refs);
    return `<a class="gloss dianref" href="#${classicAnchor(id)}" id="${classicAnchor(id, refs.length)}" data-dian-jump="${classicAnchor(id)}">《${words}》</a>`;
  };
  // <!-- … --> is a note for the writers (女主变体 and the like), never read.
  const lines = String(md ?? '').replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const out = [];
  let para = [], quote = [], table = [];
  const flush = () => {
    if (para.length) {
      const p = `<p>${para.map((l) => inline(l, notes, cite)).join('<br>')}</p>`, ids = noteIds(para, notes);
      out.push(ids.length ? `<div class="noted">${p}${ids.map((id) => noteFigure(id, notes[id], opts)).join('')}</div>` : p);
      para = [];
    }
    if (quote.length) { out.push(`<blockquote>${quote.map((l) => `<p>${inline(l, notes, cite)}</p>`).join('')}</blockquote>`); quote = []; }
    if (table.length) {
      const [head, , ...body] = table;
      out.push(`<table><thead><tr>${cells(head).map((c) => `<th>${inline(c, notes, cite)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c, notes, cite)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      table = [];
    }
  };
  for (const line of lines) {
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flush(); if (h[1].length <= 2) heading = h[2].replace(CLASSIC, '《$1》').replace(/\*\*/g, ''); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    const pic = PANEL.exec(line.trim());
    if (pic) {
      flush();
      if (opts.panel) out.push(`<figure class="panel"><img src="${esc(opts.panel(pic[1]))}" alt="${esc(pic[2])}" loading="lazy">${pic[2] ? `<figcaption>${inline(pic[2])}</figcaption>` : ''}</figure>`);
      continue;
    }
    const mem = MEMORY.exec(line.trim());
    if (mem) {
      flush();
      const src = opts.memory?.(Number(mem[1]), Number(mem[2] ?? 1));
      if (src) out.push(`<figure class="panel memplate"><img src="${esc(src)}" alt="${esc(mem[3])}" loading="lazy">${mem[3] ? `<figcaption>${inline(mem[3])}</figcaption>` : ''}</figure>`);
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }
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
