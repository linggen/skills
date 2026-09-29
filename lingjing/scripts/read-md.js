// read-md.js — the little markdown the book is written in, as HTML: headings,
// paragraphs, **bold**, > blockquotes, --- rules and pipe tables. Pure: no DOM,
// every word escaped (read.html's reader and its test both use it).
import { esc } from './esc.js';
import { fill } from './state.mjs';

/// The hero the drafts were written with: the name a page with no save shows.
export const HERO = '周星星';

/// The hero from what Look says (`name`), or the drafts' own when there is no
/// save or no name yet.
export const heroOf = (seen) => ({ name: (typeof seen?.name === 'string' && seen.name.trim()) || HERO });

/// A chapter's markdown with the player in it: `{name}` becomes the hero's
/// name (state.mjs `fill`, the scenes' own token). Runs before rendering; the
/// name is a word, never markup, so a `*` or `|` in it is made full-width and
/// can't open bold or split a table row (renderMarkdown escapes the rest).
export function fillHero(md, hero = {}) {
  const name = String(hero.name || HERO).replace(/\*/g, '＊').replace(/\|/g, '｜');
  return fill(String(md ?? ''), { name });
}

const inline = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function renderMarkdown(md) {
  const lines = String(md ?? '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let para = [], quote = [], table = [];
  const flush = () => {
    if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; }
    if (quote.length) { out.push(`<blockquote>${quote.map((l) => `<p>${inline(l)}</p>`).join('')}</blockquote>`); quote = []; }
    if (table.length) {
      const [head, , ...body] = table;
      out.push(`<table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      table = [];
    }
  };
  for (const line of lines) {
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
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
