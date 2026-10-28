// beat-host.js — the thin beat wrapper for a small game that keeps only the mount() contract
// (games/mount.js; Hanli 2026-10-16: each small game is built standalone, then embedded). The
// story's board card lays an empty host, `<div data-mount="<task id>">` (cards.js); after every
// draw the page calls `attach()`, and the game — mounted ONCE per board into a node of its own —
// is laid into whatever host the redraw made, so a repaint never restarts it. When it settles,
// `onSettled(board, result)` maps the result to the story (the page: the board's state takes the
// win and its grade, then onWin → the rules' `win`, the pay, beat-won.js). A lost one is dealt again in
// place (a fresh seed), the old play aborted through its `signal`. A pure board module
// (html · act) never comes here: the page draws those itself, as ever.

import { forget, settle, shellFor } from './games/shell.js';

/** How long a lost board stands, its banner up and its sound out, before it is dealt again in place. */
export const AGAIN_MS = 1200;

/** A board whose module keeps only the contract (a `mount`, no `html` of its own), or one that asks for
    its own mount in the story (`meta.beat: 'mount'` — 气走经脉 paints every animation frame itself). */
export const mountOnly = (mod) => Boolean(mod?.mount && (!mod.html || mod.meta?.beat === 'mount'));

/** The board card's body for such a board: the host the game is laid into. */
export const mountHostHtml = (id, esc) => `<div class="game g-mounthost" data-mount="${esc(id)}"></div>`;

/* `prefetch(id, board)`: the page's 台词预取 for a game with moments (games/prefetch.js) — `{ lines, onEvent }` for
   the mount, asked once as the game is mounted; null when there is nothing to ask. */
export function beatHost({ boardFor, lang, onSettled, prefetch = () => null, doc = globalThis.document, againMs = AGAIN_MS }) {
  const hosted = new Map(); // task id → { node, board, stop, round }
  const lay = (id, entry) => {
    for (const host of doc.querySelectorAll('[data-mount]')) if (host.dataset.mount === id && host.firstChild !== entry.node) host.replaceChildren(entry.node);
  };
  const start = (id, g, round = 0) => {
    hosted.get(id)?.stop.abort(); // a board dealt anew: the old play is taken down (its canvas, its camera, its WebGL context)
    const node = doc.createElement('div');
    node.className = 'g-mountnode';
    const stop = new AbortController();
    const entry = { node, board: g, stop, round };
    hosted.set(id, entry);
    const reducedMotion = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    let her = null;
    try { her = prefetch(id, g); } catch (e) { console.warn('[lingjing] prefetch', id, e); }
    const seed = `${g.day ?? ''}|${id}${round ? `|${round}` : ''}`; // 再来 deals a fresh one
    Promise.resolve(g.mod.mount(node, { lang: lang(), reducedMotion, seed, signal: stop.signal, data: g.data ?? {}, winHold: 0, shell: shellFor(id, g.mod.meta?.id), ...(her ?? {}) }))
      .then((result) => {
        if (hosted.get(id) !== entry) return; // dealt again meanwhile: its sound and bed are the new deal's now
        settle(id, result); // its sound, its bed stopped
        // A story board never settles a loss (doc/game-kit.md § the shell): lost, it is dealt again in place under its
        // lead card, as 砸寨 does itself; the stuck rule's 「算了，往下走」 stays the way out. (Found live 10-26: 守灶台
        // lost stood frozen on its last frame, nothing to tap but the skip.)
        // …but a deal that is played once (`once`: 切磋's bout, rules/qiecuo.mjs) ends lost: it settles, and the rules count it.
        if (result && !result.won && !result.left && !g.data?.once) {
          setTimeout(() => {
            if (hosted.get(id) !== entry || boardFor(id) !== g) return;
            forget(id);
            lay(id, start(id, g, round + 1));
          }, againMs);
          return;
        }
        entry.settled = true;
        onSettled(g, result ?? { won: false });
      })
      .catch((e) => console.warn('[lingjing] beat', id, e));
    return entry;
  };
  return {
    /* 收手: the play taken down now (its canvas, its loop, its listeners), and forgotten — opened again, it is dealt fresh. */
    leave(id) { const entry = hosted.get(id); hosted.delete(id); if (entry && !entry.stop.signal.aborted) entry.stop.abort(); },
    attach() {
      const up = new Set();
      for (const host of doc.querySelectorAll('[data-mount]')) {
        const id = host.dataset.mount, g = boardFor(id);
        if (!mountOnly(g?.mod)) continue;
        up.add(id);
        const entry = hosted.get(id)?.board === g ? hosted.get(id) : start(id, g);
        if (host.firstChild !== entry.node) host.replaceChildren(entry.node);
      }
      // A board played out and gone off the stage is taken down: a Phaser kit's loop and WebGL context ran on in the
      // detached node for the rest of the session (measured live 10-26: 守白菜 won, its card gone, 120 frames a second
      // on). The entry stays, so the same board never mounts again; one still in play is never touched.
      for (const [id, entry] of hosted) if (entry.settled && !up.has(id) && !entry.stop.signal.aborted) entry.stop.abort();
    },
  };
}
