// play-now-view.js — paints the Play now tab (rows from play-now.js) and the
// switch between it and the library. The rows show facts only — a count, a
// date; why a row leads is the agent's to say, in the chat.

import { composeRows } from './play-now.js';
import { play } from './lib-view.js';
import { state, savedUi, saveUi } from './state.js';
import { $, esc, plural } from './ui.js';

const LEAD_STORE = 'dj.playNowLead';
const LEAD_TTL = 24 * 3600 * 1000;

const TITLES = { recent: 'Just in', stale: 'Not played in a while', phone: 'On your phone' };

let lead = null;
try {
  const raw = JSON.parse(localStorage.getItem(LEAD_STORE) || 'null');
  if (raw && Date.now() - raw.at < LEAD_TTL) lead = raw.lead;
} catch { /* start with the rules */ }

const pins = () => (Array.isArray(savedUi.pins) ? savedUi.pins : []);

const shortDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

function factLine(row) {
  const bits = [plural(row.count, 'song')];
  if (row.id === 'recent' && row.newest) bits.push(`newest ${shortDate(row.newest)}`);
  if (row.playlist) bits.push(row.last_played ? `last played ${shortDate(row.last_played)}` : 'never played here');
  return bits.join(' · ');
}

const titleOf = (row) => (row.id === 'stale' ? row.playlist : TITLES[row.id] || row.playlist);

let rows = [];

export function renderPlayNow() {
  const el = $('play-now');
  if (!el) return;
  rows = composeRows(state.library, { pins: pins(), lead });
  if (!rows.length) {
    el.innerHTML = '<div class="pn-empty">Nothing to play yet — ask DJ for a set.</div>';
    return;
  }
  el.innerHTML = rows.map((r, i) => `
    <div class="pn-row" data-i="${i}">
      <div class="pn-head">
        <div>
          <div class="pn-kicker">${r.id === 'stale' ? esc(TITLES.stale) : ''}</div>
          <h3 class="pn-title">${esc(titleOf(r))}</h3>
          <div class="pn-fact">${esc(factLine(r))}</div>
        </div>
        <div class="pn-actions">
          <button class="btn small" data-play="${i}">▶ Play</button>
          <button class="btn ghost small pn-pin${r.pinned ? ' on' : ''}" data-pin="${i}"
            title="${r.pinned ? 'Unpin' : 'Pin — keep this row first'}" aria-pressed="${!!r.pinned}">${r.pinned ? '★' : '☆'}</button>
        </div>
      </div>
      <div class="pn-songs">${r.tracks.slice(0, 8).map((t, j) =>
        `<button class="chip" data-song="${i}:${j}">${esc(t.title)}</button>`).join('')}${r.count > 8 ? `<span class="pn-more">+${r.count - 8}</span>` : ''}</div>
    </div>`).join('');
  el.querySelectorAll('[data-play]').forEach((b) => (b.onclick = () => {
    const r = rows[+b.dataset.play];
    play(r.tracks[0], r.tracks);
  }));
  el.querySelectorAll('[data-song]').forEach((b) => (b.onclick = () => {
    const [i, j] = b.dataset.song.split(':').map(Number);
    play(rows[i].tracks[j], rows[i].tracks);
  }));
  el.querySelectorAll('[data-pin]').forEach((b) => (b.onclick = () => togglePin(rows[+b.dataset.pin])));
}

function togglePin(row) {
  const id = row.id === 'stale' ? `list:${row.playlist}` : row.id;
  const cur = pins();
  saveUi({ pins: cur.includes(id) ? cur.filter((p) => p !== id) : [id, ...cur].slice(0, 3) });
  renderPlayNow();
}

/// The agent's lead, from PageUpdate `play_now: { lead }`. Kept a day.
export function applyPlayNow(pn) {
  if (!pn || typeof pn !== 'object') return;
  lead = pn.lead ? String(pn.lead) : null;
  try { localStorage.setItem(LEAD_STORE, JSON.stringify({ at: Date.now(), lead })); } catch { /* live-only */ }
  showTab('now');
  renderPlayNow();
}

// ── the tabs ─────────────────────────────────────────────────────────────────

export function showTab(tab) {
  const now = tab === 'now';
  $('play-now')?.toggleAttribute('hidden', !now);
  document.querySelector('.library-wrap')?.toggleAttribute('hidden', now);
  document.querySelectorAll('.view-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  saveUi({ tab });
}

export function wirePlayNow() {
  document.querySelectorAll('.view-tab').forEach((b) => (b.onclick = () => {
    showTab(b.dataset.tab);
    if (b.dataset.tab === 'now') renderPlayNow();
  }));
  renderPlayNow();
  // First view is Play now — unless they left the page on the library, or
  // there is nothing to play yet.
  showTab(savedUi.tab === 'library' || !rows.length ? 'library' : 'now');
}
