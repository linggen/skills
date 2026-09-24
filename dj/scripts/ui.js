// ui.js — the page helpers every DJ page shares: element lookup, HTML
// escaping, the toast, and the confirm dialog (window.confirm is a silent
// no-op inside the app shell's sandboxed iframe).

export const $ = (id) => document.getElementById(id);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/// A toast bound to one element. It sets textContent, so callers pass plain
/// text — never esc()'d, or "&" shows up as "&amp;".
export function makeToast(id, ms = 5000) {
  let timer = null;
  return (msg) => {
    const el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.add('hidden'), ms);
  };
}

/// Resolves true on the action button; false on Cancel, Escape, or a click on
/// the backdrop. `message` is plain text.
export function confirmDialog(message, actionLabel, danger = false) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'dj-modal';
    box.innerHTML = `
      <div class="dj-confirm">
        <div class="dj-confirm-msg">${esc(message)}</div>
        <div class="dj-confirm-row">
          <button class="btn ghost small" data-cf="no">Cancel</button>
          <button class="btn small${danger ? ' danger' : ''}" data-cf="yes">${esc(actionLabel)}</button>
        </div>
      </div>`;
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    const done = (v) => {
      box.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    box.onclick = (e) => { if (e.target === box) done(false); };
    box.querySelector('[data-cf="no"]').onclick = () => done(false);
    box.querySelector('[data-cf="yes"]').onclick = () => done(true);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(box);
    box.querySelector('[data-cf="yes"]').focus();
  });
}

/// Trailing-edge debounce.
export function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
