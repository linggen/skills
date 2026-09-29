// read-md.js — the little markdown the book is written in, as HTML: headings,
// paragraphs, **bold**, > blockquotes, --- rules and pipe tables, plus two of
// the book's own: `::: 画 <panel-id> [caption]`, a 小人书 panel full width,
// `::: 男` / `::: 女` … `:::`, a passage told for one hero (fillHero), and
// `[words]{注=id}`, words with a knowledge figure set right under their paragraph
// (worlds/<world>/notes.json). Pure: no DOM, every word escaped (read.html's
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
const GLOSS = /\[([^\]\n]+)\]\{注=([^{}\n]+)\}/g;
const known = (notes, id) => Object.hasOwn(notes ?? {}, id);
// A gloss whose note is missing reads as its words, nothing more.
const inline = (t, notes) => esc(t)
  .replace(GLOSS, (_, words, id) => (known(notes, id) ? `<span class="gloss" role="button" tabindex="0" data-note="${id}">${words}</span>` : words))
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

/// `opts.panel(id)` → a panel's src (none: panels are left out); `opts.notes`
/// → notes.json's notes; `opts.src`, `opts.lang` → noteFigure.
export function renderMarkdown(md, opts = {}) {
  const { notes } = opts;
  // <!-- … --> is a note for the writers (女主变体 and the like), never read.
  const lines = String(md ?? '').replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const out = [];
  let para = [], quote = [], table = [];
  const flush = () => {
    if (para.length) {
      const p = `<p>${para.map((l) => inline(l, notes)).join('<br>')}</p>`, ids = noteIds(para, notes);
      out.push(ids.length ? `<div class="noted">${p}${ids.map((id) => noteFigure(id, notes[id], opts)).join('')}</div>` : p);
      para = [];
    }
    if (quote.length) { out.push(`<blockquote>${quote.map((l) => `<p>${inline(l, notes)}</p>`).join('')}</blockquote>`); quote = []; }
    if (table.length) {
      const [head, , ...body] = table;
      out.push(`<table><thead><tr>${cells(head).map((c) => `<th>${inline(c, notes)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c, notes)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      table = [];
    }
  };
  for (const line of lines) {
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    const pic = PANEL.exec(line.trim());
    if (pic) {
      flush();
      if (opts.panel) out.push(`<figure class="panel"><img src="${esc(opts.panel(pic[1]))}" alt="${esc(pic[2])}" loading="lazy">${pic[2] ? `<figcaption>${inline(pic[2])}</figcaption>` : ''}</figure>`);
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
  return out.join('\n');
}
