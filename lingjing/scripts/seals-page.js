// seals-page.js — the 印谱 (Hanli 2026-11-10: 「结印是亮点」): a small sheet of the seals the master has passed on — each with its
// gesture figures, what its spell does, its mastery and what that lends (「飞剑印 · 熟 · 威力 +10%」); the ones he has not been
// taught as outlines, 「师父还没传」. Pure HTML from the rules' `seals book` read (rules/seals.mjs bookView): the figures are its
// geometry (seal-figure.js), the words its own — the page invents none. It stands as a pane of the 储物袋 panel (pouch.js), and
// the phone draws the same rows (linggen-mobile lib/screens/lingjing/lingjing_seals.dart).
import { esc } from './esc.js';

/** One figure (a 100-box of strokes) as inline SVG, in `currentColor`. */
export function figureSvg(hands = [], size = 44) {
  const f = (n) => Number(n).toFixed(1);
  const body = hands.map((h) => `<g class="sfig-hand"><polygon points="${h.poly.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="currentColor" fill-opacity=".26" stroke="currentColor" stroke-opacity=".35" stroke-width="2" stroke-linejoin="round"/>`
    + `<g stroke="currentColor" stroke-opacity=".88" stroke-linecap="round" fill="none">${h.lines.map(([a, b, c, d, w]) => `<line x1="${f(a)}" y1="${f(b)}" x2="${f(c)}" y2="${f(d)}" stroke-width="${f(Math.max(1.5, w))}"/>`).join('')}</g>`
    + `<g fill="currentColor">${h.dots.map(([x, y, r]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(Math.max(1.5, r))}"/>`).join('')}</g></g>`).join('');
  return `<svg class="sfig" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
}

/** One row: a learned seal in full, or an outline. */
function rowHtml(r, book) {
  const w = book.words ?? {};
  const figs = r.figures.map((id) => `<span class="sfigure">${figureSvg(book.figures?.[id]?.hands, 44)}<small>${esc(book.names?.[id]?.name ?? id)}</small></span>`).join('<i class="sarrow" aria-hidden="true">›</i>');
  if (!r.learned) return `<li class="sseal is-outline" data-seal="${esc(r.id)}"><div class="shead"><b>${esc(r.name)}</b><small class="sdim">${esc(w.untaught ?? '')}</small></div><div class="sfigs">${figs}</div></li>`;
  const how = r.via === 'story' ? w.story : r.day ? String(w.learnedOn ?? '').replace('{day}', r.day) : '';
  return `<li class="sseal" data-seal="${esc(r.id)}" data-level="${esc(r.level?.id ?? '')}"><div class="shead"><b>${esc(r.head)}</b>${how ? `<small class="sdim">${esc(how)}</small>` : ''}</div>`
    + `<div class="sfigs">${figs}</div><p class="sdoes">${esc(r.does)}</p><p class="snext sdim">${esc(r.next ?? '')}</p></li>`;
}

/** The sheet: the rows in the master's order. `book`: null while it is read. */
export function sealsHtml(book) {
  if (!book) return '<div class="loading">…</div>';
  const w = book.words ?? {};
  return `<section class="psec sealbook"><div class="cardtitle bagtitle">${esc(w.sheet ?? '')}</div><ol class="sseals">${(book.rows ?? []).map((r) => rowHtml(r, book)).join('')}</ol></section>`;
}
