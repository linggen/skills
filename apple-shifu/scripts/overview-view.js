// Draws the System Overview (overview.js composes it). Each card is a
// finding: its facts, at most one button, and a ⋯ with Pin / Hide — the
// user's hands on the order, which beat the agent's.

import { esc } from './shifu-io.js';
import { openMenu } from './shifu-shell.js';

/**
 * @param {HTMLElement} el
 * @param {{ cards: object[], layout: object, hiddenCount: number, scanned: boolean,
 *           onAction: (card) => void, onLayout: (cmd: string, id?: string) => void }} v
 */
export function renderOverview(el, { cards, layout, hiddenCount, scanned, weekly = null, onAction, onLayout, onWeekly }) {
  if (!el) return;
  const rows = cards.map((c) => `
    <div class="ov-card ov-${esc(c.tone)}" data-id="${esc(c.id)}">
      <div class="ov-main">
        <div class="ov-label">${esc(c.label)}${layout.pinned === c.id ? ' <span class="ov-pin">· pinned</span>' : ''}</div>
        <div class="ov-title">${esc(c.title)}</div>
        ${c.sub ? `<div class="ov-sub">${esc(c.sub)}</div>` : ''}
      </div>
      <div class="ov-side">
        ${c.action ? `<button class="media-cta sm ov-act" type="button">${esc(c.action.label)}</button>` : ''}
        <button class="ov-more menu-anchor" type="button" aria-label="More" title="Pin or hide">⋯</button>
      </div>
    </div>`).join('');
  const quiet = !scanned
    ? '<div class="ov-quiet">No system scan yet — ↻ Scan → Full rescan.</div>'
    : cards.length ? '' : '<div class="ov-quiet">Nothing needs you right now.</div>';
  const hidden = hiddenCount
    ? `<button class="ov-link" type="button" data-cmd="show-all">${hiddenCount} hidden · show</button>` : '';
  const why = layout.why && layout.lead && cards.some((c) => c.id === layout.lead)
    ? '<button class="ov-link" type="button" data-cmd="why">Why this order</button>' : '';
  // The opt-in weekly check (missions/weekly-check). Absent when the engine
  // does not list the mission, rather than a switch that does nothing.
  const week = weekly
    ? `<button class="ov-link" type="button" data-cmd="weekly" title="Mondays: free space, what can be cleared, the backup gap — one line. Never deletes.">Weekly check: ${weekly.enabled ? 'on' : 'off'}</button>` : '';
  el.innerHTML = `${rows}${quiet}
    <div class="ov-foot">${why}${hidden}${week}</div>
    <p class="ov-why" hidden>${esc(layout.why || '')}</p>`;

  for (const card of el.querySelectorAll('.ov-card')) {
    const c = cards.find((x) => x.id === card.dataset.id);
    const act = card.querySelector('.ov-act');
    if (act) act.onclick = () => onAction(c);
    const more = card.querySelector('.ov-more');
    more.onclick = () => openMenu(more, [
      layout.pinned === c.id
        ? { label: 'Unpin', run: () => onLayout('unpin') }
        : { label: 'Pin to the top', run: () => onLayout('pin', c.id) },
      { label: 'Hide', hint: 'bring it back from the foot of the page', run: () => onLayout('hide', c.id) },
    ]);
  }
  const showAll = el.querySelector('[data-cmd="show-all"]');
  if (showAll) showAll.onclick = () => onLayout('show', 'all');
  const weekBtn = el.querySelector('[data-cmd="weekly"]');
  if (weekBtn) weekBtn.onclick = () => onWeekly?.(!weekly.enabled);
  const whyBtn = el.querySelector('[data-cmd="why"]');
  if (whyBtn) {
    whyBtn.onclick = () => {
      const p = el.querySelector('.ov-why');
      p.hidden = !p.hidden;
    };
  }
}
