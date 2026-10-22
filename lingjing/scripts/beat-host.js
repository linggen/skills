// beat-host.js — the thin beat wrapper for a small game that keeps only the mount() contract
// (games/mount.js; Hanli 2026-10-16: each small game is built standalone, then embedded). The
// story's board card lays an empty host, `<div data-mount="<task id>">` (cards.js); after every
// draw the page calls `attach()`, and the game — mounted ONCE per board into a node of its own —
// is laid into whatever host the redraw made, so a repaint never restarts it. When it settles,
// `onSettled(board, result)` maps the result to the story (the page: the board's state takes the
// win and its grade, then onWin → the rules' `win`, the pay, beat-won.js). A pure board module
// (html · act) never comes here: the page draws those itself, as ever.

import { settle, shellFor } from './games/shell.js';

/** A board whose module keeps only the contract (a `mount`, no `html` of its own), or one that asks for
    its own mount in the story (`meta.beat: 'mount'` — 气走经脉 paints every animation frame itself). */
export const mountOnly = (mod) => Boolean(mod?.mount && (!mod.html || mod.meta?.beat === 'mount'));

/** The board card's body for such a board: the host the game is laid into. */
export const mountHostHtml = (id, esc) => `<div class="game g-mounthost" data-mount="${esc(id)}"></div>`;

/* `prefetch(id, board)`: the page's 台词预取 for a game with moments (games/prefetch.js) — `{ lines, onEvent }` for
   the mount, asked once as the game is mounted; null when there is nothing to ask. */
export function beatHost({ boardFor, lang, onSettled, prefetch = () => null, doc = globalThis.document }) {
  const hosted = new Map(); // task id → { node, board }
  const start = (id, g) => {
    const node = doc.createElement('div');
    node.className = 'g-mountnode';
    const entry = { node, board: g };
    hosted.set(id, entry);
    const reducedMotion = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    let her = null;
    try { her = prefetch(id, g); } catch (e) { console.warn('[lingjing] prefetch', id, e); }
    Promise.resolve(g.mod.mount(node, { lang: lang(), reducedMotion, seed: `${g.day ?? ''}|${id}`, data: g.data ?? {}, winHold: 0, shell: shellFor(id, g.mod.meta?.id), ...(her ?? {}) }))
      .then((result) => { settle(id, result); onSettled(g, result ?? { won: false }); }) // its sound, its bed stopped
      .catch((e) => console.warn('[lingjing] beat', id, e));
    return entry;
  };
  return {
    attach() {
      for (const host of doc.querySelectorAll('[data-mount]')) {
        const id = host.dataset.mount, g = boardFor(id);
        if (!mountOnly(g?.mod)) continue;
        const entry = hosted.get(id)?.board === g ? hosted.get(id) : start(id, g);
        if (host.firstChild !== entry.node) host.replaceChildren(entry.node);
      }
    },
  };
}
