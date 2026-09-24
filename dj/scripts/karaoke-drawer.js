// karaoke-drawer.js — the karaoke stage's up-next drawer: what's playing, the
// queue (reorder, remove, jump) and add-from-library search.

import { trackKey } from './library.js';
import { esc, plural } from './ui.js';

const $ = (sel) => document.querySelector(sel);

/// `state` is the stage's { queue, index, library }, `go(i)` plays index i.
export function createDrawer({ state, go, stage }) {
  let built = false;

  function renderList() {
    if (!built) return;
    $('#q-count').textContent = plural(state.queue.length, 'song');
    $('#q-list').innerHTML = state.queue.map((t, i) => {
      const on = i === state.index;
      const ctrls = on
        ? '<span class="kq-now">♪ now</span>'
        : `<button class="kq-mini" data-act="up" data-i="${i}" title="Move up">↑</button>
           <button class="kq-mini" data-act="dn" data-i="${i}" title="Move down">↓</button>
           <button class="kq-mini" data-act="rm" data-i="${i}" title="Remove from queue">✕</button>`;
      return `<div class="kq-row ${on ? 'on' : ''}">
        <span class="qi">${i + 1}</span>
        <div class="kq-meta" data-jump="${i}"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></div>
        <span class="kq-ctrls">${ctrls}</span>
      </div>`;
    }).join('');
    $('#q-list').querySelectorAll('[data-jump]').forEach((e) => { e.onclick = () => go(+e.dataset.jump); });
    $('#q-list').querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = (ev) => { ev.stopPropagation(); move(b.dataset.act, +b.dataset.i); };
    });
  }

  // Reorder/remove keep state.index pointing at the still-playing song.
  const MOVES = {
    up: (q, i) => { if (i > 0) [q[i - 1], q[i]] = [q[i], q[i - 1]]; },
    dn: (q, i) => { if (i < q.length - 1) [q[i + 1], q[i]] = [q[i], q[i + 1]]; },
    rm: (q, i) => { if (i !== state.index) q.splice(i, 1); },
  };

  function move(act, i) {
    const cur = state.queue[state.index];
    MOVES[act]?.(state.queue, i);
    state.index = state.queue.indexOf(cur);
    renderList();
  }

  function renderResults() {
    const query = $('#q-search').value.trim().toLowerCase();
    const res = $('#q-results');
    if (!query) { res.innerHTML = ''; return; }
    const inQueue = new Set(state.queue.map(trackKey));
    const matches = (state.library.tracks || [])
      .filter((t) => t.file && `${t.artist} ${t.title}`.toLowerCase().includes(query))
      .slice(0, 8);
    res.innerHTML = matches.map((t) => {
      const has = inQueue.has(trackKey(t));
      return `<div class="kq-res" data-id="${esc(trackKey(t))}">
        <div><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></div>
        <button class="kq-add-btn" ${has ? 'disabled' : ''}>${has ? '✓' : '＋'}</button>
      </div>`;
    }).join('') || '<div class="kq-none">No matches in your library.</div>';
    res.querySelectorAll('.kq-res').forEach((r) => {
      const btn = r.querySelector('.kq-add-btn');
      if (btn.disabled) return;
      btn.onclick = () => {
        const t = (state.library.tracks || []).find((x) => trackKey(x) === r.dataset.id);
        if (t) { state.queue.push(t); renderList(); renderResults(); }
      };
    });
  }

  function build() {
    $('#qdrawer').innerHTML = `
      <div class="kq-head"><b>Up next</b> <span id="q-count"></span></div>
      <div id="q-list"></div>
      <div class="kq-add">
        <input id="q-search" type="search" placeholder="Add a song to the queue…" autocomplete="off" />
        <div id="q-results"></div>
      </div>`;
    $('#q-search').addEventListener('input', renderResults);
    built = true;
    renderList();
  }

  // The drawer shifts the stage over (queue-open) so the controls clear it.
  return {
    open() {
      if (!built) build();
      $('#qdrawer').classList.remove('hidden');
      stage.classList.add('queue-open');
    },
    toggle() {
      if (!built) build();
      const hidden = $('#qdrawer').classList.toggle('hidden');
      stage.classList.toggle('queue-open', !hidden);
    },
    render: renderList,
  };
}
