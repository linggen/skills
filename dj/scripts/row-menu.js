// row-menu.js — the one menu a library card's verbs live in, opened from its ⋯
// or by right-click (the desktop's long-press). Fixed to the window, so the
// last column's menu is not clipped by the scroller.

import { $, esc } from './ui.js';

export function closeRowMenu() {
  const menu = $('row-menu');
  if (menu) { menu.hidden = true; menu.dataset.for = ''; }
}

/// Pin the menu under its anchor, pulled back inside the window on both axes.
function placeMenu(menu, anchor) {
  const a = anchor.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  const x = Math.max(8, Math.min(a.left, window.innerWidth - m.width - 8));
  const y = a.bottom + m.height + 8 > window.innerHeight ? Math.max(8, a.top - m.height - 4) : a.bottom + 4;
  menu.style.left = `${Math.round(x)}px`;
  menu.style.top = `${Math.round(y)}px`;
}

/// A second open for the same key closes it, and so does a click anywhere
/// else. `verbs` is [{ act, label, icon, sep?, danger? }]; `run(act)` acts.
export function showRowMenu(key, anchor, verbs, run) {
  const menu = $('row-menu');
  if (!menu || !anchor) return;
  if (!menu.hidden && menu.dataset.for === key) { closeRowMenu(); return; }
  menu.dataset.for = key;
  menu.innerHTML = verbs
    .map((v) => `<button class="pl-opt${v.sep ? ' sep' : ''}${v.danger ? ' danger' : ''}" data-verb="${v.act}">` +
      `<span class="opt-i">${v.icon}</span>${esc(v.label)}</button>`)
    .join('');
  // Measure it where it cannot widen the page, then move it into place.
  menu.style.left = '-9999px';
  menu.style.top = '0px';
  menu.hidden = false;
  placeMenu(menu, anchor);
  menu.querySelectorAll('[data-verb]').forEach((b) => (b.onclick = () => {
    closeRowMenu();
    run(b.dataset.verb);
  }));
  const away = (e) => {
    if (e.target.closest('#row-menu')) return;
    closeRowMenu();
    document.removeEventListener('click', away, true);
    document.removeEventListener('contextmenu', away, true);
  };
  setTimeout(() => {
    document.addEventListener('click', away, true);
    document.addEventListener('contextmenu', away, true);
  }, 0);
}
