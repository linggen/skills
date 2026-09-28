// read-md.js — the little markdown the book is written in, as HTML: headings,
// paragraphs, **bold**, > blockquotes, --- rules and pipe tables. Pure: no DOM,
// every word escaped (read.html's reader and its test both use it).
import { esc } from './esc.js';

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
