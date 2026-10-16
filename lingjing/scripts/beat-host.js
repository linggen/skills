// beat-host.js — the thin beat wrapper for a small game that keeps only the mount() contract
// (games/mount.js; Hanli 2026-10-16: each small game is built standalone, then embedded). The
// story's board card lays an empty host, `<div data-mount="<task id>">` (cards.js); after every
// draw the page calls `attach()`, and the game — mounted ONCE per board into a node of its own —
// is laid into whatever host the redraw made, so a repaint never restarts it. When it settles,
// `onSettled(board, result)` maps the result to the story (the page: the board's state takes the
// win and its grade, then onWin → the rules' `win`, the pay, beat-won.js). A pure board module
// (html · act) never comes here: the page draws those itself, as ever.

/** A board whose module keeps only the contract (a `mount`, no `html` of its own). */
export const mountOnly = (mod) => Boolean(mod?.mount && !mod.html);

/** The board card's body for such a board: the host the game is laid into. */
export const mountHostHtml = (id, esc) => `<div class="game g-mounthost" data-mount="${esc(id)}"></div>`;

export function beatHost({ boardFor, lang, onSettled, doc = globalThis.document }) {
  const hosted = new Map(); // task id → { node, board }
  const start = (id, g) => {
    const node = doc.createElement('div');
    node.className = 'g-mountnode';
    const entry = { node, board: g };
    hosted.set(id, entry);
    const reducedMotion = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    Promise.resolve(g.mod.mount(node, { lang: lang(), reducedMotion, seed: `${g.day ?? ''}|${id}`, data: g.data ?? {}, winHold: 0 }))
      .then((result) => onSettled(g, result ?? { won: false }))
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
